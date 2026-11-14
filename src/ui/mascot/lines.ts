// Everything Quill says lives in lines.json, so it can be edited (and reviewed against screenshots, see
// brand/dialogue) without touching code. Code reads it through line() / lines() / lineParts().
import data from './lines.json';
import { currentMascot } from './mascots';

type Data = typeof data;
export type LineId = Exclude<keyof Data, '$about'>;
export type Vars = Record<string, string | number>;

export interface LineEntry {
  text: string | string[];
  where: string;
  vars?: string[];
}

export const LINES = data as unknown as Record<LineId, LineEntry> & { $about: string };

export const lineIds = (): LineId[] => Object.keys(data).filter((k) => !k.startsWith('$')) as LineId[];

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

function entry(id: LineId): LineEntry {
  const e = currentMascot().lines?.[id] ?? LINES[id];
  if (!e) throw new Error(`No Quill line "${id}" in lines.json`);
  return e;
}

/** One line of Quill's, with its placeholders filled. A list entry gives its first item. */
export function line(id: LineId, vars?: Vars): string {
  const t = entry(id).text;
  return fill(Array.isArray(t) ? t[0] : t, vars);
}

/** All of a list entry (several bubbles, or a set to pick from). A single line comes back as a list of one. */
export function lines(id: LineId, vars?: Vars): string[] {
  const t = entry(id).text;
  return (Array.isArray(t) ? t : [t]).map((x) => fill(x, vars));
}

/** A line split around its placeholders, so they can be filled with anything (bold text, say). */
export function lineParts<T>(id: LineId, vars: Record<string, T>): (string | T)[] {
  const out: (string | T)[] = [];
  const text = line(id);
  let at = 0;
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    if (!(m[1] in vars)) continue;
    if (m.index! > at) out.push(text.slice(at, m.index));
    out.push(vars[m[1]]);
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}
