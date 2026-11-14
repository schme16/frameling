// The W3C compositing and blending maths (https://www.w3.org/TR/compositing-1/) in plain floats, as the yardstick for
// scripts/e2e/blend-aseprite.cjs. Colours are straight (not premultiplied) 0..1 [r, g, b], alpha 0..1.
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const sat = (c) => Math.max(...c) - Math.min(...c);
function clipColor(c) {
  const l = lum(c);
  const n = Math.min(...c);
  const x = Math.max(...c);
  let r = c;
  if (n < 0) r = r.map((v) => l + ((v - l) * l) / (l - n));
  if (x > 1) r = r.map((v) => l + ((v - l) * (1 - l)) / (x - l));
  return r;
}
const setLum = (c, l) => {
  const d = l - lum(c);
  return clipColor(c.map((v) => v + d));
};
function setSat(c, s) {
  const mn = Math.min(...c);
  const mx = Math.max(...c);
  return mx > mn ? c.map((v) => ((v - mn) * s) / (mx - mn)) : [0, 0, 0];
}
const hardLight = (cb, cs) => (cs <= 0.5 ? cb * 2 * cs : cb + (2 * cs - 1) - cb * (2 * cs - 1));
const softLight = (cb, cs) => {
  const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
  return cs <= 0.5 ? cb - (1 - 2 * cs) * cb * (1 - cb) : cb + (2 * cs - 1) * (d - cb);
};
const separable = {
  NORMAL: (b, s) => s,
  MULTIPLY: (b, s) => b * s,
  SCREEN: (b, s) => b + s - b * s,
  OVERLAY: (b, s) => hardLight(s, b),
  DARKEN: (b, s) => Math.min(b, s),
  LIGHTEN: (b, s) => Math.max(b, s),
  COLOR_DODGE: (b, s) => (b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s))),
  COLOR_BURN: (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s)),
  HARD_LIGHT: (b, s) => hardLight(b, s),
  SOFT_LIGHT: softLight,
  DIFFERENCE: (b, s) => Math.abs(b - s),
  EXCLUSION: (b, s) => b + s - 2 * b * s,
  // Not in the W3C list: Aseprite's own three, written the same way.
  ADDITION: (b, s) => Math.min(1, b + s),
  SUBTRACT: (b, s) => Math.max(0, b - s),
  DIVIDE: (b, s) => (b === 0 ? 0 : b >= s ? 1 : b / s),
};
const nonSeparable = {
  HSL_HUE: (cb, cs) => setLum(setSat(cs, sat(cb)), lum(cb)),
  HSL_SATURATION: (cb, cs) => setLum(setSat(cb, sat(cs)), lum(cb)),
  HSL_COLOR: (cb, cs) => setLum(cs, lum(cb)),
  HSL_LUMINOSITY: (cb, cs) => setLum(cb, lum(cs)),
};

/** Source over backdrop with a blend mode, W3C style. Returns straight [r, g, b, a] in 0..1. */
function composite(mode, cb, ab, cs, as) {
  const ar = as + ab - as * ab;
  if (ar <= 0) return [0, 0, 0, 0];
  const f = separable[mode];
  const B = f ? cb.map((v, i) => f(v, cs[i])) : nonSeparable[mode](cb, cs);
  const out = cb.map((v, i) => (1 - as / ar) * v + (as / ar) * ((1 - ab) * cs[i] + ab * B[i]));
  return [...out.map((v) => Math.min(1, Math.max(0, v))), ar];
}

module.exports = { composite, MODES: [...Object.keys(separable).filter((m) => !['ADDITION', 'SUBTRACT', 'DIVIDE'].includes(m)), ...Object.keys(nonSeparable), 'ADDITION', 'SUBTRACT', 'DIVIDE'] };
