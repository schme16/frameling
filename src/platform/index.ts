/**
 * Where Frameling is running, worked out once at start-up. The desktop app's preload script puts the bridge on
 * `window.frameling` before the page loads. In a plain browser tab there is none, so `installPlatform` builds the same
 * bridge in the page (src/platform/web). Everything else talks to the bridge through `desktop()` (src/io/desktop.ts)
 * and asks this module about the few things that differ, rather than checking for Electron itself.
 */
import type { FramelingApi } from '../preload/api';
import { dismissToast, toast } from '../ui/toast';
import { ask } from './ask';
import { createSaveOffers, GESTURE_EVENTS, isSafariLike, needsFreshClick } from './saveReady';
import { openDb } from './web/idb';
import { createWebApi, describeWebPath, type FileHandleLike, type Pickers, type WebApi } from './web/web';

export type PlatformKind = 'desktop' | 'web' | 'none';

declare const __FRAMELING_VERSION__: string | undefined;

function bridge(): FramelingApi | undefined {
  return typeof window !== 'undefined' ? (window as { frameling?: FramelingApi }).frameling : undefined;
}

export function platformKind(): PlatformKind {
  const b = bridge();
  if (!b?.files) return 'none';
  return b.kind ?? 'desktop';
}

export const isWeb = (): boolean => platformKind() === 'web';

export type Feature = 'showInFolder' | 'nativeMenus' | 'closeWithSave';

/** Things only the desktop app can do. Anything else works the same everywhere (in its own way). */
export function can(feature: Feature): boolean {
  switch (feature) {
    case 'showInFolder':
    case 'nativeMenus':
    case 'closeWithSave':
      return platformKind() === 'desktop';
  }
}

/** Plain words for where a recent file lives ("in /home/me/art", "on this computer"). */
export function describePlace(path: string, folderOf: (p: string) => string): string {
  const web = describeWebPath(path);
  if (web) return web;
  return `in ${folderOf(path) || path}`;
}

/** `darwin`, `win32` or `linux` from the browser, so shortcuts read Cmd on a Mac. */
export function guessOs(nav: { platform?: string; userAgent?: string; userAgentData?: { platform?: string } } = typeof navigator !== 'undefined' ? navigator : {}): string {
  const s = `${nav.userAgentData?.platform ?? ''} ${nav.platform ?? ''} ${nav.userAgent ?? ''}`;
  if (/mac|iphone|ipad/i.test(s)) return 'darwin';
  if (/win/i.test(s)) return 'win32';
  return 'linux';
}

function saveNow(name: string, bytes: Uint8Array): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart]));
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

/** When the person last clicked, touched or pressed a key in the page (ms, 0 = never). */
let lastGestureAt = 0;
let watchingGestures = false;

function watchGestures(): void {
  if (watchingGestures || typeof window === 'undefined') return;
  watchingGestures = true;
  for (const t of GESTURE_EVENTS) window.addEventListener(t, () => (lastGestureAt = performance.now()), { capture: true, passive: true });
}

const offers = createSaveOffers({
  save: saveNow,
  show: (message, onSave) => toast(message, { kind: 'success', duration: 0, quill: null, sound: null, action: { label: 'Save', run: onSave } }),
  hide: (id) => dismissToast(id),
});

/** Saves the files that finished too late to download on their own. Returns how many there were. */
export const saveWaitingFiles = (): number => offers.saveAll();
export const waitingFiles = (): number => offers.pending();

/** Hands the bytes to the browser as a download, or (in Safari, long after the last click) offers a Save button first. */
export function download(name: string, bytes: Uint8Array): void {
  const since = lastGestureAt ? performance.now() - lastGestureAt : Infinity;
  if (typeof navigator !== 'undefined' && needsFreshClick(isSafariLike(navigator.userAgent), since)) offers.offer(name, bytes);
  else offers.direct(name, bytes);
}

/** Runs `run` once the file just written is really with the browser (at once, or after Save is pressed in a held case). */
export const whenSaved = (run: () => void): void => offers.whenSaved(run);

export function pickUpload(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

let web: WebApi | null = null;

/** The web bridge, when this is the web build. */
export const webApi = (): WebApi | null => web;

let savedHook: (() => void) | null = null;
/** What to do after each autosave to the browser's storage (set by install.ts, which has the UI to hand). */
export const setSavedHook = (fn: (() => void) | null): void => void (savedHook = fn);

/** Builds the browser bridge when there's no desktop one. Run once, before the app starts. */
export function installPlatform(): void {
  if (typeof window === 'undefined' || bridge()?.files) return;
  const w = window as unknown as Pickers & { frameling?: FramelingApi };
  watchGestures();
  web = createWebApi({
    db: typeof indexedDB !== 'undefined' ? openDb() : Promise.reject(new Error('no IndexedDB')),
    pickers: {
      showOpenFilePicker: w.showOpenFilePicker?.bind(window),
      showSaveFilePicker: w.showSaveFilePicker?.bind(window),
      showDirectoryPicker: w.showDirectoryPicker?.bind(window),
    },
    download,
    pickUpload,
    ask,
    appVersion: typeof __FRAMELING_VERSION__ === 'string' ? __FRAMELING_VERSION__ : '',
    platform: guessOs(),
    onSaved: () => savedHook?.(),
    events: window,
  });
  w.frameling = web;
  // An installed web app opened with a .frameling file (the manifest's file_handlers).
  const lq = (window as unknown as { launchQueue?: { setConsumer(fn: (p: { files: FileHandleLike[] }) => void): void } }).launchQueue;
  lq?.setConsumer((p) => void web?.receiveFiles(p.files ?? []));
}
