// The page's one remote door: the real link, wired to the desktop side, the store, the Scripts sandbox and Stop everything.
import { audience } from '../audience';
import { drawingAt, findLayer } from '../core/doc';
import { getCommand } from '../core/registry';
import { store } from '../core/store';
import { rootDoc } from '../core/symbols';
import { withoutNotes } from '../notes/model';
import { desktop } from '../io/desktop';
import { appCommands, appRun, appSet } from '../plugins/appBridge';
import { toast } from '../ui/toast';
import { anyOverlayOpen } from '../ui/overlays';
import { MODAL_SELECTOR } from '../ui/layers';
import { running } from '../scripts/state';
import { createDriver, type ScriptResult } from './driver';
import { createRemoteLink } from './link';
import { note } from './log';
import { lastDriven, preferredRemotePort, remoteStatus } from './state';
import type { DocLike } from './rules';

let pointerDown = false;

/** Watches for a pointer button held down on the page, only while the door is open. A button seen up on a move clears it, so a lost "up" cannot lock the door shut. */
function watchPointer(): () => void {
  const down = () => void (pointerDown = true);
  const up = () => void (pointerDown = false);
  const move = (e: PointerEvent) => {
    if (e.buttons === 0) pointerDown = false;
  };
  const opts = { capture: true, passive: true } as const;
  window.addEventListener('pointerdown', down, opts);
  window.addEventListener('pointerup', up, opts);
  window.addEventListener('pointercancel', up, opts);
  window.addEventListener('pointermove', move, opts);
  window.addEventListener('blur', up);
  return () => {
    window.removeEventListener('pointerdown', down, opts);
    window.removeEventListener('pointerup', up, opts);
    window.removeEventListener('pointercancel', up, opts);
    window.removeEventListener('pointermove', move, opts);
    window.removeEventListener('blur', up);
    pointerDown = false;
  };
}

/** Stop everything (and the audience switch going off by the kill button) shuts this door too: a remote caller is not exempt from it. */
function watchStopEverything(): () => void {
  let kills = audience.snapshot().counts.kills;
  return audience.subscribe(() => {
    const k = audience.snapshot().counts.kills;
    if (k > kills) {
      kills = k;
      void remoteLink.close('Stop everything was pressed.');
    }
  });
}

async function runScript(code: string, name: string): Promise<ScriptResult> {
  const [{ startRun }, control] = await Promise.all([import('../scripts/runner'), import('../scripts/control')]);
  const r = startRun({ id: 'remote', name, code });
  // So Stop the running script (and Stop everything) can end it like any other run.
  control.adoptRun(r);
  const o = await r.done;
  return { ok: o.ok, message: o.message, line: o.line, ended: o.ended, changes: o.changes, ms: o.ms, printed: o.printed.slice(0, 200).map((p) => ({ level: p.level, text: p.text.slice(0, 500) })) };
}

const driver = createDriver({
  commands: appCommands,
  press: appRun,
  choose: appSet,
  group: { start: () => store().startGroup(), end: (m, label) => store().endGroup(m as ReturnType<ReturnType<typeof store>['startGroup']>, label), abort: (m) => store().abortGroup(m as ReturnType<ReturnType<typeof store>['startGroup']>) },
  isOpen: () => remoteLink.isWanted() && remoteStatus.get().running,
  busy: () => ({
    pointerDown,
    dialogOpen: anyOverlayOpen() || !!document.querySelector(MODAL_SELECTOR),
    scriptRunning: !!running.get(),
  }),
  state: () => {
    const { doc, ui } = store().get();
    const layer = findLayer(doc, ui.activeLayerId);
    return { frame: ui.frame, frames: doc.length, activeLayerId: ui.activeLayerId, selection: [...ui.selection], drawingId: layer ? (drawingAt(doc, layer, ui.frame)?.id ?? null) : null, dirty: ui.dirty, undoSteps: store().historyList().done.length };
  },
  doc: () => withoutNotes(rootDoc(store().rootDoc())) as unknown as DocLike,
  runScript,
  touched: () => lastDriven.set(Date.now()),
  labelOf: (id) => getCommand(id)?.label,
});

export const remoteLink = createRemoteLink({
  bridge: () => desktop()?.remote ?? null,
  port: preferredRemotePort,
  setStatus: (s) => remoteStatus.set(s),
  answer: (op) => driver.answer(op),
  said: (what, why) => {
    const port = remoteStatus.get().port;
    if (what === 'opened') note(`Remote door switched on (port ${remoteStatus.get().port})`, 'done');
    else if (what === 'closed') {
      note('Remote door switched off', 'done', why);
      if (why) toast(`The remote door is off. ${why}`, { kind: 'info' });
    } else if (what === 'busy') toast(`The remote door could not open: port ${port} is taken by another program. Pick another in Preferences > Plugins.`, { kind: 'warn' });
    else toast('The remote door could not open. Try again from Preferences > Plugins.', { kind: 'warn' });
  },
  whileOpen: () => {
    const offs = [watchPointer(), watchStopEverything()];
    return () => offs.forEach((f) => f());
  },
});
