// Filling {placeholders} in words. Shared by Quill's lines (src/ui/mascot/lines.ts) and the rest of the app's words
// (src/words), so both fill and read them the same way.
export type Vars = Record<string, string | number>;

/** The {placeholders} in a piece of text, in order, without repeats. */
export function placeholders(text: string | string[]): string[] {
  const out: string[] = [];
  for (const t of Array.isArray(text) ? text : [text]) for (const m of t.matchAll(/\{(\w+)\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Fills {name} style placeholders. Anything not given stays as written, so a gap is easy to spot. */
export function fill(text: string, vars: Vars = {}): string {
  return text.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all));
}
