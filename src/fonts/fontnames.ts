// Reads what a font file says about its own names: family, style, weight and the PostScript name Illustrator knows it by.
// Pure (bytes in, faces out), so the desktop side, the build step that reads the shipped fonts and the tests all share it.
// Handles TrueType and OpenType files (and collections), WOFF2 files (with a decompressor passed in) and the named styles of
// variable fonts.

/** One face of a font: what a text with this family, weight and slant gets. */
export interface FontFace {
  /** The family a person picks, e.g. "Arial" ("Nunito" for every weight of Nunito). */
  family: string;
  /** The style words, e.g. "Bold Italic". */
  style: string;
  /** The PostScript name, e.g. "Arial-BoldMT". */
  ps: string;
  /** 100 to 900. */
  weight: number;
  italic: boolean;
}

type Tables = Map<string, Uint8Array>;

const u16 = (d: DataView, o: number) => (o + 2 <= d.byteLength ? d.getUint16(o) : 0);
const u32 = (d: DataView, o: number) => (o + 4 <= d.byteLength ? d.getUint32(o) : 0);
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const tag4 = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/** The text of a name record's bytes (UTF-16 for Windows and Unicode records, one byte each for the old Mac ones). */
function decode(bytes: Uint8Array, utf16: boolean): string {
  let s = '';
  if (utf16) for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  else for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

/** Every name in a 'name' table: id to its best text (English Windows first, then other Windows or Unicode, then Mac). */
export function readNames(table: Uint8Array): Map<number, string> {
  const d = view(table);
  const count = u16(d, 2);
  const base = u16(d, 4);
  const best = new Map<number, { rank: number; text: string }>();
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (r + 12 > d.byteLength) break;
    const platform = u16(d, r);
    const language = u16(d, r + 4);
    const id = u16(d, r + 6);
    const len = u16(d, r + 8);
    const off = base + u16(d, r + 10);
    if (off + len > table.length) continue;
    const utf16 = platform === 3 || platform === 0;
    if (!utf16 && platform !== 1) continue;
    const rank = platform === 3 && language === 0x409 ? 0 : platform === 3 ? 1 : platform === 0 ? 2 : language === 0 ? 3 : 4;
    const text = decode(table.subarray(off, off + len), utf16).trim();
    if (!text) continue;
    const prev = best.get(id);
    if (!prev || rank < prev.rank) best.set(id, { rank, text });
  }
  return new Map([...best].map(([k, v]) => [k, v.text]));
}

/** Names the PostScript name can hold: printable ASCII with none of ()[]{}<>/% or spaces, at most 63 long. */
export function validPsName(s: string | undefined): s is string {
  return !!s && s.length <= 63 && /^[\x21-\x7e]+$/.test(s) && !/[()[\]{}<>/%]/.test(s);
}

/** A variable font's family without the words its default style or "Variable" add ("Nunito ExtraLight" is Nunito). */
function variableFamily(family: string): string {
  return family.replace(/\s+(Variable|Thin|ExtraLight|Extra Light|Light|Regular|Medium)$/i, '').replace(/\s+Variable$/i, '');
}

/** The faces one set of tables holds: the font's own, or each named style of a variable font. */
export function facesOfTables(t: Tables): FontFace[] {
  const nameT = t.get('name');
  if (!nameT) return [];
  const names = readNames(nameT);
  const family = names.get(16) ?? names.get(1) ?? '';
  if (!family) return [];
  const os2 = t.get('OS/2');
  const head = t.get('head');
  let weight = 400;
  let italic = false;
  if (os2 && os2.length >= 64) {
    const d = view(os2);
    weight = u16(d, 4) || 400;
    const sel = u16(d, 62);
    italic = !!(sel & 1) || !!(sel & 512);
  } else if (head && head.length >= 46) {
    const mac = u16(view(head), 44);
    italic = !!(mac & 2);
    weight = mac & 1 ? 700 : 400;
  }
  const style = names.get(17) ?? names.get(2) ?? 'Regular';
  const fvar = t.get('fvar');
  const out: FontFace[] = [];
  if (fvar && fvar.length >= 16) {
    const d = view(fvar);
    const axesAt = u16(d, 4);
    const axes = u16(d, 8);
    const axisSize = u16(d, 10);
    const count = u16(d, 12);
    const size = u16(d, 14);
    let wAxis = -1;
    for (let a = 0; a < axes; a++) if (tag4(fvar, axesAt + a * axisSize) === 'wght') wAxis = a;
    // The prefix variable fonts build the names of their styles on (name 25, else the PostScript name up to its dash).
    const prefix = names.get(25) ?? (names.get(6) ?? family.replace(/\s+/g, '')).split('-')[0];
    for (let i = 0; i < count; i++) {
      const at = axesAt + axes * axisSize + i * size;
      if (at + 4 + axes * 4 > fvar.length) break;
      const styleName = names.get(u16(d, at)) ?? '';
      const w = wAxis >= 0 ? Math.round(d.getInt32(at + 4 + wAxis * 4) / 65536) : weight;
      const psId = size >= 6 + axes * 4 ? u16(d, at + 4 + axes * 4) : 0xffff;
      const own = psId !== 0xffff ? names.get(psId) : undefined;
      const ps = validPsName(own) ? own : `${prefix}-${styleName.replace(/\s+/g, '')}`;
      if (!styleName || !validPsName(ps)) continue;
      const slanted = italic || /italic|oblique/i.test(styleName);
      out.push({ family: variableFamily(family), style: styleName, ps, weight: w, italic: slanted });
    }
    if (out.length) return out;
  }
  const ps = names.get(6);
  if (!validPsName(ps)) return [];
  return [{ family, style, ps, weight, italic }];
}

/** The tables of a TrueType or OpenType file (the one font at `index` of a collection). */
function sfntTables(b: Uint8Array, index: number): Tables | null {
  if (b.length < 12) return null;
  const d = view(b);
  let at = 0;
  if (tag4(b, 0) === 'ttcf') {
    if (index >= u32(d, 8)) return null;
    at = u32(d, 12 + index * 4);
  } else if (index > 0) return null;
  const n = u16(d, at + 4);
  const t: Tables = new Map();
  for (let i = 0; i < n; i++) {
    const r = at + 12 + i * 16;
    if (r + 16 > b.length) break;
    const off = u32(d, r + 8);
    const len = u32(d, r + 12);
    if (off + len > b.length) continue;
    t.set(tag4(b, r), b.subarray(off, off + len));
  }
  return t;
}

/** How many fonts a file holds (1, or the count of a collection). */
function fontCount(b: Uint8Array): number {
  return b.length >= 12 && tag4(b, 0) === 'ttcf' ? Math.min(64, u32(view(b), 8)) : 1;
}

const WOFF2_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern',
  'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

/** The tables of a WOFF2 file; `brotli` is a Brotli decompressor (the page has none of its own, node does). */
function woff2Tables(b: Uint8Array, brotli: (data: Uint8Array) => Uint8Array): Tables | null {
  if (b.length < 48 || tag4(b, 0) !== 'wOF2') return null;
  const d = view(b);
  const n = u16(d, 12);
  const compressed = u32(d, 20);
  let p = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const c = b[p++];
      v = v * 128 + (c & 127);
      if (!(c & 128)) break;
    }
    return v;
  };
  const entries: { tag: string; len: number }[] = [];
  for (let i = 0; i < n; i++) {
    const flags = b[p++];
    let tag: string;
    if ((flags & 63) === 63) {
      tag = tag4(b, p);
      p += 4;
    } else tag = WOFF2_TAGS[flags & 63];
    const version = flags >> 6;
    const orig = base128();
    // glyf and loca are stored changed (version 0) and say so with a second length; hmtx with version 1; the rest as they are.
    const changed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    entries.push({ tag, len: changed ? base128() : orig });
  }
  const data = brotli(b.subarray(p, p + compressed));
  const t: Tables = new Map();
  let at = 0;
  for (const e of entries) {
    t.set(e.tag, data.subarray(at, at + e.len));
    at += e.len;
  }
  return t;
}

/** Every face a font file holds. Returns nothing for a file it cannot read. */
export function readFontFaces(bytes: Uint8Array, brotli?: (data: Uint8Array) => Uint8Array): FontFace[] {
  try {
    if (tag4(bytes, 0) === 'wOF2') {
      const t = brotli ? woff2Tables(bytes, brotli) : null;
      return t ? facesOfTables(t) : [];
    }
    const out: FontFace[] = [];
    for (let i = 0; i < fontCount(bytes); i++) {
      const t = sfntTables(bytes, i);
      if (t) out.push(...facesOfTables(t));
    }
    return out;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- picking a face

/** The CSS weight of a style word, for fonts whose files do not say (the usual words only). */
const clampWeight = (w: number) => Math.min(900, Math.max(100, w));

/**
 * The face that answers a text's family, weight and slant: the family compared without case or spaces, then the same
 * slant if there is one, then the nearest weight (the way a browser picks, lighter first when the wanted weight is under 400).
 */
export function pickFace(faces: FontFace[], family: string, weight: number, italic: boolean): FontFace | null {
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const want = key(family);
  const inFamily = faces.filter((f) => key(f.family) === want);
  if (!inFamily.length) return null;
  const sameSlant = inFamily.filter((f) => f.italic === italic);
  const pool = sameSlant.length ? sameSlant : inFamily;
  const w = clampWeight(weight);
  let best: FontFace | null = null;
  let bestScore = Infinity;
  for (const f of pool) {
    const diff = f.weight - w;
    // Nearest weight; on a tie, the heavier one for a heavy wish and the lighter one for a light wish.
    const score = Math.abs(diff) * 2 + (w < 400 ? (diff > 0 ? 1 : 0) : diff < 0 ? 1 : 0) + (sameSlant.length ? 0 : 0.5);
    if (score < bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}
