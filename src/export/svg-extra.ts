// Helpers the SVG writers share with the kinds of shape that write themselves (text and particles, see
// shapeExport.ts): number and text formatting, and symbol sprites shared through <use>.

// Symbol sprites are written once each and placed with <use> while a writer collects them (see withSprites).
let spriteIds: Map<string, string> | null = null;

/** Runs `make` with symbol particle sprites shared through <use>; their definitions come back with the result. */
export function withSprites<T>(make: () => T): { value: T; defs: string[] } {
  const outer = spriteIds;
  spriteIds = new Map();
  try {
    const value = make();
    return { value, defs: [...spriteIds].map(([body, id]) => `<g id="${id}">${body}</g>`) };
  } finally {
    spriteIds = outer;
  }
}

/** Gives a symbol sprite body its shared id while a writer is collecting them (see withSprites), or null when none is. */
export function sharedSprite(body: string): string | null {
  if (!spriteIds) return null;
  let id = spriteIds.get(body);
  if (!id) {
    id = `sprite${spriteIds.size}`;
    spriteIds.set(body, id);
  }
  return id;
}

export const n2 = (v: number): string => String(Math.round(v * 100) / 100);
export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A colour as an SVG fill and its alpha (an 8 digit hex carries it). */
export function svgColor(c: string): { fill: string; alpha: number } {
  if (/^#[0-9a-f]{8}$/i.test(c)) return { fill: c.slice(0, 7), alpha: parseInt(c.slice(7), 16) / 255 };
  return { fill: c, alpha: 1 };
}
