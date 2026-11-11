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

/** Fonts on this computer from a list of common ones (desktop only; the web version keeps to the shipped two). */
export function systemFonts(): string[] {
  if (found) return found;
  found = [];
  if (!desktop() || desktop()?.kind === 'web' || typeof OffscreenCanvas === 'undefined') return found;
  const g = new OffscreenCanvas(4, 4).getContext('2d');
  if (!g) return found;
  for (const f of COMMON) if (installed(g, f)) found.push(f);
  return found;
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
