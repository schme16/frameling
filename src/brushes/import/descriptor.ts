// Photoshop's "action descriptor": a tree of named values that modern .abr files keep every brush setting in. The layout
// is in Adobe's published Photoshop file format notes (the "Descriptor structure" section). Read defensively: depth,
// item counts and string lengths are held to limits, and every read is bounds checked (see bytes.ts).
import { Reader } from './bytes';
import { BrushProblem } from './types';

export type DescValue = number | string | boolean | DescObject | DescValue[] | { unit: string; value: number } | { enumType: string; enumValue: string } | null;
export interface DescObject {
  /** The class it says it is, for example 'brushPreset'. */
  type: string;
  items: Map<string, DescValue>;
}

const MAX_DEPTH = 24;
const MAX_ITEMS = 100_000;

class Budget {
  items = 0;
  take(n = 1): void {
    this.items += n;
    if (this.items > MAX_ITEMS) throw new BrushProblem('That brush file has far more settings in it than a brush has, so it is probably damaged.');
  }
}

/** A string kept as 16-bit characters: length first (in characters), then the characters. A trailing zero is dropped. */
function unicode(r: Reader): string {
  const n = r.u32();
  if (n * 2 > r.left) throw new BrushProblem('A name in that brush file runs past the end of the file.');
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(r.u16());
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

/** An identifier: a length, then that many bytes; a length of zero means four bytes. */
function key(r: Reader): string {
  const n = r.u32() || 4;
  if (n > 256) throw new BrushProblem('That brush file has a damaged setting name in it.');
  return String.fromCharCode(...r.take(n));
}

function value(r: Reader, depth: number, budget: Budget): DescValue {
  const t = r.tag();
  return valueOf(t, r, depth, budget);
}

function valueOf(t: string, r: Reader, depth: number, budget: Budget): DescValue {
  budget.take();
  switch (t) {
    case 'Objc':
    case 'GlbO':
      return object(r, depth + 1, budget);
    case 'VlLs': {
      if (depth > MAX_DEPTH) throw new BrushProblem('That brush file nests its settings too deeply, so it is probably damaged.');
      const n = r.u32();
      if (n > r.left) throw new BrushProblem('A list in that brush file is longer than the file.');
      const out: DescValue[] = [];
      for (let i = 0; i < n; i++) out.push(value(r, depth + 1, budget));
      return out;
    }
    case 'doub':
      return r.f64();
    case 'UntF': {
      const unit = r.tag();
      return { unit, value: r.f64() };
    }
    case 'UnFl': {
      const unit = r.tag();
      r.skip(4);
      return { unit, value: 0 };
    }
    case 'TEXT':
      return unicode(r);
    case 'enum': {
      const enumType = key(r);
      return { enumType, enumValue: key(r) };
    }
    case 'long':
      return r.i32();
    case 'comp':
      r.skip(8);
      return 0;
    case 'bool':
      return r.u8() !== 0;
    case 'type':
    case 'GlbC':
      unicode(r);
      key(r);
      return null;
    case 'alis':
    case 'tdta': {
      const n = r.u32();
      r.skip(n);
      return null;
    }
    default:
      // Reference lists, paths and object arrays: nothing a brush needs, and the length of one is not safe to guess.
      throw new BrushProblem(`That brush file holds a kind of setting Frameling does not know ("${t.replace(/[^\x20-\x7e]/g, '?')}"), so it can't be read safely.`);
  }
}

function object(r: Reader, depth: number, budget: Budget): DescObject {
  if (depth > MAX_DEPTH) throw new BrushProblem('That brush file nests its settings too deeply, so it is probably damaged.');
  unicode(r);
  const type = key(r);
  const n = r.u32();
  if (n > r.left) throw new BrushProblem('A group of settings in that brush file is longer than the file.');
  const items = new Map<string, DescValue>();
  for (let i = 0; i < n; i++) {
    const k = key(r);
    items.set(k, value(r, depth, budget));
  }
  return { type, items };
}

/** One descriptor, from where the reader stands. */
export function readDescriptor(r: Reader): DescObject {
  return object(r, 0, new Budget());
}

// ---------------------------------------------------------------- reading values back out

export const isObject = (v: DescValue | undefined): v is DescObject => !!v && typeof v === 'object' && !Array.isArray(v) && 'items' in v;
export const isUnit = (v: DescValue | undefined): v is { unit: string; value: number } => !!v && typeof v === 'object' && !Array.isArray(v) && 'unit' in v;
export const isEnum = (v: DescValue | undefined): v is { enumType: string; enumValue: string } => !!v && typeof v === 'object' && !Array.isArray(v) && 'enumType' in v;

export const getObj = (o: DescObject | undefined, k: string): DescObject | undefined => {
  const v = o?.items.get(k);
  return isObject(v) ? v : undefined;
};
export const getBool = (o: DescObject | undefined, k: string): boolean | undefined => {
  const v = o?.items.get(k);
  return typeof v === 'boolean' ? v : undefined;
};
export const getStr = (o: DescObject | undefined, k: string): string | undefined => {
  const v = o?.items.get(k);
  return typeof v === 'string' ? v : undefined;
};
/** A number from a plain number or a unit value (a percent, pixels, an angle). */
export const getNum = (o: DescObject | undefined, k: string): number | undefined => {
  const v = o?.items.get(k);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (isUnit(v) && Number.isFinite(v.value)) return v.value;
  return undefined;
};
export const getEnum = (o: DescObject | undefined, k: string): string | undefined => {
  const v = o?.items.get(k);
  return isEnum(v) ? v.enumValue : undefined;
};
export const getList = (o: DescObject | undefined, k: string): DescValue[] | undefined => {
  const v = o?.items.get(k);
  return Array.isArray(v) ? v : undefined;
};
