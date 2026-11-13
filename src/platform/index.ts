/**
 * Where Frameling is running. The desktop app's preload script puts the bridge on `window.frameling` before the page
 * loads, and everything else talks to it through `desktop()` (src/io/desktop.ts), asking this module about the few
 * things that are the renderer's own job rather than the bridge's.
 */
import type { FramelingApi } from '../preload/api';

export type PlatformKind = 'desktop' | 'none';

function bridge(): FramelingApi | undefined {
  return typeof window !== 'undefined' ? (window as { frameling?: FramelingApi }).frameling : undefined;
}

export function platformKind(): PlatformKind {
  return bridge()?.files ? 'desktop' : 'none';
}

export type Feature = 'showInFolder' | 'nativeMenus' | 'closeWithSave';

/** Things that need the desktop app around them. Without the bridge (tests, a bare page) they are off. */
export function can(feature: Feature): boolean {
  switch (feature) {
    case 'showInFolder':
    case 'nativeMenus':
    case 'closeWithSave':
      return platformKind() === 'desktop';
  }
}

/** Plain words for where a recent file lives ("in /home/me/art"). */
export function describePlace(path: string, folderOf: (p: string) => string): string {
  return `in ${folderOf(path) || path}`;
}

/** `darwin`, `win32` or `linux`, so shortcuts read Cmd on a Mac. */
export function guessOs(nav: { platform?: string; userAgent?: string; userAgentData?: { platform?: string } } = typeof navigator !== 'undefined' ? navigator : {}): string {
  const s = `${nav.userAgentData?.platform ?? ''} ${nav.platform ?? ''} ${nav.userAgent ?? ''}`;
  if (/mac|iphone|ipad/i.test(s)) return 'darwin';
  if (/win/i.test(s)) return 'win32';
  return 'linux';
}

/** Hands bytes to the window as a download, for the few things saved without the file picker (a workspace file). */
export function download(name: string, bytes: Uint8Array): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart]));
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

/** Runs `run` once the file just written is really saved. Nothing is ever held back, so that is now. */
export const whenSaved = (run: () => void): void => run();

/** Asks for a file with the window's own picker (sounds, pictures, a workspace file). */
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
