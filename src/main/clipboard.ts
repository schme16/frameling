// The system clipboard, for the page: a picture in (a screenshot, something copied from a browser or another app) and a
// picture or some text out. The page can't reach Electron's clipboard, so it asks here, the same way it asks for files.
import { clipboard, ClipboardItem } from 'electron';
import { createHash } from 'node:crypto';

type Handle = (channel: string, fn: (e: unknown, ...args: any[]) => unknown) => void;

/** The biggest picture taken off the clipboard, in bytes. A drawing can't hold anything near it, and it keeps a stray huge copy out of memory. */
export const MAX_BYTES = 200 * 1024 * 1024;

// What this app last put there, so a paste can tell its own copy from something copied since. A fingerprint of the
// picture as the clipboard gives it back (the system may re-encode it on the way, so the bytes written can differ).
let ours = '';

const fingerprint = (bytes: Uint8Array): string => createHash('sha1').update(bytes).digest('hex');

export interface ClipboardPicture {
  /** The picture as PNG bytes. */
  png: Uint8Array;
  /** True when this app put it there itself (a paste then uses its own copy, which keeps more). */
  ours: boolean;
}

async function pngOnClipboard(): Promise<Uint8Array | null> {
  // Cheap first: nothing to decode when no picture is on the clipboard.
  if (!(await clipboard.has('image/png'))) return null;
  for (const item of await clipboard.read()) {
    if (!item.types.includes('image/png')) continue;
    const blob = await item.getType('image/png');
    if (blob.size === 0 || blob.size > MAX_BYTES) return null;
    return new Uint8Array(await blob.arrayBuffer());
  }
  return null;
}

export async function readPicture(): Promise<ClipboardPicture | null> {
  const png = await pngOnClipboard();
  return png ? { png, ours: fingerprint(png) === ours } : null;
}

export async function writePicture(png: Uint8Array): Promise<boolean> {
  if (!(png instanceof Uint8Array) || !png.length) return false;
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png as BlobPart], { type: 'image/png' }) })]);
  // Read it back the way a paste will, so the fingerprint matches what comes out.
  const back = await pngOnClipboard();
  ours = back ? fingerprint(back) : '';
  return !!back;
}

export async function writeText(text: string): Promise<boolean> {
  if (typeof text !== 'string') return false;
  await clipboard.writeText(text);
  ours = '';
  return true;
}

export function registerClipboardIpc(handle: Handle): void {
  handle('clipboard:readPicture', () => readPicture());
  handle('clipboard:writePicture', (_e, png: Uint8Array) => writePicture(png));
  handle('clipboard:writeText', (_e, text: string) => writeText(text));
}
