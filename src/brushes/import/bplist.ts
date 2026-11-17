// Apple property lists, for Procreate brushes: the binary kind (`bplist00`) that Procreate keeps a brush's settings in,
// the "keyed archive" layer on top of it (`NSKeyedArchiver`, where values point at each other by number), and the plain
// XML kind a brush set's list may be in. Read from the public format descriptions and from real files, never from Apple's
// or anyone's code. The file is not trusted: every size, count, index and depth is checked before it is used, the number
// of objects, the nesting, the string and data lengths and the total work are all capped, and anything wrong ends in a
// `BrushProblem`, never a crash or a huge allocation. Nothing here is ever run. Pure, no DOM.
import { BrushProblem } from './types';
import { parseXml, type XNode } from './xml';

/** A reference to another object in a keyed archive. Number 0 means "nothing". */
export class Uid {
  constructor(readonly n: number) {}
}

/** A date: seconds since 1 January 2001, as Apple keeps it. */
export class PlistDate {
  constructor(readonly seconds: number) {}
}

export type PlistValue = null | boolean | number | string | Uint8Array | PlistDate | Uid | PlistValue[] | PlistDict;
/** A dictionary. Made with no prototype, so a key called `__proto__` is only a key. */
export interface PlistDict {
  [key: string]: PlistValue;
}

/** Ceilings. The biggest real brush has about 300 objects; these leave a great deal of room and still stop a hostile file. */
export const PLIST_LIMITS = {
  /** Objects in the file. */
  objects: 50_000,
  /** Levels of array or dictionary inside each other. */
  depth: 32,
  /** Characters in one string. */
  string: 4096,
  /** Bytes in one data item. */
  data: 1 << 20,
  /** Items in one array or dictionary. */
  items: 10_000,
  /** Objects visited in all, counting a shared one each time it is reached (stops a file that points at itself many times over). */
  visits: 200_000,
};

const newDict = (): PlistDict => Object.create(null) as PlistDict;

const bad = (): never => {
  throw new BrushProblem("That Procreate brush's settings are damaged, so it can't be read.");
};
const tooBig = (): never => {
  throw new BrushProblem("That Procreate brush's settings are far bigger than a real brush's, so Frameling stopped: it is damaged or made to cause trouble.");
};

/** A big-endian unsigned number of 1 to 8 bytes, as a plain number (anything past 2^53 is held there, never trusted). */
function beUint(b: Uint8Array, at: number, size: number): number {
  let v = 0;
  for (let i = 0; i < size; i++) v = v * 256 + b[at + i];
  return Math.min(v, Number.MAX_SAFE_INTEGER);
}

const HEADER = 'bplist00';

/** True when the bytes begin like a binary property list. */
export const isBplist = (b: Uint8Array): boolean => b.length >= 40 && String.fromCharCode(...b.subarray(0, 8)) === HEADER;

/** Reads a binary property list into plain values. */
export function parseBplist(bytes: Uint8Array): PlistValue {
  if (!isBplist(bytes)) return bad();
  const n = bytes.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The trailer: 5 spare bytes, sort version, offset size, reference size, object count, top object, offset table position.
  const t = n - 32;
  const offSize = bytes[t + 6];
  const refSize = bytes[t + 7];
  const count = beUint(bytes, t + 8, 8);
  const top = beUint(bytes, t + 16, 8);
  const tableAt = beUint(bytes, t + 24, 8);
  if (offSize < 1 || offSize > 8 || refSize < 1 || refSize > 8) bad();
  if (count < 1) bad();
  if (count > PLIST_LIMITS.objects) tooBig();
  if (top >= count) bad();
  if (tableAt < 8 || tableAt + count * offSize > t) bad();
  if (refSize < 8 && count > 2 ** (8 * refSize)) bad();
  const offsets = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const o = beUint(bytes, tableAt + i * offSize, offSize);
    if (o < 8 || o >= t) bad();
    offsets[i] = o;
  }

  let visits = 0;
  const active = new Set<number>();

  /** The length that goes with a marker: in its low four bits, or (when they are 15) in an integer object just after. */
  const lengthAt = (at: number, low: number): { len: number; next: number } => {
    if (low !== 15) return { len: low, next: at + 1 };
    if (at + 1 >= t) return bad();
    const m = bytes[at + 1];
    if (m >> 4 !== 1) return bad();
    const size = 2 ** (m & 15);
    if (size > 8 || at + 2 + size > t) return bad();
    return { len: beUint(bytes, at + 2, size), next: at + 2 + size };
  };

  const refAt = (p: number): number => {
    if (p + refSize > t) return bad();
    const r = beUint(bytes, p, refSize);
    if (r >= count) return bad();
    return r;
  };

  const read = (index: number, depth: number): PlistValue => {
    if (depth > PLIST_LIMITS.depth) return tooBig();
    if (++visits > PLIST_LIMITS.visits) return tooBig();
    const at = offsets[index];
    const marker = bytes[at];
    const hi = marker >> 4;
    const lo = marker & 15;
    switch (hi) {
      case 0:
        if (lo === 0 || lo === 15) return null;
        if (lo === 8) return false;
        if (lo === 9) return true;
        return bad();
      case 1: {
        const size = 2 ** lo;
        if (size > 16 || at + 1 + size > t) return bad();
        // Up to 8 bytes are a number; a 16 byte one is read from its low 8 bytes (nothing real is that big).
        return size === 16 ? beUint(bytes, at + 9, 8) : size === 8 ? Number(view.getBigInt64(at + 1, false)) : beUint(bytes, at + 1, size);
      }
      case 2: {
        if (lo === 2) return at + 5 <= t ? view.getFloat32(at + 1, false) : bad();
        if (lo === 3) return at + 9 <= t ? view.getFloat64(at + 1, false) : bad();
        return bad();
      }
      case 3:
        return lo === 3 && at + 9 <= t ? new PlistDate(view.getFloat64(at + 1, false)) : bad();
      case 4: {
        const { len, next } = lengthAt(at, lo);
        if (len > PLIST_LIMITS.data) return tooBig();
        if (next + len > t) return bad();
        return bytes.slice(next, next + len);
      }
      case 5: {
        const { len, next } = lengthAt(at, lo);
        if (len > PLIST_LIMITS.string) return tooBig();
        if (next + len > t) return bad();
        return String.fromCharCode(...bytes.subarray(next, next + len));
      }
      case 6: {
        const { len, next } = lengthAt(at, lo);
        if (len > PLIST_LIMITS.string) return tooBig();
        if (next + len * 2 > t) return bad();
        let s = '';
        for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint16(next + i * 2, false));
        return s;
      }
      case 7: {
        const { len, next } = lengthAt(at, lo);
        if (len > PLIST_LIMITS.string * 4) return tooBig();
        if (next + len > t) return bad();
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(next, next + len));
      }
      case 8: {
        const size = lo + 1;
        if (size > 8 || at + 1 + size > t) return bad();
        return new Uid(beUint(bytes, at + 1, size));
      }
      case 10:
      case 12: {
        const { len, next } = lengthAt(at, lo);
        if (len > PLIST_LIMITS.items) return tooBig();
        if (next + len * refSize > t) return bad();
        if (active.has(index)) return bad();
        active.add(index);
        const out: PlistValue[] = [];
        for (let i = 0; i < len; i++) out.push(read(refAt(next + i * refSize), depth + 1));
        active.delete(index);
        return out;
      }
      case 13: {
        const { len, next } = lengthAt(at, lo);
        if (len > PLIST_LIMITS.items) return tooBig();
        if (next + len * refSize * 2 > t) return bad();
        if (active.has(index)) return bad();
        active.add(index);
        const out = newDict();
        for (let i = 0; i < len; i++) {
          const key = read(refAt(next + i * refSize), depth + 1);
          if (typeof key !== 'string') return bad();
          out[key] = read(refAt(next + (len + i) * refSize), depth + 1);
        }
        active.delete(index);
        return out;
      }
      default:
        return bad();
    }
  };
  return read(top, 0);
}

// ---------------------------------------------------------------- keyed archives

const isDict = (v: PlistValue): v is PlistDict => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array) && !(v instanceof Uid) && !(v instanceof PlistDate);

/**
 * Unwraps an `NSKeyedArchiver` archive into plain values. `$top.root` is the start; a number that points at the first
 * object (0) means "nothing"; an `NS.objects` array is an array; `NS.keys` with `NS.objects` is a dictionary; `NS.time` is a
 * date; any other object is a dictionary of its own keys (with its class name under `$classname`). A reference that loops
 * back on itself comes back as `null`. Returns null when the value is not a keyed archive.
 */
export function unarchive(archive: PlistValue): PlistValue | null {
  if (!isDict(archive)) return null;
  const objects = archive.$objects;
  const top = archive.$top;
  if (!Array.isArray(objects) || !isDict(top)) return null;
  if (objects.length > PLIST_LIMITS.objects) return tooBig();
  const root = top.root ?? Object.values(top)[0];
  let visits = 0;
  const inside = new Set<number>();

  const classNameOf = (v: PlistValue): string | undefined => {
    if (!(v instanceof Uid)) return undefined;
    const c = objects[v.n];
    return isDict(c) && typeof c.$classname === 'string' ? c.$classname.slice(0, 80) : undefined;
  };

  const walk = (v: PlistValue, depth: number): PlistValue => {
    if (depth > PLIST_LIMITS.depth) return tooBig();
    if (++visits > PLIST_LIMITS.visits) return tooBig();
    if (v instanceof Uid) {
      if (v.n === 0) return null;
      if (v.n >= objects.length) return bad();
      if (inside.has(v.n)) return null;
      inside.add(v.n);
      const out = walk(objects[v.n], depth + 1);
      inside.delete(v.n);
      return out;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (!isDict(v)) return v;
    const list = v['NS.objects'];
    if (Array.isArray(list)) {
      const keys = v['NS.keys'];
      if (Array.isArray(keys)) {
        const out = newDict();
        for (let i = 0; i < Math.min(keys.length, list.length); i++) {
          const k = walk(keys[i], depth + 1);
          if (typeof k === 'string') out[k] = walk(list[i], depth + 1);
        }
        return out;
      }
      return list.map((x) => walk(x, depth + 1));
    }
    if ('NS.time' in v) {
      const s = v['NS.time'];
      return typeof s === 'number' ? new PlistDate(s) : null;
    }
    if ('NS.data' in v) {
      const d = v['NS.data'];
      return d instanceof Uint8Array ? d : null;
    }
    if (typeof v['NS.string'] === 'string') return v['NS.string'];
    const out = newDict();
    for (const k of Object.keys(v)) {
      if (k === '$class') {
        const name = classNameOf(v[k]);
        if (name) out.$classname = name;
        continue;
      }
      out[k] = walk(v[k], depth + 1);
    }
    return out;
  };
  return walk(root, 0);
}

// ---------------------------------------------------------------- XML property lists

/** Reads an XML property list (`<plist><dict>...`) into plain values. */
export function parsePlistXml(text: string): PlistValue {
  const root = parseXml(text, 'brush set list');
  const plist = root.name === 'plist' ? root : root.children.find((c) => c.name === 'plist');
  const first = plist?.children[0];
  if (!first) return bad();
  let visits = 0;
  const value = (n: XNode, depth: number): PlistValue => {
    if (depth > PLIST_LIMITS.depth) return tooBig();
    if (++visits > PLIST_LIMITS.visits) return tooBig();
    const text = n.text.trim();
    switch (n.name) {
      case 'true':
        return true;
      case 'false':
        return false;
      case 'integer':
      case 'real': {
        const v = Number(text);
        return Number.isFinite(v) ? v : null;
      }
      case 'string':
        return n.text.slice(0, PLIST_LIMITS.string);
      case 'date': {
        const ms = Date.parse(text);
        return Number.isFinite(ms) ? new PlistDate(ms / 1000 - 978307200) : null;
      }
      case 'data':
        return null;
      case 'array':
        return n.children.slice(0, PLIST_LIMITS.items).map((c) => value(c, depth + 1));
      case 'dict': {
        const out = newDict();
        const kids = n.children.slice(0, PLIST_LIMITS.items * 2);
        for (let i = 0; i + 1 < kids.length; i += 2) if (kids[i].name === 'key') out[kids[i].text.trim().slice(0, 200)] = value(kids[i + 1], depth + 1);
        return out;
      }
      default:
        return null;
    }
  };
  return value(first, 0);
}

/** A property list of either kind (binary or XML) as plain values. Throws a `BrushProblem` when it is neither. */
export function parsePlist(bytes: Uint8Array): PlistValue {
  if (isBplist(bytes)) return parseBplist(bytes);
  if (bytes.length > 16 * 1024 * 1024) return tooBig();
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!text.includes('<plist') && !text.includes('<dict')) return bad();
  return parsePlistXml(text);
}
