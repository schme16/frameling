// Builds a small Photoshop brush set (.abr, version 6) in memory, for the brush import pictures. The layout is the one
// src/brushes/import/abr.ts reads (see docs/brush-import.md): sections of tagged bytes, the settings as a descriptor.
const cat = (...p) => p.flat();
const u16 = (n) => [(n >> 8) & 255, n & 255];
const u32 = (n) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const uni = (s) => cat(u32(s.length + 1), ...[...s].map((c) => u16(c.charCodeAt(0))), u16(0));
const key = (k) => (k.length === 4 ? cat(u32(0), ascii(k)) : cat(u32(k.length), ascii(k)));
const f64 = (v) => [...new Uint8Array(new Float64Array([v]).buffer)].reverse();
const unit = (u, v) => cat(ascii('UntF'), ascii(u), f64(v));
const bool = (b) => cat(ascii('bool'), [b ? 1 : 0]);
const long = (n) => cat(ascii('long'), u32(n));
const text = (s) => cat(ascii('TEXT'), uni(s));
const en = (t, v) => cat(ascii('enum'), key(t), key(v));
const obj = (cls, items) => cat(ascii('Objc'), uni(''), key(cls), u32(Object.keys(items).length), ...Object.entries(items).map(([k, v]) => cat(key(k), v)));
const list = (vs) => cat(ascii('VlLs'), u32(vs.length), ...vs);
const dyn = (code, jitter = 0, min = 0, steps = 25) => obj('brVr', { bVTy: long(code), fStp: long(steps), jitter: unit('#Prc', jitter), 'Mnm ': unit('#Prc', min) });
const section = (k, body) => cat(ascii('8BIM'), ascii(k), u32(body.length), body, new Array((4 - (body.length % 4)) % 4).fill(0));

const computed = (d, hard, sp) => obj('computedBrush', { Dmtr: unit('#Pxl', d), Hrdn: unit('#Prc', hard), Angl: unit('#Ang', 0), Rndn: unit('#Prc', 100), Spcn: unit('#Prc', sp), Intr: bool(true) });
const sampledShape = (id, d, sp) => obj('sampledBrush', { Dmtr: unit('#Pxl', d), Angl: unit('#Ang', 0), Rndn: unit('#Prc', 100), Spcn: unit('#Prc', sp), Intr: bool(true), sampledData: text(id) });
const preset = (name, brsh, extra = {}) => obj('brushPreset', { 'Nm  ': text(name), Brsh: brsh, ...extra });

/** One sampled tip, 8 bit, raw: `px(x, y)` is 0 to 255 paint. */
function tip(id, w, h, px) {
  const data = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.push(Math.max(0, Math.min(255, Math.round(px(x, y)))));
  const body = cat([id.length], ascii(id), new Array(264).fill(0), u32(0), u32(0), u32(h), u32(w), u16(8), [0], data);
  return cat(u32(body.length), body, new Array((4 - (body.length % 4)) % 4).fill(0));
}

/** The tips the made-up set uses: a soft blob, a leaf and a ring of speckle. */
const blob = (w) => (x, y) => { const d = Math.hypot(x - (w - 1) / 2, y - (w - 1) / 2) / (w / 2); return d >= 1 ? 0 : 255 * (1 - d * d); };
const leaf = (w) => (x, y) => { const u = (x - (w - 1) / 2) / (w / 2); const v = (y - (w - 1) / 2) / (w / 2); return Math.abs(v) < 0.55 * (1 - Math.abs(u)) * 1.4 && Math.abs(u) < 1 ? 255 : 0; };
const speckle = (w) => (x, y) => { const d = Math.hypot(x - (w - 1) / 2, y - (w - 1) / 2) / (w / 2); const h = ((x * 73856093) ^ (y * 19349663)) >>> 0; return d < 1 && h % 7 < 3 ? 70 + (h % 180) : 0; };

/** The set: seven brushes, some that come in whole and some that lose things, as a real pack would. */
function madeUpSet() {
  const presets = [
    preset('Soft round', computed(40, 0, 25)),
    preset('Pressure pencil', computed(8, 85, 10), { useTipDynamics: bool(true), szVr: dyn(2), minimumDiameter: unit('#Prc', 15) }),
    preset('Leaf stamp', sampledShape('leaf', 36, 90), { useTipDynamics: bool(true), angleDynamics: dyn(0, 100), useScatter: bool(true), scatterDynamics: dyn(0, 80), 'Cnt ': long(1) }),
    preset('Charcoal blob', sampledShape('blob', 30, 18), { usePaintDynamics: bool(true), opVr: dyn(2), prVr: dyn(0, 0) }),
    preset('Splatter', sampledShape('speck', 44, 60), { useTipDynamics: bool(true), szVr: dyn(0, 60), useScatter: bool(true), scatterDynamics: dyn(0, 150), 'Cnt ': long(4), dualBrush: obj('dualBrush', { useDualBrush: bool(true), Brsh: sampledShape('speck', 8, 25), BlnM: en('BlnM', 'Mltp'), 'Cnt ': long(1) }) }),
    preset('Dry bristle', obj('dBrush', { Dmtr: unit('#Pxl', 24), Spcn: unit('#Prc', 5), Intr: bool(true) }), { useColorDynamics: bool(true), useTexture: bool(true), textureDepth: unit('#Prc', 60), textureScale: unit('#Prc', 100), Txtr: obj('Ptrn', { 'Nm  ': text('Canvas'), Idnt: text('x') }) }),
    preset('Sketchy line', computed(5, 100, 6), { useTipDynamics: bool(true), szVr: dyn(1, 0, 0, 12), angleDynamics: dyn(6, 0) }),
  ];
  const samp = cat(tip('leaf', 40, 40, leaf(40)), tip('blob', 48, 48, blob(48)), tip('speck', 56, 56, speckle(56)));
  const desc = cat(u32(16), cat(ascii('Objc'), uni(''), key('null'), u32(1), key('Brsh'), list(presets)).slice(4));
  return new Uint8Array(cat(u16(6), u16(2), section('samp', samp), section('patt', []), section('desc', desc)));
}

module.exports = { madeUpSet };
