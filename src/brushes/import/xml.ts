// A small, careful XML reader for the little documents inside Krita files (a preset's settings, a brush definition, a
// sensor). It builds a tree with no outside lookups of any kind: no DOCTYPE is followed, no entity is defined by the file,
// no network, nothing is run. Depth, node count and text size are capped so a hostile file ends in a plain message.
// Pure, no DOM.
import { BrushProblem } from './types';

export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  /** The text directly inside (CDATA included), not trimmed. */
  text: string;
}

const MAX_DEPTH = 32;
const MAX_NODES = 100_000;
const MAX_ATTRS = 64;
export const MAX_XML_CHARS = 16 * 1024 * 1024;

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s: string): string =>
  s.indexOf('&') < 0
    ? s
    : s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-z]{2,4});/g, (m, e: string) => {
        if (e[0] === '#') {
          const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : '';
        }
        return ENTITIES[e] ?? m;
      });

const isSpace = (c: number): boolean => c === 32 || c === 10 || c === 13 || c === 9;
const isNameChar = (c: number): boolean => (c >= 48 && c <= 58) || (c >= 65 && c <= 90) || c === 95 || (c >= 97 && c <= 122) || c === 45 || c === 46 || c > 127;

/** The root element of `src`. Throws a `BrushProblem` for anything that is not a well formed, reasonably sized document. */
export function parseXml(src: string, what = 'settings'): XNode {
  const bad = (): never => {
    throw new BrushProblem(`The ${what} in that file are damaged, so it can't be read.`);
  };
  if (src.length > MAX_XML_CHARS) throw new BrushProblem(`The ${what} in that file are too big to be real.`);
  const n = src.length;
  let i = 0;
  let nodes = 0;
  const root: XNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  while (i < n) {
    const lt = src.indexOf('<', i);
    const cur = stack[stack.length - 1];
    if (lt < 0) {
      cur.text += decode(src.slice(i));
      break;
    }
    if (lt > i) cur.text += decode(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      if (e < 0) bad();
      i = e + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      if (e < 0) bad();
      cur.text += src.slice(lt + 9, e);
      i = e + 3;
    } else if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt + 2);
      if (e < 0) bad();
      i = e + 2;
    } else if (src.startsWith('<!', lt)) {
      // A DOCTYPE: skipped whole, never followed. A bracketed part (an inner subset) is skipped with it.
      let j = lt + 2;
      let depth = 0;
      for (; j < n; j++) {
        const c = src[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      if (j >= n) bad();
      i = j + 1;
    } else if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt + 2);
      if (e < 0 || stack.length < 2) bad();
      const name = src.slice(lt + 2, e).trim();
      if (name !== cur.name) bad();
      stack.pop();
      i = e + 1;
    } else {
      // An opening tag with attributes.
      let j = lt + 1;
      while (j < n && isNameChar(src.charCodeAt(j))) j++;
      const name = src.slice(lt + 1, j);
      if (!name) bad();
      const node: XNode = { name, attrs: {}, children: [], text: '' };
      let selfClose = false;
      let count = 0;
      for (;;) {
        while (j < n && isSpace(src.charCodeAt(j))) j++;
        if (j >= n) bad();
        const c = src[j];
        if (c === '>') {
          j++;
          break;
        }
        if (c === '/') {
          if (src[j + 1] !== '>') bad();
          selfClose = true;
          j += 2;
          break;
        }
        const a0 = j;
        while (j < n && isNameChar(src.charCodeAt(j))) j++;
        if (j === a0) bad();
        const an = src.slice(a0, j);
        while (j < n && isSpace(src.charCodeAt(j))) j++;
        if (src[j] !== '=') bad();
        j++;
        while (j < n && isSpace(src.charCodeAt(j))) j++;
        const q = src[j];
        if (q !== '"' && q !== "'") bad();
        const e = src.indexOf(q, j + 1);
        if (e < 0) bad();
        if (++count > MAX_ATTRS) bad();
        node.attrs[an] = decode(src.slice(j + 1, e));
        j = e + 1;
      }
      if (++nodes > MAX_NODES) throw new BrushProblem(`The ${what} in that file have too many parts to be real.`);
      cur.children.push(node);
      if (!selfClose) {
        if (stack.length > MAX_DEPTH) throw new BrushProblem(`The ${what} in that file are nested too deeply to be real.`);
        stack.push(node);
      }
      i = j;
    }
  }
  if (stack.length !== 1) bad();
  const top = root.children[0];
  if (!top) bad();
  return top;
}

/** The first child called `name`. */
export const child = (n: XNode | undefined, name: string): XNode | undefined => n?.children.find((c) => c.name === name);
