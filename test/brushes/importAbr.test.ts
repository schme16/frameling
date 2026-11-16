import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readBrushFile } from '../../src/brushes/import';
import { cleanDab } from '../../src/dab/maths';

const fx = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../fixtures/brushes/abr/${n}`, import.meta.url)));
const cat = (...parts: number[][]): number[] => parts.flat();
const u16 = (n: number): number[] => [(n >> 8) & 255, n & 255];
const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const uni = (s: string): number[] => cat(u32(s.length + 1), ...[...s].map((c) => u16(c.charCodeAt(0))), u16(0));
const key = (k: string): number[] => (k.length === 4 ? cat(u32(0), ascii(k)) : cat(u32(k.length), ascii(k)));
const f64 = (v: number): number[] => [...new Uint8Array(new Float64Array([v]).buffer)].reverse();

type V = number[];
const unit = (u: string, v: number): V => cat(ascii('UntF'), ascii(u), f64(v));
const bool = (b: boolean): V => cat(ascii('bool'), [b ? 1 : 0]);
const long = (n: number): V => cat(ascii('long'), u32(n));
const text = (s: string): V => cat(ascii('TEXT'), uni(s));
const en = (t: string, v: string): V => cat(ascii('enum'), key(t), key(v));
const obj = (cls: string, items: Record<string, V>): V => cat(ascii('Objc'), uni(''), key(cls), u32(Object.keys(items).length), ...Object.entries(items).map(([k, v]) => cat(key(k), v)));
const list = (vs: V[]): V => cat(ascii('VlLs'), u32(vs.length), ...vs);
const dyn = (code: number, jitter = 0, min = 0, steps = 25): V => obj('brVr', { bVTy: long(code), fStp: long(steps), jitter: unit('#Prc', jitter), 'Mnm ': unit('#Prc', min) });

const round = (items: Record<string, V> = {}, tip: Record<string, V> = {}): V =>
  obj('brushPreset', {
    'Nm  ': text('Test brush'),
    Brsh: obj('computedBrush', { Dmtr: unit('#Pxl', 20), Hrdn: unit('#Prc', 50), Angl: unit('#Ang', 0), Rndn: unit('#Prc', 100), Spcn: unit('#Prc', 30), Intr: bool(true), ...tip }),
    ...items,
  });

const section = (key4: string, body: number[]): number[] => cat(ascii('8BIM'), ascii(key4), u32(body.length), body, new Array((4 - (body.length % 4)) % 4).fill(0));
/** A version 6 file with the given presets and sampled tips already built. */
const abr = (presets: V[], samp: number[] = []): Uint8Array => new Uint8Array(cat(u16(6), u16(2), section('samp', samp), section('patt', []), section('desc', cat(u32(16), cat(ascii('Objc'), uni(''), key('null'), u32(1), key('Brsh'), list(presets)).slice(4)))));

/** A sampled tip entry: an id, the 264 byte block, the bounds, 8 bit depth, raw. */
const tip = (id: string, w: number, h: number, px: (x: number, y: number) => number, packed = false): number[] => {
  const rows: number[][] = [];
  for (let y = 0; y < h; y++) rows.push(Array.from({ length: w }, (_, x) => px(x, y)));
  let data: number[];
  if (packed) {
    // PackBits, one literal run per row.
    const enc = rows.map((r) => cat([r.length - 1], r));
    data = cat(...enc.map((e) => u16(e.length)), ...enc);
  } else data = rows.flat();
  const body = cat([id.length], ascii(id), new Array(264).fill(0), u32(0), u32(0), u32(h), u32(w), u16(8), [packed ? 1 : 0], data);
  return cat(u32(body.length), body, new Array((4 - (body.length % 4)) % 4).fill(0));
};
const sampled = (id: string, items: Record<string, V> = {}, dm = 20): V =>
  obj('brushPreset', { 'Nm  ': text('Sampled'), Brsh: obj('sampledBrush', { Dmtr: unit('#Pxl', dm), Angl: unit('#Ang', 0), Rndn: unit('#Prc', 100), Spcn: unit('#Prc', 25), Intr: bool(true), sampledData: text(id) }), ...items });

const read = (b: Uint8Array) => {
  const r = readBrushFile(b, 'test.abr');
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe('Photoshop .abr, real files', () => {
  it('reads a soft round brush', () => {
    const b = read(fx('soft-round.abr')).brushes[0];
    expect(b.name).toBe('Soft Round');
    expect(b.dab).toMatchObject({ tip: 'round', size: 30, hardness: 0, spacing: 0.25, roundness: 1 });
    expect(b.dropped).toEqual([]);
    expect(b.changed).toEqual([]);
  });
  it('turns a Control menu on size into a route', () => {
    const b = read(fx('tilt-size.abr')).brushes[0];
    expect(b.dab.dynamics).toEqual([{ from: 'tilt', to: 'size', amount: 1, invert: false }]);
  });
  it('maps what it can of a real brush with dynamics and says what it cannot', () => {
    const b = read(fx('photoshop_dynamics.abr')).brushes[0];
    expect(b.name).toBe('Patchy Dynamics Probe Dyn');
    expect(b.dab).toMatchObject({ tip: 'picture', spacing: 0.4, angle: 30, roundness: 0.6, sizeJitter: 0.37, angleJitter: 0.1, scatter: 2 });
    // Opacity jitter 25% became a flow jitter; angle control by pen rotation became a twist route.
    expect(b.dab.dynamics).toContainEqual({ from: 'random', to: 'flow', amount: 0.25, invert: false });
    expect(b.dab.dynamics.some((r) => r.from === 'twist' && r.to === 'angle')).toBe(true);
    expect(b.dropped.join(' ')).toMatch(/roundness jitter/);
    expect(b.dropped.join(' ')).toMatch(/count of 4/);
    expect(b.changed.join(' ')).toMatch(/scatter of 250% was held to 200%/);
    // The tip picture is the real one, soft.
    expect(b.dab.picture!.soft).toBe(true);
  });
  it('leaves out a dual brush made of a plain round tip, and says why', () => {
    const b = read(fx('photoshop_dual_brush.abr')).brushes[0];
    expect(b.dab.dual).toBeNull();
    expect(b.dropped.join(' ')).toMatch(/dual brush \(a plain round second tip with a colour burn blend\)/);
  });
  it('turns a textured dual brush into dots no bigger than a quarter of the brush', () => {
    const t = tip('abc', 8, 8, () => 255);
    const dual = obj('dualBrush', { useDualBrush: bool(true), Brsh: obj('sampledBrush', { Dmtr: unit('#Pxl', 80), sampledData: text('abc') }), BlnM: en('BlnM', 'Mltp'), 'Cnt ': long(2) });
    const b = read(abr([round({ dualBrush: dual }, { Dmtr: unit('#Pxl', 40) })], t)).brushes[0];
    expect(b.dab.dual).toMatchObject({ tip: 'round', size: 10, density: 0.7, cut: false });
    expect(b.changed.join(' ')).toMatch(/field of round dots about 10 pixels/);
    expect(b.dropped.join(' ')).toMatch(/dual brush's own tip picture/);
  });
});

describe('Photoshop .abr, built to the layout', () => {
  it('maps minimum diameter and fade steps', () => {
    const r = read(abr([round({ useTipDynamics: bool(true), minimumDiameter: unit('#Prc', 20), szVr: dyn(1, 0, 0, 10) })]));
    const d = r.brushes[0].dab;
    expect(d.dynamics).toEqual([{ from: 'fade', to: 'size', amount: 0.8, invert: false }]);
    // 10 steps x spacing (0.3 x 20 px) = 60 px.
    expect(d.fadeLength).toBe(60);
  });
  it('turns the line with direction control', () => {
    const d = read(abr([round({ useTipDynamics: bool(true), angleDynamics: dyn(6, 0) })])).brushes[0].dab;
    expect(d.follow).toBe(true);
  });
  it('drops a pen setting Frameling has no input for, with a note', () => {
    const b = read(abr([round({ useTipDynamics: bool(true), szVr: dyn(4) })])).brushes[0];
    expect(b.dab.dynamics).toEqual([]);
    expect(b.dropped.join(' ')).toMatch(/stylus wheel/);
  });
  it('does not count opacity and flow pressure twice', () => {
    const d = read(abr([round({ usePaintDynamics: bool(true), opVr: dyn(2), prVr: dyn(2) })])).brushes[0].dab;
    expect(d.dynamics.filter((r) => r.to === 'flow')).toHaveLength(1);
  });
  it('lists every setting it leaves out', () => {
    const b = read(abr([round({ useColorDynamics: bool(true), Wtdg: bool(true), Nose: bool(true), 'Rpt ': bool(true) })])).brushes[0];
    expect(b.dropped).toHaveLength(4);
    expect(b.dropped.join(' ')).toMatch(/colour dynamics/);
  });
  it('ignores the settings of a group that is switched off', () => {
    const b = read(abr([round({ useTipDynamics: bool(false), szVr: dyn(2, 80), useScatter: bool(false), scatterDynamics: dyn(0, 100) })])).brushes[0];
    expect(b.dab.sizeJitter).toBe(0);
    expect(b.dab.scatter).toBe(0);
    expect(b.dab.dynamics).toEqual([]);
    expect(b.dropped).toEqual([]);
  });
  it('turns a bristle tip into a round one and says so', () => {
    const p = obj('brushPreset', { 'Nm  ': text('Bristly'), Brsh: obj('dBrush', { Dmtr: unit('#Pxl', 25), Spcn: unit('#Prc', 2), Intr: bool(true) }) });
    const b = read(abr([p])).brushes[0];
    expect(b.dab.tip).toBe('round');
    expect(b.dab.roundness).toBe(1);
    expect(b.dropped[0]).toMatch(/bristle/);
  });
  it('reads a sampled tip, raw and packed, and keeps its shading', () => {
    for (const packed of [false, true]) {
      const t = tip('abc', 8, 8, (x) => (x < 4 ? 255 : 100), packed);
      const b = read(abr([sampled('abc')], t)).brushes[0];
      expect(b.dab.tip).toBe('picture');
      expect(b.dab.picture).toMatchObject({ w: 8, h: 8, soft: true });
      expect(b.dab.size).toBe(20);
    }
  });
  it('trims the empty margin of a tip and scales the size to what shows', () => {
    const t = tip('abc', 20, 20, (x, y) => (x >= 5 && x < 15 && y >= 5 && y < 15 ? 255 : 0));
    const b = read(abr([sampled('abc', {}, 40)], t)).brushes[0];
    expect(b.dab.picture).toMatchObject({ w: 10, h: 10 });
    expect(b.dab.size).toBe(20);
  });
  it('takes only the brushes it can read from a set, and counts the rest', () => {
    const bad = sampled('missing');
    const r = read(abr([round(), bad, round()], tip('abc', 4, 4, () => 255)));
    expect(r.brushes).toHaveLength(2);
    expect(r.notes.join(' ')).toMatch(/1 brush in the set could not be read/);
  });
  it('every brush that comes out is already clean', () => {
    for (const f of ['soft-round.abr', 'tilt-size.abr', 'photoshop_dynamics.abr', 'photoshop_dual_brush.abr']) {
      for (const b of read(fx(f)).brushes) expect(cleanDab(b.dab)).toEqual(b.dab);
    }
  });
});

describe('Photoshop .abr, version 1 and 2', () => {
  const sampledRecord = (version: 1 | 2, w: number, h: number, name = ''): number[] => {
    const nameBytes = version === 2 ? cat(u32(name.length + 1), ...[...name].map((c) => u16(c.charCodeAt(0))), u16(0)) : [];
    const body = cat(u32(0), u16(50), nameBytes, [1], u16(0), u16(0), u16(h), u16(w), u32(0), u32(0), u32(h), u32(w), u16(8), [0], new Array(w * h).fill(200));
    return cat(u16(2), u32(body.length), body);
  };
  const computedRecord = cat(u16(1), u32(14), u32(0), u16(25), u16(30), u16(80), u16(45), u16(70));
  it('reads a computed brush', () => {
    const r = read(new Uint8Array(cat(u16(1), u16(1), computedRecord)));
    expect(r.brushes[0].dab).toMatchObject({ tip: 'round', size: 30, hardness: 0.7, roundness: 0.8, angle: 45, spacing: 0.25 });
  });
  it('reads a sampled brush with its name (version 2) and without (version 1)', () => {
    const two = read(new Uint8Array(cat(u16(2), u16(1), sampledRecord(2, 6, 6, 'Chalk')))).brushes[0];
    expect(two.name).toBe('Chalk');
    expect(two.dab.spacing).toBe(0.5);
    expect(two.dab.picture).toMatchObject({ w: 6, h: 6 });
    const one = read(new Uint8Array(cat(u16(1), u16(1), sampledRecord(1, 6, 6)))).brushes[0];
    expect(one.name).toBe('Brush 1');
  });
});

describe('Photoshop .abr, damaged or hostile', () => {
  const ok = fx('photoshop_dynamics.abr');
  const bad = (b: Uint8Array | number[]) => readBrushFile(b instanceof Uint8Array ? b : new Uint8Array(b), 'x.abr');
  it('is cut short in the middle of the settings', () => {
    expect(bad(ok.subarray(0, ok.length - 700))).toMatchObject({ ok: false });
  });
  it('is cut short right after the header', () => {
    expect(bad(ok.subarray(0, 40))).toMatchObject({ ok: false });
  });
  it('is a version nobody knows', () => {
    const r = bad([0, 99, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/version 99/);
  });
  it('says it holds a thousand million brushes', () => {
    expect(bad(cat(u16(1), u16(65535), u16(1), u32(4), [0, 0, 0, 0]))).toMatchObject({ ok: false });
  });
  it('nests its settings far too deep', () => {
    let v: V = bool(true);
    for (let i = 0; i < 200; i++) v = obj('x', { a: v });
    expect(bad(abr([round({ deep: v })]))).toMatchObject({ ok: false });
  });
  it('has a list that says it is longer than the file', () => {
    const evil = cat(ascii('VlLs'), u32(0x7fffffff));
    expect(bad(abr([round({ evil })]))).toMatchObject({ ok: false });
  });
  it('has a tip that says it is enormous', () => {
    const body = cat([3], ascii('big'), new Array(264).fill(0), u32(0), u32(0), u32(60000), u32(60000), u16(8), [0], [1, 2, 3]);
    const samp = cat(u32(body.length), body);
    const r = bad(abr([sampled('big')], samp));
    expect(r).toMatchObject({ ok: false });
  });
  it('has a packed tip that overruns its row', () => {
    const body = cat([3], ascii('rle'), new Array(264).fill(0), u32(0), u32(0), u32(2), u32(2), u16(8), [1], u16(2), u16(2), [0x7f, 1], [0x7f, 1]);
    const r = bad(abr([sampled('rle')], cat(u32(body.length), body)));
    expect(r).toMatchObject({ ok: false });
  });
  it('has numbers that are nonsense', () => {
    const p = round({ useTipDynamics: bool(true), szVr: obj('brVr', { bVTy: long(2), jitter: unit('#Prc', Number.NaN), 'Mnm ': unit('#Prc', -5000) }), minimumDiameter: unit('#Prc', 1e300) }, { Dmtr: unit('#Pxl', -1e9), Spcn: unit('#Prc', 1e9), Hrdn: unit('#Prc', Number.POSITIVE_INFINITY) });
    const d = read(abr([p])).brushes[0].dab;
    expect(d.size).toBeGreaterThanOrEqual(1);
    expect(d.size).toBeLessThanOrEqual(300);
    expect(d.spacing).toBeLessThanOrEqual(4);
    expect(d.hardness).toBeLessThanOrEqual(1);
    for (const r of d.dynamics) expect(r.amount).toBeGreaterThanOrEqual(0);
  });
  it('is random bytes behind a real header', () => {
    const junk = new Uint8Array(400).map((_, i) => (i * 97 + 13) & 255);
    junk.set([0, 6, 0, 2], 0);
    expect(() => bad(junk)).not.toThrow();
    expect(bad(junk)).toMatchObject({ ok: false });
  });
  it('never throws on any truncation of a real file', () => {
    for (let n = 0; n < ok.length; n += 37) expect(() => bad(ok.subarray(0, n))).not.toThrow();
  });
});
