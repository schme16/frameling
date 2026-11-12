// Helpers the SVG writers share with the kinds of shape that write themselves (text and particles, see
// shapeExport.ts): number and text formatting, and symbol sprites shared through <use>.

// Symbol sprites are written once each and placed with <use> while a writer collects them (see withSprites).
let spriteIds: Map<string, string> | null = null;
// Soft puff gradients, one per colour, written once into the same definitions.
let softIds: Map<string, string> | null = null;

/** Runs `make` with symbol particle sprites shared through <use>; their definitions come back with the result. */
export function withSprites<T>(make: () => T): { value: T; defs: string[] } {
  const outer = spriteIds;
  const outerSoft = softIds;
  spriteIds = new Map();
  softIds = new Map();
  try {
    const value = make();
    return { value, defs: [...softIds.values(), ...[...spriteIds].map(([body, id]) => `<g id="${id}">${body}</g>`)] };
  } finally {
    spriteIds = outer;
    softIds = outerSoft;
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

/** The app's soft puff as a gradient: full colour in the middle, two thirds at 45%, nothing at the edge (particles/draw.ts). */
export function softPuff(fill: string, x: number, y: number, r: number, opacity: string): string {
  const id = `soft-${fill.replace(/[^0-9a-z]/gi, '')}`;
  const def = `<radialGradient id="${id}"><stop offset="0" stop-color="${fill}"/><stop offset="0.45" stop-color="${fill}" stop-opacity="0.667"/><stop offset="1" stop-color="${fill}" stop-opacity="0"/></radialGradient>`;
  // Without a collector (see withSprites) the gradient travels with the particle.
  if (softIds) softIds.set(id, def);
  return `${softIds ? '' : def}<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="url(#${id})"${opacity}/>`;
}

export const n2 = (v: number): string => String(Math.round(v * 100) / 100);
export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A colour as an SVG fill and its alpha (an 8 digit hex carries it). */
export function svgColor(c: string): { fill: string; alpha: number } {
  if (/^#[0-9a-f]{8}$/i.test(c)) return { fill: c.slice(0, 7), alpha: parseInt(c.slice(7), 16) / 255 };
  return { fill: c, alpha: 1 };
}
