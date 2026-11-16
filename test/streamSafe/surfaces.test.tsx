// @vitest-environment jsdom
// Stream-safe on the real screens: nothing of the real path, file name, name or contact is left on the page, it
// follows the switch live, and the badge, the command and the preference agree with each other. The document itself is
// never touched.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { streamSafe, setStreamSafe } from '../../src/core/streamSafe';
import { openRecentDialog } from '../../src/io/RecentDialog';
import { documentTitle } from '../../src/io/document';
import { shownRecent } from '../../src/io/recentShown';
import { StreamSafeBadge } from '../../src/streamsafe/StreamSafeBadge';
import '../../src/streamsafe';
import { getPrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';
import { clearToasts, toast } from '../../src/ui/toast';
import { ToastView } from '../../src/ui/ToastView';
import type { RecentFile } from '../../src/preload/api';
import { WAIT_CEILING_MS } from '../helpers/waits';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SECRETS = ['shane', 'secret-client', 'taxes', 'ball-of-doom', 'Dropbox'];
const files: RecentFile[] = [
  { path: '/home/shane/Dropbox/secret-client/ball-of-doom.frameling', name: 'ball-of-doom', openedAt: Date.now() },
  { path: '/home/shane/taxes/old.frameling', name: 'old', openedAt: Date.now() - 86400000 },
];
const noSecrets = (text: string) => {
  for (const s of SECRETS) expect(text.toLowerCase(), `"${s}" leaked`).not.toContain(s.toLowerCase());
};

let host: HTMLElement;
let root: Root;
beforeEach(() => {
  resetPrefs();
  clearToasts();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  (window as unknown as { frameling: unknown }).frameling = {
    versions: { app: 'test', electron: '', chrome: '' },
    files: {},
    recent: { list: async () => files, remove: async () => undefined, clear: async () => undefined, add: async () => undefined, preview: async () => ({ state: 'picture', url: 'data:image/png;base64,AAAA' }) },
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.querySelectorAll('.io-backdrop').forEach((e) => e.remove());
  setStreamSafe(false);
  resetPrefs();
  clearToasts();
});

describe('the switch, the preference, the command and the badge', () => {
  it('is off by default and the badge is not there', async () => {
    expect(getPrefs().streamSafe).toBe(false);
    expect(streamSafe()).toBe(false);
    await act(async () => root.render(<StreamSafeBadge />));
    expect(host.querySelector('[data-testid="streamSafe.badge"]')).toBeNull();
  });
  it('the preference turns it on, and the badge shows up and says so', async () => {
    await act(async () => root.render(<StreamSafeBadge />));
    await act(async () => setPrefs({ streamSafe: true }));
    expect(streamSafe()).toBe(true);
    expect(host.querySelector('[data-testid="streamSafe.badge"]')?.textContent).toContain('Stream-safe');
  });
  it('the command flips it, is ticked while on, and pressing the badge turns it off', async () => {
    const cmd = getCommand('view.streamSafe')!;
    expect(cmd.checked?.(store().get())).toBe(false);
    await act(async () => root.render(<StreamSafeBadge />));
    await act(async () => cmd.run());
    expect(getPrefs().streamSafe).toBe(true);
    expect(cmd.checked?.(store().get())).toBe(true);
    await act(async () => void host.querySelector<HTMLButtonElement>('[data-testid="streamSafe.badge"]')!.click());
    expect(getPrefs().streamSafe).toBe(false);
    expect(host.querySelector('[data-testid="streamSafe.badge"]')).toBeNull();
  });
  it('is remembered with the other preferences', async () => {
    setPrefs({ streamSafe: true });
    expect(JSON.parse(localStorage.getItem('frameling.prefs.v1') ?? '{}').streamSafe).toBe(true);
  });
});

describe('the recent lists', () => {
  it('show the real names when off, stand-ins when on, and the real file is always kept', () => {
    expect(shownRecent(files).map((s) => s.name)).toEqual(['ball-of-doom', 'old']);
    setStreamSafe(true);
    const s = shownRecent(files);
    expect(s.map((x) => x.name)).toEqual(['My drawing 1', 'My drawing 2']);
    expect(s.map((x) => x.file.path)).toEqual(files.map((f) => f.path));
    noSecrets(JSON.stringify(s.map((x) => [x.name, x.place, x.tip])));
  });
  it('Open recent shows no real name, folder or picture, even when switched on while open', async () => {
    await act(async () => void openRecentDialog());
    await act(async () => undefined);
    // Each wait step runs inside its own act, because React only flushes what the dialog sets when an act ends.
    const end = Date.now() + WAIT_CEILING_MS;
    while (!document.querySelector('.io-recent')?.textContent?.includes('ball-of-doom') && Date.now() < end) await act(async () => void (await new Promise((r) => setTimeout(r, 10))));
    expect(document.querySelector('.io-recent')!.textContent).toContain('ball-of-doom');
    await act(async () => setStreamSafe(true));
    const list = document.querySelector('.io-recent')!;
    noSecrets(list.innerHTML);
    expect(list.textContent).toContain('My drawing 1');
    expect(list.querySelector('img'), 'a picture of a drawing can give it away').toBeNull();
    await act(async () => setStreamSafe(false));
    expect(document.querySelector('.io-recent')!.textContent).toContain('ball-of-doom');
  });
});

describe('toasts and the title', () => {
  it('a toast with a path in it shows the stand-in, and turning it on hides one already showing', async () => {
    await act(async () => root.render(<ToastView />));
    await act(async () => void toast('Could not save "/home/shane/Dropbox/secret-client/ball-of-doom.frameling" just now.', { kind: 'error' }));
    expect(host.textContent).toContain('ball-of-doom');
    await act(async () => setStreamSafe(true));
    noSecrets(host.textContent ?? '');
    expect(host.textContent).toContain('My drawing');
    // The words of the toast itself were never changed.
    await act(async () => setStreamSafe(false));
    expect(host.textContent).toContain('ball-of-doom');
  });
  it('the window title uses the stand-in, and the document is untouched', () => {
    store().setUi({ filePath: files[0].path });
    const before = JSON.stringify(store().rootDoc());
    expect(documentTitle()).toBe('ball-of-doom');
    setStreamSafe(true);
    expect(documentTitle()).toBe('My drawing');
    noSecrets(documentTitle());
    expect(store().get().ui.filePath).toBe(files[0].path);
    expect(JSON.stringify(store().rootDoc())).toBe(before);
    store().setUi({ filePath: null });
  });
});
