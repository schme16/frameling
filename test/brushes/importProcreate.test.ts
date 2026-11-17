// Procreate .brush and .brushset: the binary plist reader against known values, each real file's mapping, the settings that
// have no real file (built to the layout), and the refusals for damaged and hostile files. The real files are in
// test/fixtures/brushes/procreate (NOTICE.txt says where each is from).
import { readFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseBplist, parsePlist, parsePlistXml, PLIST_LIMITS, PlistDate, Uid, unarchive, type PlistValue } from '../../src/brushes/import/bplist';
import { readBrushFile, sniff } from '../../src/brushes/import';
import { PIXELS_PER_SIZE } from '../../src/brushes/import/procreate';
import { bufferSurface, DabStroke } from '../../src/dab/stroke';
import { encodePng } from '../../src/io/png';

const fx = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../fixtures/brushes/procreate/${n}`, import.meta.url)));
const text = (s: string): Uint8Array => new TextEncoder().encode(s);

// ---------------------------------------------------------------- a small writer, to build files to the layout

/** Writes a binary property list: two byte references, four byte offsets. Objects are numbered as they are met. */
function bplist(root: PlistValue | { date: number }): Uint8Array {
  const objs: number[][] = [];
  const be = (v: number, n: number): number[] => Array.from({ length: n }, (_, i) => Math.floor(v / 2 ** (8 * (n - 1 - i))) & 255);
  const head = (hi: number, len: number): number[] => (len < 15 ? [(hi << 4) | len] : [(hi << 4) | 15, 0x11, ...be(len, 2)]);
  const add = (v: PlistValue | { date: number }): number => {
    const at = objs.length;
    objs.push([]);
    if (v === null) objs[at] = [0x00];
    else if (typeof v === 'boolean') objs[at] = [v ? 0x09 : 0x08];
    else if (typeof v === 'number') {
      if (Number.isInteger(v) && v >= 0 && v < 2 ** 31) objs[at] = [0x12, ...be(v, 4)];
      else {
        const b = new Uint8Array(8);
        new DataView(b.buffer).setFloat64(0, v, false);
        objs[at] = [0x23, ...b];
      }
    } else if (typeof v === 'string') {
      if (/^[\x00-\x7f]*$/.test(v)) objs[at] = [...head(5, v.length), ...Array.from(v, (c) => c.charCodeAt(0))];
      else objs[at] = [...head(6, v.length), ...Array.from(v).flatMap((c) => be(c.charCodeAt(0), 2))];
    } else if (v instanceof Uint8Array) objs[at] = [...head(4, v.length), ...v];
    else if (v instanceof Uid) objs[at] = [0x80 | 0, v.n];
    else if (v instanceof PlistDate || (typeof v === 'object' && v !== null && 'date' in v)) {
      const b = new Uint8Array(8);
      new DataView(b.buffer).setFloat64(0, (v as { date: number }).date ?? (v as PlistDate).seconds, false);
      objs[at] = [0x33, ...b];
    } else if (Array.isArray(v)) {
      const refs = v.map(add);
      objs[at] = [...head(0xa, refs.length), ...refs.flatMap((r) => be(r, 2))];
    } else {
      const keys = Object.keys(v);
      const kr = keys.map(add);
      const vr = keys.map((k) => add((v as Record<string, PlistValue>)[k]));
      objs[at] = [...head(0xd, keys.length), ...kr.flatMap((r) => be(r, 2)), ...vr.flatMap((r) => be(r, 2))];
    }
    return at;
  };
  add(root);
  const out: number[] = [...text('bplist00')];
  const offsets = objs.map((o) => {
    const at = out.length;
    out.push(...o);
    return at;
  });
  const table = out.length;
  for (const o of offsets) out.push(...be(o, 4));
  // The trailer is 32 bytes: 5 spare, sort version, offset size, reference size, object count, top object, table position.
  const trailer = new Uint8Array(32);
  trailer[6] = 4;
  trailer[7] = 2;
  trailer.set(be(objs.length, 8), 8);
  trailer.set(be(0, 8), 16);
  trailer.set(be(table, 8), 24);
  return new Uint8Array([...out, ...trailer]);
}

type Plain = number | boolean | string | null | Plain[] | { [k: string]: Plain };

/** A Procreate `Brush.archive`: a keyed archive whose root is a SilicaBrush made of these settings. */
function archive(settings: Record<string, Plain>): Uint8Array {
  const objects: PlistValue[] = ['$null'];
  const put = (v: PlistValue): Uid => {
    objects.push(v);
    return new Uid(objects.length - 1);
  };
  const klass = (name: string): Uid => put({ $classname: name, $classes: [name, 'NSObject'] });
  const cBrush = klass('SilicaBrush');
  const cArray = klass('NSArray');
  const cCurve = klass('ValkyrieMagnitudinalCurve');
  const conv = (v: Plain): PlistValue => {
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (v === null) return new Uid(0);
    if (typeof v === 'string') return put(v);
    if (Array.isArray(v)) return put({ 'NS.objects': v.map(conv), $class: cArray });
    return put({ ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)])), $class: cCurve });
  };
  const root: Record<string, PlistValue> = { $class: cBrush };
  for (const [k, v] of Object.entries(settings)) root[k] = conv(v);
  const at = put(root);
  return bplist({ $archiver: 'NSKeyedArchiver', $version: 100000, $top: { root: at }, $objects: objects });
}

const flat = (n: string, pts: [number, number][] = [[0, 0], [1, 1]]) => ({ [n]: { points: pts.map(([x, y]) => `{${x.toFixed(6)}, ${y.toFixed(6)}}`) } });

/** A disc, grey, as a PNG: `ink` is what it is drawn in (255 is white) on the other grey. */
function discPng(side: number, ink: number, ground: number, alpha = 255): Uint8Array {
  const px = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const inside = Math.hypot(x - side / 2 + 0.5, y - side / 2 + 0.5) < side * 0.35;
      const v = inside ? ink : ground;
      px.set([v, v, v, alpha], (y * side + x) * 4);
    }
  return encodePng({ width: side, height: side, pixels: px });
}

/**
 * Procreate's own picture of a stroke, as a .brush carries it: a straight bar `wide` pixels thick on clear, with a gap
 * in it every so often so the measuring sees separate dabs, the way a scattered brush's picture does.
 */
function strokePng(w: number, h: number, wide: number, gapEvery = 0): Uint8Array {
  const px = new Uint8ClampedArray(w * h * 4);
  const mid = h / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const on = y >= mid - wide / 2 && y < mid + wide / 2 && x > 4 && x < w - 5 && !(gapEvery && x % gapEvery >= gapEvery - 2);
      if (on) px.set([0, 0, 0, 255], (y * w + x) * 4);
    }
  return encodePng({ width: w, height: h, pixels: px });
}

/** A .brush built by hand. */
function brush(settings: Record<string, Plain>, files: Record<string, Uint8Array> = {}, withShape = true): Uint8Array {
  return zipSync({ 'Brush.archive': archive({ name: 'Built', paintSize: 0.3, plotSpacing: 0.2, ...settings }), ...(withShape ? { 'Shape.png': discPng(64, 255, 0) } : {}), ...files });
}

const one = (zip: Uint8Array, name = 'x.brush') => {
  const r = readBrushFile(zip, name);
  if (!r.ok) throw new Error(r.error);
  return r.brushes[0];
};

// ---------------------------------------------------------------- the reader

describe('binary property list reader', () => {
  it('reads every kind of value, including both string widths', () => {
    const v = parseBplist(bplist({ n: 7, big: 70000, neg: -2.5, t: true, f: false, z: null, s: 'plain', u: 'café ☃', d: new Uint8Array([1, 2, 3]), when: { date: 1234.5 }, list: [1, 'two', [3]], deep: { a: { b: 4 } } })) as Record<string, unknown>;
    expect(v).toMatchObject({ n: 7, big: 70000, neg: -2.5, t: true, f: false, z: null, s: 'plain', u: 'café ☃', list: [1, 'two', [3]], deep: { a: { b: 4 } } });
    expect(Array.from(v.d as Uint8Array)).toEqual([1, 2, 3]);
    expect((v.when as PlistDate).seconds).toBe(1234.5);
  });

  it('reads long strings, arrays and data (a length of 15 or more is its own number)', () => {
    const long = 'x'.repeat(300);
    const v = parseBplist(bplist({ long, many: Array.from({ length: 40 }, (_, i) => i), raw: new Uint8Array(200).fill(9) })) as Record<string, unknown>;
    expect(v.long).toBe(long);
    expect((v.many as number[]).length).toBe(40);
    expect((v.raw as Uint8Array).length).toBe(200);
  });

  it('a key called __proto__ is only a key', () => {
    const v = parseBplist(bplist(JSON.parse('{"__proto__": 1, "ok": 2}'))) as Record<string, unknown>;
    expect(v.ok).toBe(2);
    expect(Object.getPrototypeOf(v)).toBe(null);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  describe('a real Brush.archive', () => {
    const seed = parsePlist(unzipSync(fx('Seed.brush'))['Brush.archive']);
    const root = unarchive(seed) as Record<string, unknown>;
    it('is unwrapped from its keyed archive into plain values', () => {
      expect(root.$classname).toBe('SilicaBrush');
      expect(root.name).toBe('Seed');
      expect(root.paintSize).toBe(1);
      expect(root.plotSpacing).toBeCloseTo(0.0025825779885053635, 12);
      expect(root.plotSpacingVersion).toBe(1);
      expect(root.shapeInverted).toBe(false);
      expect(root.bundledGrainPath).toBe('Brush-Preset-Blank.png');
      expect(root.bundledShapePath).toBe(null);
      expect(root.savedPaintSizes).toEqual([]);
      expect(root.creationDate).toBeInstanceOf(PlistDate);
      expect(root.dynamicsPressureSizeCurve).toMatchObject({ points: ['{0.000000, 0.000000}', '{1.000000, 1.000000}'] });
      expect(Object.keys(root).length).toBeGreaterThan(200);
    });
    it('the older, smaller files read too (44 settings)', () => {
      const o = unarchive(parsePlist(unzipSync(fx('Plain_Stitch.brush'))['Brush.archive'])) as Record<string, unknown>;
      expect(o.name).toBe('Plain Stitch');
      expect(o.plotSpacing).toBeCloseTo(0.5507699847221375, 12);
      expect(o.shapeRotation).toBe(1);
      expect(o.dynamicsLoad).toBeCloseTo(0.41532257199287415, 12);
      expect(Object.keys(o).length).toBeLessThan(60);
    });
  });

  describe('keyed archives', () => {
    it('0 means nothing, NS.objects is an array, NS.time is a date, NS.keys makes a dictionary', () => {
      const a = bplist({
        $archiver: 'NSKeyedArchiver',
        $top: { root: new Uid(1) },
        $objects: ['$null', { a: new Uid(0), list: new Uid(2), when: new Uid(3), map: new Uid(4), $class: new Uid(6) }, { 'NS.objects': [new Uid(5), 7] }, { 'NS.time': 99 }, { 'NS.keys': [new Uid(5)], 'NS.objects': [new Uid(2)] }, 'word', { $classname: 'Thing' }],
      });
      const v = unarchive(parseBplist(a)) as Record<string, unknown>;
      expect(v.a).toBe(null);
      expect(v.list).toEqual(['word', 7]);
      expect((v.when as PlistDate).seconds).toBe(99);
      expect(v.map).toEqual({ word: ['word', 7] });
      expect(v.$classname).toBe('Thing');
    });
    it('an archive that points back at itself ends, as nothing, not forever', () => {
      const a = bplist({ $archiver: 'NSKeyedArchiver', $top: { root: new Uid(1) }, $objects: ['$null', { me: new Uid(1), kid: new Uid(2) }, { up: new Uid(1) }] });
      const v = unarchive(parseBplist(a)) as Record<string, unknown>;
      expect(v.me).toBe(null);
      expect(v.kid).toEqual({ up: null });
    });
    it('a pointer past the list is refused', () => {
      const a = bplist({ $archiver: 'NSKeyedArchiver', $top: { root: new Uid(1) }, $objects: ['$null', { x: new Uid(99) }] });
      expect(() => unarchive(parseBplist(a))).toThrow(/damaged/);
    });
    it('something that is not a keyed archive gives null', () => {
      expect(unarchive(parseBplist(bplist({ a: 1 })))).toBe(null);
      expect(unarchive(parseBplist(bplist([1, 2])))).toBe(null);
    });
  });

  describe('refuses what is damaged or hostile, in plain words', () => {
    const good = bplist({ a: [1, 2, 3], b: 'text' });
    const patch = (f: (b: Uint8Array, dv: DataView) => void): Uint8Array => {
      const b = good.slice();
      f(b, new DataView(b.buffer));
      return b;
    };
    const trailerAt = good.length - 32;
    it('is not a plist at all', () => {
      expect(() => parseBplist(text('not a plist, just words, and a bit longer than forty bytes of it'))).toThrow(/damaged/);
      expect(() => parseBplist(new Uint8Array(0))).toThrow();
    });
    it('cut short', () => {
      for (const n of [8, 20, 39, good.length - 33, good.length - 1]) expect(() => parseBplist(good.subarray(0, n))).toThrow();
    });
    it('an absurd object count', () => {
      const b = patch((_, dv) => dv.setUint32(trailerAt + 12, 0x7fffffff, false));
      expect(() => parseBplist(b)).toThrow(/far bigger/);
      const c = patch((_, dv) => dv.setUint32(trailerAt + 12, PLIST_LIMITS.objects + 1, false));
      expect(() => parseBplist(c)).toThrow(/far bigger/);
    });
    it('an offset table that does not fit in the file', () => {
      expect(() => parseBplist(patch((_, dv) => dv.setUint32(trailerAt + 28, good.length * 4, false)))).toThrow(/damaged/);
    });
    it('a top object that does not exist, or reference and offset sizes that make no sense', () => {
      expect(() => parseBplist(patch((_, dv) => dv.setUint32(trailerAt + 20, 9999, false)))).toThrow(/damaged/);
      expect(() => parseBplist(patch((b) => (b[trailerAt + 7] = 0)))).toThrow(/damaged/);
      expect(() => parseBplist(patch((b) => (b[trailerAt + 6] = 99)))).toThrow(/damaged/);
    });
    it('an offset that points outside the objects', () => {
      const table = new DataView(good.buffer).getUint32(trailerAt + 28, false);
      expect(() => parseBplist(patch((_, dv) => dv.setUint32(table, 0xffffff, false)))).toThrow(/damaged/);
    });
    it('nesting that is far too deep', () => {
      let v: PlistValue = 1;
      for (let i = 0; i < PLIST_LIMITS.depth + 20; i++) v = [v];
      expect(() => parseBplist(bplist(v))).toThrow(/far bigger/);
    });
    it('a string that claims to be very long', () => {
      expect(() => parseBplist(bplist('y'.repeat(PLIST_LIMITS.string + 1)))).toThrow(/far bigger/);
      // A claimed length bigger than the file, with the data not there.
      const b = bplist('hello');
      const t = b.length - 32;
      const off = new DataView(b.buffer).getUint32(t + 28, false);
      const at = new DataView(b.buffer).getUint32(off, false);
      b[at] = 0x5f;
      b[at + 1] = 0x12;
      new DataView(b.buffer).setUint32(at + 2, 0x7fffffff, false);
      expect(() => parseBplist(b)).toThrow();
    });
    it('an object that contains itself', () => {
      const b = bplist([[1]]);
      const t = b.length - 32;
      const table = new DataView(b.buffer).getUint32(t + 28, false);
      // Object 1 (the inner array) is made to name object 0 (the outer one) as its only item.
      const at = new DataView(b.buffer).getUint32(table + 4, false);
      b[at + 1] = 0;
      b[at + 2] = 0;
      expect(() => parseBplist(b)).toThrow(/damaged/);
    });
    it('an array that names the same array twice, level after level (a bomb of shared objects)', () => {
      // Thirty levels, each holding the one below twice: read out in full it is a billion steps, from a file of 150 bytes.
      const levels = 30;
      const objs: number[][] = [[0x10, 7]];
      for (let i = 1; i <= levels; i++) objs.push([0xa2, i - 1, i - 1]);
      const out: number[] = [...text('bplist00')];
      const offs = objs.map((o) => {
        const at = out.length;
        out.push(...o);
        return at;
      });
      const table = out.length;
      out.push(...offs);
      const tr = new Uint8Array(32);
      tr[6] = 1;
      tr[7] = 1;
      new DataView(tr.buffer).setUint32(12, objs.length, false);
      new DataView(tr.buffer).setUint32(20, levels, false);
      new DataView(tr.buffer).setUint32(28, table, false);
      const bytes = new Uint8Array([...out, ...tr]);
      expect(bytes.length).toBeLessThan(200);
      expect(() => parseBplist(bytes)).toThrow(/far bigger/);
    });
  });

  describe('XML property lists (a brush set list may be one)', () => {
    it('reads dictionaries, arrays, strings, numbers and booleans', () => {
      const v = parsePlistXml(`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>name</key><string>My set</string><key>brushes</key><array><string>A1</string><string>B2</string></array><key>n</key><integer>3</integer><key>r</key><real>0.5</real><key>ok</key><true/></dict></plist>`);
      expect(v).toMatchObject({ name: 'My set', brushes: ['A1', 'B2'], n: 3, r: 0.5, ok: true });
    });
    it('anything else is refused', () => {
      expect(() => parsePlistXml('<html></html>')).toThrow();
      expect(() => parsePlist(text('just some words, not a list'))).toThrow();
    });
  });
});

// ---------------------------------------------------------------- the real files

describe('the real Procreate brushes', () => {
  const read = (n: string) => {
    const r = readBrushFile(fx(n), n);
    if (!r.ok) throw new Error(r.error);
    expect(r.format).toBe('procreate');
    expect(r.brushes).toHaveLength(1);
    return r.brushes[0];
  };
  const meanRow = (px: Uint8ClampedArray, W: number, H: number, y: number) => px.slice((y * W) * 4, (y * W + W) * 4).reduce((a, v, i) => a + (i % 4 === 3 ? v : 0), 0) / W;

  it('Sequins: a soft picture tip, the inverted shape, scatter, spacing past one', () => {
    const b = read('Sequins.brush');
    expect(b.name).toBe('Sequins');
    const d = b.dab;
    expect(d.tip).toBe('picture');
    expect(d.picture?.soft).toBe(true);
    // The picture is the dark sequin on white (shapeInverted), so the part that paints is the round sequin, not the square.
    expect(d.picture!.w).toBeGreaterThanOrEqual(28);
    expect(d.picture!.cells.filter((c) => c === 0).length).toBeGreaterThan(20);
    // The size is measured off Procreate's own picture of the stroke: one sequin is 57 pixels across there, which is
    // what the dab was measured at by hand when the scatter was settled.
    expect(d.size).toBe(57);
    // Spacing 1.006 and scatter 0.877 are counted in the whole picture; here in the part you see (about 93% of it).
    expect(d.spacing).toBeCloseTo(1.006 / 0.93, 1);
    expect(d.scatter).toBeCloseTo(0.877 / 0.93, 1);
    expect(d.follow).toBe(false);
    expect(d.dynamics).toEqual([]);
    expect(d.grain).toBe(null);
    expect(b.dropped).toEqual([]);
    expect(b.changed.join(' ')).toMatch(/shrunk/);
  });

  it('Plain Stitch: a thin stitch that turns along the line, spacing counted in the stitch', () => {
    const b = read('Plain_Stitch.brush');
    expect(b.name).toBe('Plain Stitch');
    const d = b.dab;
    expect(d.tip).toBe('picture');
    expect(d.follow).toBe(true);
    // The stitch is a long thin shape: about half the picture wide and a seventh of that tall.
    expect(d.picture!.w).toBeGreaterThan(d.picture!.h * 2);
    // Measured off Procreate's picture: the stitch is 12 pixels across the line, and the tip's longer side (the brush's
    // size) is about three and a half times that.
    expect(d.size).toBe(43);
    // 0.551 of the whole picture is nearly one stitch length (0.54 of the picture), so the stitches sit end to end with a gap.
    expect(d.spacing).toBeGreaterThan(0.9);
    expect(d.spacing).toBeLessThan(1.1);
    expect(d.scatter).toBe(0);
    expect(b.dropped).toEqual([]);
  });

  it('Plain Stitch drawn: separate stitches, not a solid line', () => {
    const d = read('Plain_Stitch.brush').dab;
    const W = 600;
    const H = 90;
    const px = new Uint8ClampedArray(W * H * 4);
    const s = new DabStroke(bufferSurface(px, W, H), { brush: d, color: [0, 0, 0, 255], edge: 'smooth', seed: 1 });
    for (let x = 30; x < 570; x++) s.moveTo({ x, y: 45 }, d.size, 1, { pressure: 1, speed: 0.4 });
    s.finish();
    // Walk along the middle row: the paint thins between one stitch and the next rather than running solid.
    const row: number[] = [];
    for (let x = 60; x < 540; x++) row.push(px[(45 * W + x) * 4 + 3]);
    const peak = Math.max(...row);
    let gaps = 0;
    let inGap = false;
    for (const a of row) {
      if (a < peak * 0.6 && !inGap) (gaps++, (inGap = true));
      if (a > peak * 0.9) inGap = false;
    }
    expect(gaps).toBeGreaterThanOrEqual(5);
    void meanRow;
  });

  it('Seed: a plain square, size off its stroke picture, the press on opacity, nothing else', () => {
    const b = read('Seed.brush');
    const d = b.dab;
    expect(d.tip).toBe('square');
    // Procreate's picture of this stroke is a 219 pixel ribbon; paintSize is 1, which would have said 100.
    expect(d.size).toBe(219);
    expect(b.changed.join(' ')).toMatch(/measured off Procreate's own picture/);
    // plotSpacing 0.0026 is closer than Frameling's closest, which is 1%.
    expect(d.spacing).toBe(0.01);
    expect(d.dynamics).toEqual([{ from: 'pressure', to: 'flow', amount: 1, invert: false }]);
    // grainDepth is 1, but the grain is Procreate's blank one, which catches nothing: so there is no grain.
    expect(d.grain).toBe(null);
    expect(d.dual).toBe(null);
    expect(d.wet).toBe(0);
    expect(b.dropped).toEqual([]);
    expect(b.changed.join(' ')).toMatch(/read by their names only/);
    expect(b.changed.join(' ')).toMatch(/flow/);
  });

  it('is found by the file ending, and by what is inside when the ending says nothing', () => {
    expect(sniff(fx('Seed.brush'), 'Seed.brush')).toBe('procreate');
    expect(sniff(fx('Seed.brush'), 'download')).toBe('procreate');
    expect(sniff(fx('Plain_Stitch.brush'), 'a.zip')).toBe('procreate');
    expect(readBrushFile(fx('Seed.brush'), 'whatever')).toMatchObject({ ok: true, format: 'procreate' });
  });
});

// ---------------------------------------------------------------- settings with no real file: built to the layout

describe('settings, built to the layout', () => {
  it('size, opacity and roundness', () => {
    // No stroke picture in this made up file, so the size falls back to paintSize.
    const d = one(brush({ paintSize: 0.5, paintOpacity: 0.6, shapeRoundness: 0.4 })).dab;
    expect(d.size).toBeCloseTo(0.5 * PIXELS_PER_SIZE * 0.7, -1);
    expect(d.opacity).toBe(0.6);
    expect(d.roundness).toBe(0.4);
  });

  it('white paints, and shapeInverted flips it', () => {
    // A white disc on black: the disc paints. The same flag on a black disc on white: the disc paints again.
    const white = one(brush({}, { 'Shape.png': discPng(64, 255, 0) })).dab;
    const inverted = one(brush({ shapeInverted: true }, { 'Shape.png': discPng(64, 0, 255) })).dab;
    expect(white.tip).toBe('picture');
    expect(inverted.tip).toBe('picture');
    expect(inverted.picture!.cells.join()).toBe(white.picture!.cells.join());
    // The wrong way round paints the corners and not the disc.
    const wrong = one(brush({ shapeInverted: true }, { 'Shape.png': discPng(64, 255, 0) })).dab;
    expect(wrong.picture!.cells.join()).not.toBe(white.picture!.cells.join());
  });

  it('a shape that is all see-through has nothing to paint with, so it is refused', () => {
    const r = readBrushFile(brush({}, { 'Shape.png': discPng(64, 255, 255, 0) }), 'x.brush');
    expect(r.ok).toBe(false);
  });

  it('a tip with nothing in it is refused', () => {
    const r = readBrushFile(brush({}, { 'Shape.png': discPng(32, 0, 0) }), 'x.brush');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/);
  });

  it('no Shape.png (a built in shape) is a round tip, and says so', () => {
    const b = one(brush({ bundledShapePath: 'Brush-Preset-Soft.png' }, {}, false));
    expect(b.dab.tip).toBe('round');
    expect(b.changed.join(' ')).toMatch(/Brush-Preset-Soft\.png.*round tip/);
  });

  it('scatter, jitter, rotation and the random turn', () => {
    const b = one(brush({ shapeScatter: 0.3, plotJitter: 0.1, plotSpacing: 1, shapeRotation: 1, shapeRandomise: true }));
    expect(b.dab.scatter).toBeGreaterThan(0.3);
    expect(b.dab.follow).toBe(true);
    expect(b.dab.angleJitter).toBe(1);
    expect(b.changed.join(' ')).toMatch(/jitter came as scatter/);
    expect(b.changed.join(' ')).toMatch(/turned at random/);
  });

  it('scatter turns the tip too, unless the tip follows the line', () => {
    // Procreate's scatter turns the shape as well as throwing it, so any scatter at all means a full random turn.
    expect(one(brush({ shapeScatter: 0.3, plotSpacing: 1 })).dab.angleJitter).toBe(1);
    // A tip told to follow the line keeps following it: the two cannot both happen, and following is the clearer ask.
    expect(one(brush({ shapeScatter: 0.3, plotSpacing: 1, shapeRotation: 1 })).dab.angleJitter).toBe(0);
    expect(one(brush({ shapeScatter: 0, plotSpacing: 1 })).dab.angleJitter).toBe(0);
  });

  // The finding that fixed the inking pens. Procreate's own picture of the stroke, which every .brush carries, shows
  // Sequins (scatter 0.877, dabs a width apart) throwing its sequins off the line, and Dry Ink v2 (scatter 1, spacing
  // 0) drawing a clean thin line with nothing off it. So the number is not a share of the brush width on its own: it
  // goes with the spacing, and a brush whose dabs sit on top of each other has nowhere to scatter to.
  it('scatter goes with the spacing: the same number scatters a stamped brush and not a solid one', () => {
    const stamped = one(brush({ shapeScatter: 1, plotSpacing: 1 }));
    const solid = one(brush({ shapeScatter: 1, plotSpacing: 0 }));
    expect(stamped.dab.scatter).toBeGreaterThan(0.8);
    expect(solid.dab.scatter).toBe(0);
    expect(stamped.changed.join(' ')).toMatch(/scatter and the spacing together/);
  });

  it('a scatter or spacing past what Frameling goes is held, and says so', () => {
    const b = one(brush({ shapeScatter: 5, plotSpacing: 9 }));
    expect(b.dab.scatter).toBe(2);
    expect(b.dab.spacing).toBe(4);
    expect(b.changed.join(' ')).toMatch(/most, 200%/);
    expect(b.changed.join(' ')).toMatch(/widest, 400%/);
  });

  it('a newer file with a wide spacing says its spacing was not checked; a close one does not', () => {
    expect(one(brush({ plotSpacing: 0.5, plotSpacingVersion: 1 })).changed.join(' ')).toMatch(/newer Procreate/);
    expect(one(brush({ plotSpacing: 0.01, plotSpacingVersion: 1 })).changed.join(' ')).not.toMatch(/newer Procreate/);
  });

  it('pen controls become routes, with their curves, and a negative one is turned over', () => {
    const b = one(brush({ dynamicsPressureSize: 0.6, ...flat('dynamicsPressureSizeCurve', [[0, 0], [0.3, 0.7], [1, 1]]), dynamicsTiltOpacity: -0.5, dynamicsSpeedHue: 0.3, dynamicsRollSize: 0.01 }));
    const r = b.dab.dynamics;
    expect(r.find((x) => x.from === 'pressure' && x.to === 'size')).toMatchObject({ amount: 0.6, invert: false });
    expect(r.find((x) => x.from === 'pressure' && x.to === 'size')?.curve).toBeTruthy();
    expect(r.find((x) => x.from === 'tilt' && x.to === 'flow')).toMatchObject({ amount: 0.5, invert: true });
    expect(r.find((x) => x.from === 'speed' && x.to === 'hue')).toBeTruthy();
    expect(r.find((x) => x.from === 'twist')).toBeUndefined();
    expect(b.changed.join(' ')).toMatch(/pressure on size, tilt on opacity, speed on hue/);
  });

  it('jitters: size is size jitter, the others are random routes', () => {
    const d = one(brush({ dynamicsJitterSize: 0.4, dynamicsJitterOpacity: 0.5, dynamicsJitterHue: 0.2 })).dab;
    expect(d.sizeJitter).toBe(0.4);
    expect(d.dynamics).toEqual(
      expect.arrayContaining([
        { from: 'random', to: 'flow', amount: 0.5, invert: false },
        { from: 'random', to: 'hue', amount: 0.2, invert: false },
      ]),
    );
  });

  it('more pen controls than a brush may hold are cut, with a note', () => {
    const all: Record<string, number> = {};
    for (const s of ['Pressure', 'Tilt', 'Speed', 'Roll']) for (const t of ['Size', 'Opacity', 'Hue', 'Saturation', 'Brightness']) all[`dynamics${s}${t}`] = 0.5;
    const b = one(brush(all));
    expect(b.dab.dynamics.length).toBeLessThanOrEqual(16);
    expect(b.dropped.join(' ')).toMatch(/at most 16 pen controls/);
  });

  it('what has no equivalent is named, only when the brush really uses it', () => {
    const plain = one(brush({}));
    expect(plain.dropped).toEqual([]);
    const b = one(brush({ taperStartLength: 0.5, shapeCount: 0.3, plotSmoothing: 0.4, metallicAmount: 0.7, burntEdgesAmount: 0.2, wetEdgesAmount: 0.3, dynamicsGlaze: true, dynamicsBlur: 0.5, shapeAzimuth: true, shapeAngle: 1.2 }));
    const said = b.dropped.join(' | ');
    for (const w of [/taper/, /count/, /smoothing/, /metallic/, /burnt edges/, /wet edges/, /glazing/, /bleed and blur/, /direction or roll/, /fixed tip angle/]) expect(said).toMatch(w);
  });

  it('a blend mode is left out with its number, a dual brush is left out, the wet mix is kept', () => {
    const files = { 'Sub01/Brush.archive': archive({ name: 'Second' }), 'Sub01/Shape.png': discPng(32, 255, 0) };
    const b = one(brush({ blendMode: 11, dynamicsMix: 0.6 }, files));
    expect(b.dropped.join(' ')).toMatch(/blend mode \(number 11\)/);
    expect(b.dropped.join(' ')).toMatch(/dual brush/);
    expect(b.dab.wet).toBe(0.6);
    expect(b.dab.blend).toBe('normal');
    // Procreate's inner brush is not a brush of its own in a set.
    const r = readBrushFile(brush({}, files), 'x.brush');
    expect(r.ok && r.brushes).toHaveLength(1);
  });

  it('a grain picture becomes the paper, with a note; a named built in grain is left out; the blank one is no grain', () => {
    const noise = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) noise.set([(i * 97) % 256, (i * 97) % 256, (i * 97) % 256, 255], i * 4);
    const grainPng = encodePng({ width: 64, height: 64, pixels: noise });
    const withPicture = one(brush({ grainDepth: 0.5, textureScale: 2, textureMovement: 1, textureInverted: true }, { 'Grain.png': grainPng })).dab;
    // A file's own grain picture comes in gentler too: Procreate's depth number bites far less there than here.
    expect(withPicture.grain).toMatchObject({ scale: 2, moving: true, invert: true });
    expect(withPicture.grain!.depth).toBeCloseTo(0.3375, 2);
    expect(withPicture.grain?.picture?.side).toBeGreaterThanOrEqual(8);
    // Procreate's own papers are not in the file, only named. A name that says what tooth it has gets the nearest
    // paper Frameling draws itself, so a pencil arrives gritty rather than smooth, and the brush says which stood in.
    const named = one(brush({ bundledGrainPath: 'Brush-Artery-Charcoal-Corse.jpg', grainDepth: 1 }));
    expect(named.dab.grain).toMatchObject({ paper: 'fine', moving: false });
    // A stand in paper is gentler than the file asks, because Frameling's papers bite harder than Procreate's.
    expect(named.dab.grain!.depth).toBeCloseTo(0.25, 2);
    expect(named.changed.join(' ')).toMatch(/Charcoal-Corse\.jpg.*gritty paper/);
    expect(one(brush({ bundledGrainPath: 'Brush-Preset-Pastel-Paper.jpg', grainDepth: 1 })).dab.grain).toMatchObject({ paper: 'laid' });
    // A name that says nothing about tooth gets no stand in: Shenbot's Inking Pen names "Brush-Artery-Splatters.png"
    // and Procreate's own picture of its stroke is smooth, so guessing a paper there made the pens speckly.
    const vague = one(brush({ bundledGrainPath: 'Brush-Artery-Splatters.png', grainDepth: 0.7 }));
    expect(vague.dab.grain).toBe(null);
    expect(vague.dropped.join(' ')).toMatch(/Brush-Artery-Splatters\.png.*no paper/);
    expect(one(brush({ bundledGrainPath: 'Brush-Preset-Blank.png', grainDepth: 1 })).dab.grain).toBe(null);
    // A grain picture with nothing in it (flat grey) catches nothing, so there is no grain.
    const flatPng = encodePng({ width: 32, height: 32, pixels: new Uint8ClampedArray(32 * 32 * 4).fill(128) });
    expect(one(brush({}, { 'Grain.png': flatPng })).dab.grain).toBe(null);
  });

  it('a missing setting takes its default, and nothing the file says goes outside what a brush can be', () => {
    const d = one(brush({ paintSize: 9e9, paintOpacity: -4, shapeRoundness: 0, plotSpacing: -1, shapeScatter: NaN as unknown as number })).dab;
    expect(d.size).toBeLessThanOrEqual(300);
    expect(d.opacity).toBeGreaterThanOrEqual(0.05);
    expect(d.roundness).toBeGreaterThanOrEqual(0.05);
    expect(d.spacing).toBeGreaterThanOrEqual(0.01);
    expect(d.scatter).toBeGreaterThanOrEqual(0);
  });

  it('a brush with no name takes the file name', () => {
    const z = zipSync({ 'Brush.archive': archive({ paintSize: 0.2 }), 'Shape.png': discPng(32, 255, 0) });
    const r = readBrushFile(z, 'My_Cool_Brush.brush');
    expect(r.ok && r.brushes[0].name).toBe('My Cool Brush');
  });
});

// ---------------------------------------------------------------- sets

describe('a .brushset', () => {
  const ARCH = (name: string) => archive({ name, paintSize: 0.3, plotSpacing: 0.3 });
  const folder = (id: string, name: string, extra: Record<string, Uint8Array> = {}) => ({ [`${id}/Brush.archive`]: ARCH(name), [`${id}/Shape.png`]: discPng(32, 255, 0), ...extra });
  const listXml = (name: string, ids: string[]) => text(`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>name</key><string>${name}</string><key>brushes</key><array>${ids.map((i) => `<string>${i}</string>`).join('')}</array></dict></plist>`);
  const set = (list: Uint8Array | null) => zipSync({ ...(list ? { 'brushset.plist': list } : {}), ...folder('AAAA-1', 'First'), ...folder('BBBB-2', 'Second'), ...folder('CCCC-3', 'Third') });

  it('reads the set name and the brush order from an XML list', () => {
    const r = readBrushFile(set(listXml('Inkers', ['CCCC-3', 'AAAA-1', 'BBBB-2'])), 'pack.brushset');
    expect(r).toMatchObject({ ok: true, format: 'procreate', setName: 'Inkers' });
    if (r.ok) {
      expect(r.brushes.map((b) => b.name)).toEqual(['Third', 'First', 'Second']);
      expect(r.notes).toEqual([]);
    }
  });

  it('reads the same list as a binary plist', () => {
    const r = readBrushFile(set(bplist({ name: 'Binary set', brushes: ['BBBB-2', 'AAAA-1'] })), 'pack.brushset');
    expect(r).toMatchObject({ ok: true, setName: 'Binary set' });
    if (r.ok) expect(r.brushes.map((b) => b.name)).toEqual(['Second', 'First', 'Third']);
  });

  it('a list that names brushes that are not there is skipped, and the rest follow in name order', () => {
    const r = readBrushFile(set(listXml('Half', ['NOPE', 'CCCC-3'])), 'pack.brushset');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes.map((b) => b.name)).toEqual(['Third', 'First', 'Second']);
  });

  it('no list, or a broken one: every folder with a Brush.archive, in name order, with a note', () => {
    for (const list of [null, text('<plist><dict><key>name'), bplist({ unrelated: 1 }), new Uint8Array(50).fill(7)]) {
      const r = readBrushFile(set(list), 'My_Set.brushset');
      if (!r.ok) throw new Error(r.error);
      expect(r.brushes.map((b) => b.name)).toEqual(['First', 'Second', 'Third']);
      expect(r.setName).toBe('My Set');
      expect(r.notes.join(' ')).toMatch(/list of brushes could not be read/);
    }
  });

  it('a brush that is damaged is left out and counted, the others come in', () => {
    const z = zipSync({ ...folder('A-1', 'Good'), 'B-2/Brush.archive': text('not a plist at all, but long enough to be looked at'), 'B-2/Shape.png': discPng(32, 255, 0), ...folder('C-3', 'Also good') });
    const r = readBrushFile(z, 'x.brushset');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes.map((b) => b.name)).toEqual(['Good', 'Also good']);
    expect(r.notes.join(' ')).toMatch(/1 brush could not be read/);
  });

  it('each brush finds its own pictures in its own folder', () => {
    const z = zipSync({ ...folder('A-1', 'Round', { 'A-1/Shape.png': discPng(64, 255, 0) }), ...folder('B-2', 'Square', { 'B-2/Shape.png': encodePng({ width: 32, height: 32, pixels: new Uint8ClampedArray(32 * 32 * 4).fill(255) }) }) });
    const r = readBrushFile(z, 'x.brushset');
    if (!r.ok) throw new Error(r.error);
    expect(r.brushes.map((b) => b.dab.tip)).toEqual(['picture', 'square']);
  });

  it('a set renamed .brush is still read as a set, and a single brush as a .brushset is one brush', () => {
    expect(readBrushFile(set(null), 'x.brush')).toMatchObject({ ok: true });
    const r = readBrushFile(fx('Seed.brush'), 'x.brushset');
    expect(r.ok && r.brushes.length).toBe(1);
  });
});

// ---------------------------------------------------------------- refusals

describe('a damaged or hostile Procreate file is refused in plain words, and nothing throws', () => {
  const seed = fx('Seed.brush');
  const refused = (bytes: Uint8Array, name = 'x.brush') => {
    let r: ReturnType<typeof readBrushFile> | undefined;
    expect(() => (r = readBrushFile(bytes, name))).not.toThrow();
    expect(r).toMatchObject({ ok: false });
    return r as { ok: false; error: string };
  };

  it('a truncated zip', () => {
    for (const n of [seed.length - 5, seed.length - 200, Math.floor(seed.length / 2), 100, 30]) refused(seed.subarray(0, n));
  });

  it('a zip with no Brush.archive', () => {
    const r = refused(zipSync({ 'Shape.png': discPng(32, 255, 0), 'readme.txt': text('hello') }));
    expect(r.error).toMatch(/no brush in it/);
  });

  it('a Brush.archive that is not a plist, or is a plist of something else', () => {
    expect(refused(zipSync({ 'Brush.archive': text('this is not a property list, it is only words') })).error).toMatch(/damaged|does not look like/);
    expect(refused(zipSync({ 'Brush.archive': bplist({ hello: 'world' }) })).error).toMatch(/does not look like a Procreate brush/);
    expect(refused(zipSync({ 'Brush.archive': archive({ unrelated: 1 }).slice(0, 60) })).error).toBeTruthy();
    // A keyed archive that is not a brush.
    const other = bplist({ $archiver: 'NSKeyedArchiver', $top: { root: new Uid(1) }, $objects: ['$null', { colour: 'red' }] });
    expect(refused(zipSync({ 'Brush.archive': other })).error).toMatch(/none of the settings a brush has/);
  });

  it('a zip bomb: a Brush.archive that unpacks to far more than any brush', () => {
    const z = zipSync({ 'Brush.archive': new Uint8Array(40 * 1024 * 1024), 'Shape.png': discPng(8, 255, 0) }, { level: 9 });
    expect(z.length).toBeLessThan(100000);
    expect(refused(z).error).toMatch(/far more than/);
  });

  it('a Shape.png that is a zip bomb, or says it is enormous', () => {
    const bomb = zipSync({ 'Brush.archive': archive({ name: 'B' }), 'Shape.png': new Uint8Array(60 * 1024 * 1024) }, { level: 9 });
    expect(refused(bomb).error).toMatch(/far more than/);
    const head = discPng(8, 255, 0).slice();
    new DataView(head.buffer).setUint32(16, 100000, false);
    new DataView(head.buffer).setUint32(20, 100000, false);
    expect(refused(zipSync({ 'Brush.archive': archive({ name: 'B' }), 'Shape.png': head })).error).toMatch(/will not open|damaged/);
    expect(refused(zipSync({ 'Brush.archive': archive({ name: 'B' }), 'Shape.png': text('not a png') })).error).toBeTruthy();
  });

  it('a plist with an absurd object count, inside a good zip', () => {
    const b = bplist({ a: 1 });
    new DataView(b.buffer).setUint32(b.length - 32 + 12, 0x7fffffff, false);
    expect(refused(zipSync({ 'Brush.archive': b })).error).toMatch(/far bigger/);
  });

  it('a plist nested far too deep, inside a good zip', () => {
    let v: PlistValue = 1;
    for (let i = 0; i < 100; i++) v = [v];
    expect(refused(zipSync({ 'Brush.archive': bplist(v) })).error).toMatch(/far bigger/);
  });

  it('a set whose list is hostile still reads (the list is only for the order)', () => {
    const b = bplist({ name: 'x' });
    new DataView(b.buffer).setUint32(b.length - 32 + 12, 0x7fffffff, false);
    const z = zipSync({ 'brushset.plist': b, 'A-1/Brush.archive': archive({ name: 'One' }), 'A-1/Shape.png': discPng(32, 255, 0) });
    const r = readBrushFile(z, 'x.brushset');
    expect(r.ok && r.brushes).toHaveLength(1);
  });

  it('a list of contents that points outside the file, and one that claims thousands of files', () => {
    const z = new Uint8Array(zipSync({ 'Brush.archive': archive({ name: 'a' }) }));
    const dv = new DataView(z.buffer);
    const e = z.length - 22;
    dv.setUint32(dv.getUint32(e + 16, true) + 42, 0x7ffffff0, true);
    refused(z);
    const y = new Uint8Array(zipSync({ 'Brush.archive': archive({ name: 'a' }) }));
    const dy = new DataView(y.buffer);
    dy.setUint16(y.length - 22 + 8, 60000, true);
    dy.setUint16(y.length - 22 + 10, 60000, true);
    expect(refused(y).error).toMatch(/far more than a brush set holds/);
  });

  it('is not a zip at all', () => {
    refused(new Uint8Array(3000).fill(0x50));
    refused(text('hello, I am not a brush at all, honest'));
  });

  it('bytes flipped anywhere in a real file never throw', () => {
    for (const name of ['Seed.brush', 'Plain_Stitch.brush', 'Sequins.brush']) {
      const f = fx(name);
      for (let k = 0; k < 120; k++) {
        const b = f.slice();
        const at = (k * 2654435761) % b.length;
        b[at] ^= 0xff;
        b[(at + 7) % b.length] ^= 0x55;
        expect(() => readBrushFile(b, name)).not.toThrow();
      }
      for (const cut of [1, 17, 333, Math.floor(f.length * 0.7)]) expect(() => readBrushFile(f.subarray(0, f.length - cut), name)).not.toThrow();
    }
  });

  it('bytes flipped inside the unpacked plist and picture never throw either', () => {
    const inner = unzipSync(fx('Plain_Stitch.brush'));
    for (let k = 0; k < 150; k++) {
      const arch = inner['Brush.archive'].slice();
      arch[8 + ((k * 7919) % (arch.length - 8))] ^= 0xff;
      const shape = inner['Shape.png'].slice();
      shape[(k * 104729) % shape.length] ^= 0xff;
      const z = zipSync({ 'Brush.archive': arch, 'Shape.png': k % 2 ? shape : inner['Shape.png'] });
      expect(() => readBrushFile(z, 'x.brush')).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------- the size, off Procreate's own stroke picture

describe("size from Procreate's own picture of the stroke", () => {
  it('takes the width of one dab across the line, not paintSize', () => {
    // paintSize 0.3 would say 30 pixels (and 21 after the disc's share of the picture); the picture says 40.
    const b = one(brush({ paintSize: 0.3 }, { 'QuickLook/Thumbnail.png': strokePng(400, 120, 40) }));
    expect(b.dab.size).toBe(40);
    expect(b.changed.join(' ')).toMatch(/40 pixels across, measured off Procreate's own picture/);
  });

  it('a gap between scattered dabs does not widen it', () => {
    const solid = one(brush({ paintSize: 0.3 }, { 'QuickLook/Thumbnail.png': strokePng(400, 120, 30) })).dab.size;
    const dashed = one(brush({ paintSize: 0.3 }, { 'QuickLook/Thumbnail.png': strokePng(400, 120, 30, 20) })).dab.size;
    expect(solid).toBe(30);
    expect(dashed).toBe(30);
  });

  it('a squashed tip is measured across the line, so the brush comes in wider than the mark', () => {
    const d = one(brush({ paintSize: 0.3, shapeRoundness: 0.5 }, { 'QuickLook/Thumbnail.png': strokePng(400, 120, 30) })).dab;
    expect(d.roundness).toBe(0.5);
    expect(d.size).toBe(60);
  });

  it('falls back to paintSize when there is no picture, or when the picture cannot say', () => {
    expect(one(brush({ paintSize: 0.5 })).dab.size).toBeCloseTo(0.5 * PIXELS_PER_SIZE * 0.7, -1);
    // A stroke that fills the picture top to bottom was drawn bigger than the picture.
    const full = one(brush({ paintSize: 0.5 }, { 'QuickLook/Thumbnail.png': strokePng(400, 120, 200) }));
    expect(full.dab.size).toBeCloseTo(0.5 * PIXELS_PER_SIZE * 0.7, -1);
    expect(full.changed.join(' ')).not.toMatch(/measured off/);
  });

  it('a picture too small to measure is ignored rather than trusted', () => {
    expect(one(brush({ paintSize: 0.5 }, { 'QuickLook/Thumbnail.png': strokePng(6, 6, 2) })).dab.size).toBeCloseTo(0.5 * PIXELS_PER_SIZE * 0.7, -1);
  });

  it('never comes in smaller than the smallest or wider than the widest', () => {
    expect(one(brush({ paintSize: 0.3 }, { 'QuickLook/Thumbnail.png': strokePng(400, 120, 2) })).dab.size).toBe(6);
    expect(one(brush({ paintSize: 0.3 }, { 'QuickLook/Thumbnail.png': strokePng(900, 800, 700) })).dab.size).toBe(300);
  });
});
