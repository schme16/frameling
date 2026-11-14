// Which fonts the text tools can offer: the two Frameling ships, plus common fonts found on this computer (desktop).
import { desktop } from '../io/desktop';
import { SHIPPED_FONTS } from './model';
import { forgetTextMeasures } from './draw';

const COMMON = [
  'Arial', 'Arial Black', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Calibri', 'Candara', 'Corbel', 'Franklin Gothic Medium',
  'Gill Sans', 'Futura', 'Avenir', 'Avenir Next', 'Optima', 'Century Gothic', 'Lucida Grande', 'Ubuntu', 'Cantarell', 'DejaVu Sans', 'Noto Sans',
  'Liberation Sans', 'Open Sans', 'Roboto', 'Lato', 'Montserrat', 'Poppins', 'Times New Roman', 'Georgia', 'Garamond', 'Palatino Linotype',
  'Book Antiqua', 'Baskerville', 'Didot', 'Cambria', 'Constantia', 'DejaVu Serif', 'Noto Serif', 'Liberation Serif', 'Courier New', 'Consolas',
  'Menlo', 'Monaco', 'DejaVu Sans Mono', 'Liberation Mono', 'Comic Sans MS', 'Impact', 'Brush Script MT', 'Papyrus', 'Chalkboard', 'Marker Felt',
];

let found: string[] | null = null;

/** Is a font installed? Measures a test string in it against two different fallbacks. */
function installed(g: OffscreenCanvasRenderingContext2D, family: string): boolean {
  const probe = 'mmmmmmmmmmlli WW@#';
  for (const base of ['monospace', 'serif']) {
    g.font = `40px ${base}`;
    const a = g.measureText(probe).width;
    g.font = `40px "${family}", ${base}`;
    if (g.measureText(probe).width !== a) return true;
  }
  return false;
}

/** Fonts on this computer, from a list of common ones. */
export function systemFonts(): string[] {
  if (found) return found;
  found = [];
  if (!desktop() || typeof OffscreenCanvas === 'undefined') return found;
  const g = new OffscreenCanvas(4, 4).getContext('2d');
  if (!g) return found;
  for (const f of COMMON) if (installed(g, f)) found.push(f);
  return found;
}

let probe: OffscreenCanvasRenderingContext2D | null | undefined;

/** Is this one font installed here? Works in a plain browser tab too (the page can only see what the browser can draw). */
export function fontLooksInstalled(family: string): boolean {
  if (probe === undefined) probe = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(4, 4).getContext('2d') : null;
  return probe ? installed(probe, family) : false;
}

/** Load the shipped fonts before anything draws with them, then redraw text measured with a fallback. */
export function preloadFonts(onReady: () => void): void {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const loads = SHIPPED_FONTS.flatMap((f) => [`400 32px ${f.css}`, `700 32px ${f.css}`, `italic 400 32px ${f.css}`].map((spec) => document.fonts.load(spec).catch(() => [])));
  void Promise.all(loads).then(() => {
    forgetTextMeasures();
    onReady();
  });
}

const GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);

/** Is this font here: one Frameling ships, a generic family, or one this computer can draw with? */
export function fontIsHere(family: string): boolean {
  const k = family.trim().toLowerCase();
  if (!k || GENERIC.has(k) || SHIPPED_FONTS.some((f) => f.name.toLowerCase() === k)) return true;
  return systemFonts().some((f) => f.toLowerCase() === k) || fontLooksInstalled(family);
}

/** The fonts to offer as a replacement: the shipped ones, then those on this computer (plus any in `extra` that are here). */
export function replacementFonts(extra: readonly string[] = []): { shipped: string[]; system: string[] } {
  const shipped = SHIPPED_FONTS.map((f) => f.name);
  const have = new Set([...shipped, ...systemFonts()].map((f) => f.toLowerCase()));
  const system = [...systemFonts()];
  for (const f of extra) {
    if (have.has(f.toLowerCase()) || !fontIsHere(f)) continue;
    system.push(f);
    have.add(f.toLowerCase());
  }
  return { shipped, system: system.sort((a, b) => a.localeCompare(b)) };
}
