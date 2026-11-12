// The font names in Illustrator text. Illustrator finds a font by its PostScript name, so the real one is better than a guess:
// the desktop app reads the names from the installed font files (once, before the file is written), the fonts Frameling ships
// have theirs read at build time (scripts/gen-psnames.mjs), and anything else gets the guess from ai-text.ts.
import { desktop } from '../io/desktop';
import { pickFace } from '../fonts/fontnames';
import { SHIPPED_FACES } from '../fonts/psnames-shipped';
import { psFontName } from './ai-text';

const key = (family: string, weight: number, italic: boolean) => `${family.trim().toLowerCase()}|${Math.min(900, Math.max(100, Math.round(weight / 100) * 100))}|${italic ? 1 : 0}`;

/** What the computer's font files said, by key (null: that font is not installed here). */
const installed = new Map<string, string | null>();

/** The PostScript name to write for a font: the installed font's own, else a shipped font's, else the guess. */
export function liveFontName(family: string, weight: number, italic: boolean): string {
  const real = installed.get(key(family, weight, italic));
  if (real) return real;
  return pickFace(SHIPPED_FACES, family, weight, italic)?.ps ?? psFontName(family, weight, italic);
}

/** Every font a document's text uses, found by looking through it for text shapes. */
export function textFontsIn(doc: unknown): { family: string; weight: number; italic: boolean }[] {
  const found = new Map<string, { family: string; weight: number; italic: boolean }>();
  const seen = new Set<object>();
  const look = (v: unknown) => {
    if (!v || typeof v !== 'object' || ArrayBuffer.isView(v) || seen.has(v)) return;
    seen.add(v);
    const o = v as Record<string, unknown>;
    if (o.type === 'text' && typeof o.font === 'string' && typeof o.weight === 'number') {
      const k = key(o.font, o.weight, !!o.italic);
      if (!found.has(k)) found.set(k, { family: o.font, weight: o.weight, italic: !!o.italic });
    }
    for (const x of Array.isArray(v) ? v : Object.values(o)) look(x);
  };
  look(doc);
  return [...found.values()];
}

/** Asks the desktop side for the real names of the fonts a document's text uses (the web version has no font access and keeps the guess). */
export async function learnFontNames(doc: unknown): Promise<void> {
  const fonts = desktop()?.fonts;
  if (!fonts) return;
  const wants = textFontsIn(doc).filter((w) => !installed.has(key(w.family, w.weight, w.italic)));
  if (!wants.length) return;
  try {
    const names = await fonts.psNames(wants);
    wants.forEach((w, i) => installed.set(key(w.family, w.weight, w.italic), typeof names[i] === 'string' ? names[i] : null));
  } catch {
    // no answer: the guess stands
  }
}

/** Forgets what was learned (for tests). */
export function forgetFontNames(): void {
  installed.clear();
}
