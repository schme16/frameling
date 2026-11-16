// The styling inside an SVG: style="..." attributes and <style> sheets of simple rules (.cls-1 { fill: #f00 }, which is
// what Illustrator writes). Selectors it can't judge by the element alone (children, :hover, attributes) are counted, not
// guessed at. Pure.
import type { XmlEl } from './xml';

/** "fill: #f00; stroke: none" as a map (names lower case, !important taken off). */
export function parseDecls(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Semicolons inside url(...) or quotes are part of the value.
  let depth = 0;
  let quote = '';
  let start = 0;
  const parts: string[] = [];
  for (let i = 0; i < style.length; i++) {
    const c = style[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && !depth) {
      parts.push(style.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(style.slice(start));
  for (const p of parts) {
    const c = p.indexOf(':');
    if (c < 0) continue;
    const name = p.slice(0, c).trim().toLowerCase();
    const value = p.slice(c + 1).replace(/!important\s*$/i, '').trim();
    if (name && value) out[name] = value;
  }
  return out;
}

export interface CssRule {
  test: (el: XmlEl) => boolean;
  /** Ids count most, then classes, then the element name. */
  specificity: number;
  decls: Record<string, string>;
}

export interface Sheet {
  rules: CssRule[];
  /** Selectors this reader does not handle (kept to say so), and rules inside @media and the like. */
  skipped: string[];
}

const COMPOUND = /^(\*|[a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/;

function compile(sel: string): { test: (el: XmlEl) => boolean; specificity: number } | null {
  const m = COMPOUND.exec(sel.trim());
  if (!m || !sel.trim()) return null;
  const tag = m[1] && m[1] !== '*' ? m[1] : '';
  const classes: string[] = [];
  let id = '';
  for (const part of m[2].match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.') classes.push(part.slice(1));
    else id = part.slice(1);
  }
  return {
    specificity: (id ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0),
    test: (el) => {
      if (tag && el.name !== tag && el.name !== `svg:${tag}`) return false;
      if (id && el.attrs.id !== id) return false;
      if (classes.length) {
        const have = (el.attrs.class ?? '').split(/\s+/);
        if (!classes.every((c) => have.includes(c))) return false;
      }
      return true;
    },
  };
}

/** Adds the rules of one stylesheet's text. */
export function addSheet(into: Sheet, text: string): void {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  const n = css.length;
  while (i < n) {
    while (i < n && /\s/.test(css[i])) i++;
    if (i >= n) break;
    if (css[i] === '@') {
      // At-rules: a block (@media, @font-face, @keyframes) is skipped whole; a line (@import) ends at the semicolon.
      const semi = css.indexOf(';', i);
      const open = css.indexOf('{', i);
      let name = css.slice(i, Math.min(...[semi, open, n].filter((x) => x >= 0))).trim();
      name = name.slice(0, 40);
      if (open >= 0 && (semi < 0 || open < semi)) {
        let depth = 0;
        let j = open;
        for (; j < n; j++) {
          if (css[j] === '{') depth++;
          else if (css[j] === '}' && --depth === 0) break;
        }
        i = j + 1;
      } else i = semi < 0 ? n : semi + 1;
      into.skipped.push(name);
      continue;
    }
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const close = css.indexOf('}', open);
    const selText = css.slice(i, open);
    const body = css.slice(open + 1, close < 0 ? n : close);
    i = close < 0 ? n : close + 1;
    const decls = parseDecls(body);
    for (const one of selText.split(',')) {
      const c = compile(one);
      if (c) into.rules.push({ ...c, decls });
      else if (one.trim()) into.skipped.push(one.trim().slice(0, 60));
    }
  }
}

/** The declarations that apply to an element from the sheets, weakest first (so later ones win when merged). */
export function sheetStyle(sheet: Sheet, el: XmlEl): Record<string, string> {
  const hits = sheet.rules.map((r, order) => ({ r, order })).filter((h) => h.r.test(el));
  hits.sort((a, b) => a.r.specificity - b.r.specificity || a.order - b.order);
  const out: Record<string, string> = {};
  for (const h of hits) Object.assign(out, h.r.decls);
  return out;
}
