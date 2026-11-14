/**
 * The system clipboard, asked for through the desktop bridge (src/main/clipboard.ts) or, in a plain browser tab, the
 * page's own. Every call is safe to make anywhere: when there is no clipboard to reach, reading gives nothing and
 * writing quietly does nothing.
 */
import type { FramelingApi } from '../preload/api';

function bridge(): FramelingApi['clipboard'] | undefined {
  return typeof window !== 'undefined' ? (window as { frameling?: FramelingApi }).frameling?.clipboard : undefined;
}

/** Whether there is a system clipboard to ask at all. Without one (a test, a bare page) a paste needn't wait to find out. */
export function canReadSystem(): boolean {
  return !!bridge() || (typeof navigator !== 'undefined' && !!navigator.clipboard?.read);
}

export interface SystemPicture {
  png: Uint8Array;
  /** Frameling put it there itself. */
  ours: boolean;
}

// For the browser's clipboard, which can't say who wrote it: what was last written, to recognise it again.
let lastWritten = '';
const sum = (b: Uint8Array): string => {
  let h = 2166136261;
  for (let i = 0; i < b.length; i += Math.max(1, b.length >> 12)) h = Math.imul(h ^ b[i], 16777619);
  return `${b.length}:${h >>> 0}`;
};

/** The picture on the system clipboard, if there is one. */
export async function readSystemPicture(): Promise<SystemPicture | null> {
  const b = bridge();
  try {
    if (b) {
      const r = await b.readPicture();
      return r ? { png: new Uint8Array(r.png), ours: r.ours } : null;
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard?.read) return null;
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (!type) continue;
      const png = new Uint8Array(await (await item.getType(type)).arrayBuffer());
      return { png, ours: sum(png) === lastWritten };
    }
  } catch {
    // Not allowed, or nothing readable there: it counts as no picture.
  }
  return null;
}

/** Puts a picture (PNG bytes) on the system clipboard. Resolves to whether it got there. */
export async function writeSystemPicture(png: Uint8Array): Promise<boolean> {
  const b = bridge();
  try {
    if (b) return await b.writePicture(png);
    if (typeof navigator === 'undefined' || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([png as BlobPart], { type: 'image/png' }) })]);
    lastWritten = sum(png);
    return true;
  } catch {
    return false;
  }
}

/** Puts text on the system clipboard (an SVG's source, for another app to paste). */
export async function writeSystemText(text: string): Promise<boolean> {
  const b = bridge();
  try {
    if (b) return await b.writeText(text);
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    lastWritten = '';
    return true;
  } catch {
    return false;
  }
}
