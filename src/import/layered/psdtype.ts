// Reads a Photoshop type layer: the `TySh` block holds a transform, a "descriptor" (a typed key and value tree) and, inside it,
// `EngineData`, a PostScript-like text with the style runs, the fonts and the paragraph settings. Pure: bytes in, a plain
// description of the text out, or null when it can't be made sense of (the layer then stays the picture of its words).
// Follows how Interactives reads the same block (interactives-editor/src/lib/psd-type.ts), cut down to what a Frameling text
// shape carries.

type Dict = Record<string, unknown>;

// ---------------------------------------------------------------- descriptor

class Bytes {
  pos = 0;
  readonly view: DataView;
  constructor(readonly b: Uint8Array) {
    this.view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  private need(n: number): void {
    if (n < 0 || this.pos + n > this.b.length) throw new Error('short');
  }
  u8(): number {
    this.need(1);
    return this.b[this.pos++];
  }
  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }
  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }
  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos);
    this.pos += 8;
    return v;
  }
  skip(n: number): void {
    this.need(n);
    this.pos += n;
  }
  ascii(n: number): string {
    this.need(n);
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.b[this.pos + i]);
    this.pos += n;
    return s;
  }
  utf16(n: number): string {
    this.need(n * 2);
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.view.getUint16(this.pos + i * 2));
    this.pos += n * 2;
    return s;
  }
  /** A key or class id: a 4 character code, or a length-prefixed name. */
  key(): string {
    const n = this.u32();
    return this.ascii(n || 4);
  }
}

function readDescriptor(r: Bytes, depth = 0): Dict {
  if (depth > 40) throw new Error('deep');
  r.skip(r.u32() * 2); // name
  r.key(); // class id
  const count = r.u32();
  if (count > 10000) throw new Error('big');
  const out: Dict = {};
  for (let i = 0; i < count; i++) {
    const key = r.key();
    out[key] = readValue(r, r.ascii(4), depth);
  }
  return out;
}

function readValue(r: Bytes, type: string, depth: number): unknown {
  switch (type) {
    case 'Objc':
    case 'GlbO':
      return readDescriptor(r, depth + 1);
    case 'VlLs': {
      const n = r.u32();
      if (n > 100000) throw new Error('big');
      const list: unknown[] = [];
      for (let i = 0; i < n; i++) list.push(readValue(r, r.ascii(4), depth + 1));
      return list;
    }
    case 'doub':
      return r.f64();
    case 'UntF':
      r.ascii(4);
      return r.f64();
    case 'TEXT': {
      const n = r.u32();
      if (n > 1000000) throw new Error('big');
      return r.utf16(n).replace(/\u0000+$/, '');
    }
    case 'enum':
      r.key();
      return r.key();
    case 'long':
      return r.i32();
    case 'bool':
      return r.u8() !== 0;
    case 'comp': {
      const hi = r.i32();
      return hi * 4294967296 + r.u32();
    }
    case 'tdta': {
      const n = r.u32();
      const start = r.pos;
      r.skip(n);
      return r.b.subarray(start, start + n);
    }
    case 'type':
    case 'GlbC':
    case 'Clss':
      r.skip(r.u32() * 2);
      r.key();
      return null;
    case 'alis':
      r.skip(r.u32());
      return null;
    default:
      throw new Error(`type ${type}`);
  }
}

// ---------------------------------------------------------------- engine data

/** The engine's text: nested `<< /Key value >>` dictionaries, `[ ]` lists, `( )` strings, numbers and words. */
export function parseEngine(bytes: Uint8Array): Dict | null {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  let i = 0;
  const ws = (c: string) => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\u0000';
  const delim = (c: string) => ws(c) || c === '/' || c === '[' || c === ']' || c === '(' || c === ')' || c === '<' || c === '>';
  const skipWs = () => {
    while (i < s.length && ws(s[i])) i++;
  };
  const name = (): string => {
    i++; // the slash
    const start = i;
    while (i < s.length && !delim(s[i])) i++;
    return s.slice(start, i);
  };
  const str = (): string => {
    i++; // (
    const codes: number[] = [];
    while (i < s.length && s[i] !== ')') {
      if (s[i] === '\\') i++;
      codes.push(s.charCodeAt(i));
      i++;
    }
    if (i >= s.length) throw new Error('open string');
    i++; // )
    // Text is UTF-16 with a byte order mark; a few names are plain bytes.
    if (codes[0] === 0xfe && codes[1] === 0xff) {
      let out = '';
      for (let k = 2; k + 1 < codes.length; k += 2) out += String.fromCharCode((codes[k] << 8) | codes[k + 1]);
      return out;
    }
    return String.fromCharCode(...codes);
  };
  const dictBody = (end: boolean, depth: number): Dict => {
    const out: Dict = {};
    for (;;) {
      skipWs();
      if (i >= s.length) {
        if (end) throw new Error('open dict');
        return out;
      }
      if (end && s.startsWith('>>', i)) {
        i += 2;
        return out;
      }
      if (s[i] !== '/') throw new Error('key expected');
      const key = name();
      out[key] = value(depth + 1);
    }
  };
  const value = (depth: number): unknown => {
    if (depth > 60) throw new Error('deep');
    skipWs();
    if (i >= s.length) throw new Error('value expected');
    if (s.startsWith('<<', i)) {
      i += 2;
      return dictBody(true, depth);
    }
    const c = s[i];
    if (c === '[') {
      i++;
      const list: unknown[] = [];
      for (;;) {
        skipWs();
        if (i >= s.length) throw new Error('open array');
        if (s[i] === ']') {
          i++;
          return list;
        }
        list.push(value(depth + 1));
      }
    }
    if (c === '(') return str();
    if (c === '/') return name();
    const start = i;
    while (i < s.length && !delim(s[i])) i++;
    const tok = s.slice(start, i);
    if (!tok) throw new Error('bad token');
    if (tok === 'true') return true;
    if (tok === 'false') return false;
    if (tok === 'null') return null;
    const n = Number(tok);
    if (Number.isNaN(n)) throw new Error(`token ${tok}`);
    return n;
  };
  try {
    // Photoshop wraps the whole thing in << >>; older writers leave the top level bare.
    skipWs();
    if (s.startsWith('<<', i)) {
      i += 2;
      return dictBody(true, 0);
    }
    return dictBody(false, 0);
  } catch {
    return null;
  }
}

const asDict = (v: unknown): Dict | undefined => (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Uint8Array) ? (v as Dict) : undefined);
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** First value stored under `key` anywhere in a tree. */
function findKey(v: unknown, key: string, depth = 0): unknown {
  if (depth > 30 || !v || typeof v !== 'object' || v instanceof Uint8Array) return undefined;
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = findKey(x, key, depth + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  const d = v as Dict;
  if (key in d) return d[key];
  for (const k in d) {
    const r = findKey(d[k], key, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

// ---------------------------------------------------------------- type layers

export interface PsdTextRun {
  /** The text of the run, with `\n` for line breaks. */
  text: string;
  /** The PostScript font name, like `Montserrat-SemiBold` (empty when the file does not say). */
  font: string;
  /** In the layer's own units: multiply by the transform's vertical scale for pixels. */
  size: number;
  fauxBold: boolean;
  fauxItalic: boolean;
  /** `#rrggbb` */
  color: string;
  /** Thousandths of the size. */
  tracking: number;
  /** Line height in the same units as `size`, or null for automatic. */
  leading: number | null;
  underline: boolean;
  strike: boolean;
  /** 0 normal, 1 small capitals, 2 all capitals. */
  caps: 0 | 1 | 2;
}

export interface PsdType {
  text: string;
  runs: PsdTextRun[];
  /** xx, xy, yx, yy, tx, ty. */
  transform: number[];
  /** Paragraph text has a box it wraps in; point text grows with its words. */
  paragraph: boolean;
  /** The paragraph box [left, top, right, bottom] in the layer's own units. */
  box: number[] | null;
  align: 'left' | 'center' | 'right' | 'justify';
  /** The line height multiple Photoshop uses for automatic leading. */
  autoLeading: number;
  vertical: boolean;
  warped: boolean;
  /** The words run along a line or around a shape. */
  onPath: boolean;
}

const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');

function colorOf(c: unknown): string {
  const d = asDict(c);
  const vals = asList(d?.Values).map((x) => num(x, 0));
  const type = num(d?.Type, 1);
  if (type === 1 && vals.length >= 4) return `#${hex2(vals[1])}${hex2(vals[2])}${hex2(vals[3])}`;
  if (type === 0 && vals.length >= 2) return `#${hex2(vals[1])}${hex2(vals[1])}${hex2(vals[1])}`;
  return '#000000';
}

/** Reads a `TySh` block. Null when it isn't a type layer that can be read (the caller keeps the layer's pixels). */
export function parseTypeBlock(data: Uint8Array): PsdType | null {
  try {
    const r = new Bytes(data);
    if (r.u16() !== 1) return null;
    const transform: number[] = [];
    for (let i = 0; i < 6; i++) transform.push(r.f64());
    if (r.u16() !== 50 || r.u32() !== 16) return null;
    const desc = readDescriptor(r);
    let warp = asDict(desc.warp);
    if (!warp) {
      try {
        r.u16();
        r.u32();
        warp = readDescriptor(r);
      } catch {
        // the warp block is optional
      }
    }
    const engineBytes = desc.EngineData;
    if (!(engineBytes instanceof Uint8Array)) return null;
    const engine = parseEngine(engineBytes);
    if (!engine) return null;
    const ed = asDict(engine.EngineDict);
    if (!ed) return null;
    const res = asDict(engine.ResourceDict) ?? asDict(engine.DocumentResources) ?? {};

    let text = String(asDict(ed.Editor)?.Text ?? desc['Txt '] ?? '');
    const fonts = asList(res.FontSet).map((f) => String(asDict(f)?.Name ?? ''));
    const sheets = asList(res.StyleSheetSet);
    const normal = asDict(asDict(sheets[Math.max(0, num(res.TheNormalStyleSheet, 0))])?.StyleSheetData) ?? {};
    const styleRun = asDict(ed.StyleRun);
    const arr = asList(styleRun?.RunArray);
    const lens = asList(styleRun?.RunLengthArray).map((x) => num(x, 0));

    const raw: { text: string; sheet: Dict }[] = [];
    let at = 0;
    if (arr.length) {
      arr.forEach((run, i) => {
        const own = asDict(asDict(asDict(run)?.StyleSheet)?.StyleSheetData) ?? {};
        const n = i === arr.length - 1 && !lens[i] ? text.length - at : lens[i] ?? 0;
        raw.push({ text: text.slice(at, at + n), sheet: { ...normal, ...own } });
        at += n;
      });
      if (at < text.length) raw[raw.length - 1].text += text.slice(at);
    } else {
      raw.push({ text, sheet: normal });
    }
    // Photoshop ends the last paragraph with a carriage return that isn't part of the layer's words.
    const last = raw[raw.length - 1];
    if (last.text.endsWith('\r')) last.text = last.text.slice(0, -1);
    const fix = (t: string) => t.replace(/\r\n?|\u0003/g, '\n');
    text = fix(raw.map((x) => x.text).join(''));

    const runs: PsdTextRun[] = raw
      .filter((x) => x.text)
      .map(({ text: t, sheet }) => {
        const leading = sheet.AutoLeading === false ? num(sheet.Leading, 0) : 0;
        const caps = num(sheet.FontCaps, 0);
        return {
          text: fix(t),
          font: fonts[num(sheet.Font, 0)] ?? '',
          size: num(sheet.FontSize, 12),
          fauxBold: sheet.FauxBold === true,
          fauxItalic: sheet.FauxItalic === true,
          color: colorOf(sheet.FillColor),
          tracking: num(sheet.Tracking, 0),
          leading: leading > 0 ? leading : null,
          underline: sheet.Underline === true,
          strike: sheet.Strikethrough === true,
          caps: caps === 2 ? 2 : caps === 1 ? 1 : 0,
        };
      });
    if (!runs.length) return null;

    const para = asDict(asDict(asDict(asList(asDict(ed.ParagraphRun)?.RunArray)[0])?.ParagraphSheet)?.Properties) ?? {};
    const paraDefault = asDict(asDict(asList(res.ParagraphSheetSet)[0])?.Properties) ?? {};
    const props = { ...paraDefault, ...para };
    const just = num(props.Justification, 0);
    const align = just === 1 ? 'right' : just === 2 ? 'center' : just >= 3 ? 'justify' : 'left';

    const shapeType = findKey(engine, 'ShapeType');
    const bb = asList(findKey(engine, 'BoxBounds')).map((x) => num(x, 0));
    const hasBox = bb.length === 4 && bb[2] - bb[0] > 0 && bb[3] - bb[1] > 0;
    const paragraph = shapeType === 1 || (shapeType === undefined && hasBox);

    const shape = asDict(asList(desc.TextShape)[0]);
    const vertical = desc.Ornt === 'Vrtc' || shape?.Ornt === 'Vrtc';
    const style = warp?.warpStyle;
    const shapeWord = String(shape?.TEXT ?? shape?.textShape ?? '').toLowerCase();
    return {
      text,
      runs,
      transform,
      paragraph,
      box: hasBox ? bb : null,
      align,
      autoLeading: num(props.AutoLeading, 1.2) || 1.2,
      vertical,
      warped: typeof style === 'string' && style !== 'warpNone',
      onPath: shapeWord.includes('path') || shapeType === 2,
    };
  } catch {
    return null;
  }
}
