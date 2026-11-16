// A small XML reader for SVG files: elements, attributes, text, CDATA, entities. It never fetches anything and never
// expands entities a file defines itself, so a hostile file can't make it read the disk or grow without end. Pure.

export interface XmlEl {
  name: string;
  attrs: Record<string, string>;
  /** Child elements and text, in order. */
  kids: (XmlEl | string)[];
}

export class XmlProblem extends Error {}

const MAX_DEPTH = 200;
const MAX_ELEMENTS = 400_000;

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return NAMED[e] ?? m;
  });
}

const isSpace = (c: string) => c === ' ' || c === '\n' || c === '\t' || c === '\r';
const isNameChar = (c: string) => /[^\s=/>"'<]/.test(c);

/** Reads the document and returns its root element. Throws XmlProblem in plain words. */
export function parseXml(input: string): XmlEl {
  const s = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  let i = 0;
  const n = s.length;
  const root: XmlEl = { name: '#root', attrs: {}, kids: [] };
  const stack: XmlEl[] = [root];
  let count = 0;

  const line = (at: number) => s.slice(0, at).split('\n').length;
  const fail = (what: string, at = i): never => {
    throw new XmlProblem(`${what} (near line ${line(at)}).`);
  };

  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt < 0) {
      const rest = s.slice(i);
      if (rest.trim()) stack[stack.length - 1].kids.push(decode(rest));
      break;
    }
    if (lt > i) {
      const text = s.slice(i, lt);
      if (text.trim() || stack.length > 1) stack[stack.length - 1].kids.push(decode(text));
    }
    i = lt;
    if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4);
      if (end < 0) fail('A comment is never closed');
      i = end + 3;
    } else if (s.startsWith('<![CDATA[', i)) {
      const end = s.indexOf(']]>', i + 9);
      if (end < 0) fail('A CDATA section is never closed');
      stack[stack.length - 1].kids.push(s.slice(i + 9, end));
      i = end + 3;
    } else if (s.startsWith('<?', i)) {
      const end = s.indexOf('?>', i + 2);
      if (end < 0) fail('A processing instruction is never closed');
      i = end + 2;
    } else if (s.startsWith('<!', i)) {
      // A doctype, with or without an internal subset in [ ]. Skipped whole: nothing in it is used.
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const c = s[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
        else if (c === '"' || c === "'") {
          const e = s.indexOf(c, j + 1);
          if (e < 0) break;
          j = e;
        }
      }
      if (j >= n) fail('The document type line is never closed');
      i = j + 1;
    } else if (s.startsWith('</', i)) {
      const end = s.indexOf('>', i);
      if (end < 0) fail('A closing tag is never finished');
      const name = s.slice(i + 2, end).trim();
      const top = stack[stack.length - 1];
      if (stack.length === 1 || top.name !== name) fail(`The tag </${name}> doesn't match what was opened${stack.length > 1 ? ` (<${top.name}>)` : ''}`);
      stack.pop();
      i = end + 1;
    } else {
      // An opening tag.
      let j = i + 1;
      const nameStart = j;
      while (j < n && isNameChar(s[j])) j++;
      const name = s.slice(nameStart, j);
      if (!name) fail('There is a "<" that does not start a tag');
      const attrs: Record<string, string> = {};
      let selfClose = false;
      for (;;) {
        while (j < n && isSpace(s[j])) j++;
        if (j >= n) fail(`The tag <${name}> is never finished`, i);
        if (s[j] === '>') {
          j++;
          break;
        }
        if (s[j] === '/' && s[j + 1] === '>') {
          selfClose = true;
          j += 2;
          break;
        }
        const aStart = j;
        while (j < n && isNameChar(s[j])) j++;
        const an = s.slice(aStart, j);
        if (!an) fail(`The tag <${name}> has something odd in it`, j);
        while (j < n && isSpace(s[j])) j++;
        if (s[j] !== '=') {
          // A bare attribute (not valid XML): keep it empty.
          attrs[an] = '';
          continue;
        }
        j++;
        while (j < n && isSpace(s[j])) j++;
        const q = s[j];
        if (q !== '"' && q !== "'") fail(`The attribute ${an} has no quotes round its value`, j);
        const end = s.indexOf(q, j + 1);
        if (end < 0) fail(`The attribute ${an} is never closed`, j);
        attrs[an] = decode(s.slice(j + 1, end));
        j = end + 1;
      }
      if (++count > MAX_ELEMENTS) fail('The file has too many elements to read');
      const el: XmlEl = { name, attrs, kids: [] };
      stack[stack.length - 1].kids.push(el);
      if (!selfClose) {
        if (stack.length > MAX_DEPTH) fail('The shapes are nested too deeply');
        stack.push(el);
      }
      i = j;
    }
  }
  if (stack.length > 1) fail(`The tag <${stack[stack.length - 1].name}> is never closed`, n);
  const first = root.kids.find((k): k is XmlEl => typeof k !== 'string');
  if (!first) throw new XmlProblem('There is nothing in that file.');
  return first;
}

/** The element's name without a namespace prefix when it is the SVG one ("svg:rect" is "rect"); other prefixes stay. */
export function localName(el: XmlEl): string {
  const c = el.name.indexOf(':');
  return c > 0 && el.name.slice(0, c) === 'svg' ? el.name.slice(c + 1) : el.name;
}

export const elementKids = (el: XmlEl): XmlEl[] => el.kids.filter((k): k is XmlEl => typeof k !== 'string');

/** All the text inside an element, joined. */
export function textOf(el: XmlEl): string {
  return el.kids.map((k) => (typeof k === 'string' ? k : textOf(k))).join('');
}
