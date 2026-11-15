// Live review, the Electron half: the IPC the sharer's window calls, the reviewer's window, and the message ports that join
// them to the bridges (reviewHost.ts, reviewGuest.ts), which hold the rules. Nothing is written to disk but the reviewer's
// own words while a review lasts (a copy of what is not yet acknowledged), and the code is never logged.
import { BrowserWindow, MessageChannelMain, dialog, shell, type MessagePortMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { deflate, inflate } from 'node:zlib';
import { parseCode, type ShareCode } from '../share/code';
import { makeLoopback } from '../share/loopback';
import type { MakeSwarm } from '../share/swarm';
import { MAX_MESSAGE_BYTES } from '../review/codec';
import { writeComments } from '../review/commentsFile';
import { readPictureAsk } from './reviewPicture';
import type { Squeeze } from '../review/pack';
import { ReviewGuestBridge } from './reviewGuest';
import { ReviewHostBridge, type PortLike } from './reviewHost';
import { writeFileAtomic } from './store';

type Handle = (channel: string, fn: (e: unknown, ...args: any[]) => unknown) => void;

const deflateAsync = promisify(deflate);
const inflateAsync = promisify(inflate);
export const squeeze: { deflate: Squeeze; inflate: Squeeze } = {
  // Level 1: pixels compress well and the point is not to cost the machine that is also drawing.
  deflate: async (b) => new Uint8Array(await deflateAsync(b, { level: 1 })),
  // A cap on what a small message may inflate to, so a hostile peer cannot ask for the whole memory.
  inflate: async (b) => new Uint8Array(await inflateAsync(b, { maxOutputLength: MAX_MESSAGE_BYTES })),
};

/** Electron's port made to look like the least this needs. */
function wrap(p: MessagePortMain): PortLike {
  return {
    postMessage: (m) => {
      try {
        p.postMessage(m);
      } catch {
        // A message that cannot be copied is dropped; the link keeps going.
      }
    },
    onMessage: (fn) => {
      p.on('message', (e) => fn(e.data));
      p.start();
    },
    close: () => {
      try {
        p.close();
      } catch {
        // Already closed.
      }
    },
  };
}

interface Opts {
  /** dist/main */
  dir: string;
  dataDir(): string;
  makeSwarm: MakeSwarm;
}

export interface ReviewControl {
  /** Ends the review you are sharing (the drawing window was loaded again, so it lost its end of the port). */
  stopHost(): void;
  /** Ends everything (the drawing window is going). */
  stopAll(): void;
}

export function registerReviewIpc(handle: Handle, win: () => BrowserWindow | null, o: Opts): ReviewControl {
  const swarm: MakeSwarm = process.env.FRAMELING_REVIEW_LOOPBACK ? makeLoopback : o.makeSwarm;
  let host: ReviewHostBridge | null = null;
  const guests = new Set<{ leave(): void; win: BrowserWindow; askSave(): void }>();
  const tell = (channel: string, payload: unknown) => {
    const w = win();
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  };

  const stopHost = () => {
    host?.stop();
    host = null;
  };

  handle('review:start', (_e, opts: unknown) => {
    stopHost();
    const name = typeof (opts as { name?: unknown })?.name === 'string' ? String((opts as { name: string }).name).slice(0, 80) : 'Untitled';
    const w = win();
    if (!w) return { ok: false };
    const { port1, port2 } = new MessageChannelMain();
    // port1 goes to the drawing window (its mirror talks to it); port2 stays here with the bridge.
    w.webContents.postMessage('review:port', null, [port1]);
    host = new ReviewHostBridge({ makeSwarm: swarm, port: wrap(port2), ui: (e) => tell('review:event', e), sharerName: () => name, ...squeeze });
    host.start();
    return { ok: true };
  });
  handle('review:stop', () => stopHost());
  handle('review:admit', (_e, conn: unknown) => typeof conn === 'number' && host?.admit(conn));
  handle('review:refuse', (_e, conn: unknown) => typeof conn === 'number' && host?.refuse(conn));
  handle('review:remove', (_e, seat: unknown) => typeof seat === 'number' && host?.remove(seat));
  handle('review:pointer', (_e, x: unknown, y: unknown, off: unknown) => {
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) host?.pointer(x, y, off === true);
  });
  handle('review:ack', (_e, seat: unknown, ids: unknown) => {
    if (typeof seat === 'number' && Array.isArray(ids)) host?.ack(seat, ids.filter((i): i is string => typeof i === 'string').slice(0, 500));
  });

  // The palette command in the drawing window: the review window you looked at last saves its picture.
  handle('review:savePicture', () => {
    const open = [...guests].filter((g) => !g.win.isDestroyed());
    const g = open.find((x) => x.win.isFocused()) ?? open[open.length - 1];
    if (!g) return { ok: false };
    g.askSave();
    return { ok: true };
  });

  handle('review:join', (_e, codeText: unknown, nameText: unknown) => {
    const parsed = typeof codeText === 'string' ? parseCode(codeText) : null;
    if (!parsed?.ok) return { ok: false };
    const name = typeof nameText === 'string' ? nameText.slice(0, 80) : '';
    openReviewer(parsed.code, name);
    return { ok: true };
  });

  function openReviewer(code: ShareCode, name: string): void {
    const rw = new BrowserWindow({
      width: 1100,
      height: 760,
      minWidth: 420,
      minHeight: 320,
      title: 'Live review',
      ...(process.platform === 'darwin' ? {} : { icon: path.join(o.dir, 'icon.png') }),
      backgroundColor: '#121019',
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        // The picture window's own preload: it can pass on a message port and nothing else. The page has no files, no
        // network and no app calls, so there is nothing in it that could edit a drawing.
        preload: path.join(o.dir, '../preload/popout.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    rw.once('ready-to-show', () => rw.show());
    const wc = rw.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e) => e.preventDefault());

    const gid = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const file = path.join(o.dataDir(), `review-outbox-${gid}.json`);
    const { port1, port2 } = new MessageChannelMain();
    const page = wrap(port2);
    // The window asks to save what it has written. That is not a message to the sharer, so it is caught here and never reaches the bridge.
    const inner: PortLike = {
      postMessage: page.postMessage,
      close: page.close,
      onMessage: (fn) =>
        page.onMessage((m) => {
          const t = (m as { t?: unknown })?.t;
          if (t === 'save') void saveComments();
          else if (t === 'savePicture') void savePicture(m);
          else fn(m);
        }),
    };
    const bridge = new ReviewGuestBridge({
      makeSwarm: swarm,
      port: inner,
      code,
      name,
      gid,
      ...squeeze,
      keep: (box) => {
        try {
          if (box) writeFileAtomic(file, JSON.stringify(box));
          else fs.rmSync(file, { force: true });
        } catch {
          // Not being able to keep a spare copy is not worth stopping a review for.
        }
      },
    });
    async function saveComments(): Promise<void> {
      const r = await dialog.showSaveDialog(rw, { title: 'Save my comments', defaultPath: 'review-comments.json', filters: [{ name: 'Review comments', extensions: ['json'] }] });
      if (r.canceled || !r.filePath) return page.postMessage({ t: 'saved', ok: false });
      try {
        fs.writeFileSync(r.filePath, writeComments(name || 'A reviewer', bridge.outbox.all(), Date.now()));
        page.postMessage({ t: 'saved', ok: true });
      } catch {
        page.postMessage({ t: 'saved', ok: false });
      }
    }
    // The window sends the picture it holds as a PNG: checked here, then the person says where it goes.
    async function savePicture(m: unknown): Promise<void> {
      const ask = readPictureAsk(m);
      if (!ask) return page.postMessage({ t: 'pictureSaved', ok: false });
      const r = await dialog.showSaveDialog(rw, { title: 'Save this picture', defaultPath: ask.fileName, filters: [{ name: 'PNG picture', extensions: ['png'] }] });
      // Closing the dialog is not a failure: nothing is said.
      if (r.canceled || !r.filePath) return page.postMessage({ t: 'pictureSaved', ok: null });
      try {
        fs.writeFileSync(r.filePath, ask.png);
        page.postMessage({ t: 'pictureSaved', ok: true });
      } catch {
        page.postMessage({ t: 'pictureSaved', ok: false });
      }
    }
    const entry = { leave: () => bridge.leave(), win: rw, askSave: () => page.postMessage({ t: 'savePictureNow' }) };
    guests.add(entry);
    wc.once('did-finish-load', () => {
      wc.postMessage('popout:port', null, [port1]);
      bridge.start();
    });
    rw.once('closed', () => {
      guests.delete(entry);
      bridge.leave();
      // Everything handed over: the spare copy has done its job. Anything not is left, and the person was offered Save my comments.
      if (!bridge.outbox.waiting) fs.rmSync(file, { force: true });
    });
    const dev = process.env.FRAMELING_DEV_URL;
    if (dev) void rw.loadURL(new URL('popout.html?review=1', dev).toString());
    else void rw.loadFile(path.join(o.dir, '../popout/popout.html'), { search: 'review=1' });
  }

  return {
    stopHost,
    stopAll: () => {
      stopHost();
      for (const g of [...guests]) {
        g.leave();
        if (!g.win.isDestroyed()) g.win.close();
      }
    },
  };
}
