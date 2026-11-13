// His quills are coloured pencils, and they take the colours you've been drawing with. The sheet is recoloured once
// on a canvas and handed back to the mascot runtime, so every Quill in the app picks it up with no extra work per
// frame. Switching the pet off puts the original sheet back.
import { quillSheet, setQuillSheet, SHEET_URL, type LoadedSheet } from '../ui/mascot/runtime';

/** The five pencils in the art, each with its bright part and its shaded part, darkest first in the sheet's palette.
 *  Taken from brand/mascot/mascot.frameling: if the art's pencil colours change, change these with them. */
export const PENCILS: { bright: string; shade: string }[] = [
  { bright: '#4fd1a5', shade: '#2fae85' },
  { bright: '#9b7bff', shade: '#7657e0' },
  { bright: '#5ab8ff', shade: '#3a8fe0' },
  { bright: '#ff6f91', shade: '#e04a72' },
  { bright: '#ffc94a', shade: '#f2a91c' },
];

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** The shaded half of a pencil: the same colour, darker, the way the art does it (about a fifth down). */
export function shadeOf(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return toHex(rgb.map((v) => v * 0.78) as [number, number, number]);
}

/**
 * Which colour each pencil becomes. Your colours are used in order, newest pencil last, and any pencil you haven't
 * given a colour to keeps the one the art drew it with, so he's never half bald.
 */
export function mapPencils(colours: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const mine = colours.filter((c) => parseHex(c)).slice(-PENCILS.length);
  PENCILS.forEach((p, i) => {
    // The newest colour goes on the last pencil, so a fresh one always lands somewhere you can see.
    const at = i - (PENCILS.length - mine.length);
    const colour = at >= 0 ? mine[at] : null;
    if (!colour) return;
    out.set(p.bright.toLowerCase(), colour.toLowerCase());
    out.set(p.shade.toLowerCase(), shadeOf(colour));
  });
  return out;
}

/** True when nothing would change, so the sheet is left alone. */
export const nothingToDo = (map: Map<string, string>): boolean => [...map].every(([from, to]) => from === to);

/** Swaps the pencil colours in a run of RGBA bytes, in place. Gives back how many pixels changed. */
export function swapPixels(data: Uint8ClampedArray, map: Map<string, string>): number {
  const from = new Map<number, [number, number, number]>();
  for (const [a, b] of map) {
    const src = parseHex(a);
    const dst = parseHex(b);
    if (src && dst) from.set((src[0] << 16) | (src[1] << 8) | src[2], dst);
  }
  let hit = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    const to = from.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (!to) continue;
    data[i] = to[0];
    data[i + 1] = to[1];
    data[i + 2] = to[2];
    hit++;
  }
  return hit;
}

// ---------------------------------------------------------------- doing it to the real sheet

/** The sheet as the art drew it, kept so switching the pet off gives it straight back. */
let original: LoadedSheet | null = null;
/** The colours the sheet is painted with now, so the same list isn't drawn twice. */
let painted = '';

/** Puts the art's own colours back. Safe to call when nothing was changed. */
export function plainQuills(): void {
  if (original) setQuillSheet(original);
  original = null;
  painted = '';
}

/**
 * Repaints the sheet with your colours. Does nothing without a canvas (tests, the main process) or before the sheet
 * has loaded, and nothing at all when the colours haven't changed.
 */
export function paintQuills(colours: readonly string[]): void {
  const sheet = quillSheet.get();
  if (!sheet || typeof document === 'undefined') return;
  const key = colours.join(',');
  if (key === painted) return;
  const map = mapPencils(colours);
  if (nothingToDo(map)) {
    plainQuills();
    return;
  }
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const pix = ctx.getImageData(0, 0, c.width, c.height);
      if (!swapPixels(pix.data, map)) return;
      ctx.putImageData(pix, 0, 0);
      const now = quillSheet.get();
      if (!now) return;
      if (!original) original = now;
      painted = key;
      setQuillSheet({ ...now, url: c.toDataURL('image/png') });
    } catch {
      // A canvas that won't give its pixels back (a tainted one): he keeps the colours he came with.
    }
  };
  // Always from the file on disk, so a repaint starts from the art's own colours rather than the last repaint.
  img.src = SHEET_URL;
}
