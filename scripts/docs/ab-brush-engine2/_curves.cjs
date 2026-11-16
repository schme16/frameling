// Shared by the pen curve entries: a pressure ramp drawn the same way every time, and the curve graph driven with real pointer events.
const { start, draw, whole, away, L } = require('../ab-pixel-brush/_draw.cjs');
const { fill, inkBack, r } = require('../ab-pixel-brush/_rows.cjs');

const open = (name) => L.js(`(() => { const b = document.querySelector('[data-fold="${name}"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
const scrollTo = (name) => L.js(`document.querySelector('[data-fold="${name}"]')?.scrollIntoView({ block: 'start' })`);

/** A gentle wave from the lightest press to the hardest, so the size shows the curve. */
const ramp = (y, x0 = 12, x1 = 148, n = 44) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [Math.round(x0 + (x1 - x0) * t), Math.round(y + 3 * Math.sin(t * Math.PI * 2)), 0.04 + 0.96 * t]; });
const BRUSH = { size: 14, spacing: 0.07, hardness: 1, dynamics: [r('pressure', 'size', 0.95)] };
const pen = { pen: true, delay: 14 };

/** Pick a ready-made feel by its label. */
const feel = (label) => L.js(`[...document.querySelectorAll('.dab-curve-feels button')].find((b) => b.textContent === ${JSON.stringify(label)})?.click()`);

/** Drag the curve's dot `i` to (x, y), both 0 to 1, with real pointer events and a few steps so the line is seen moving. */
const dragDot = (i, x, y, steps = 14) => L.js(`(async () => {
  const svg = document.querySelector('.dab-curve-graph'); const dot = svg.querySelector('[data-point="${i}"]');
  const rc = svg.getBoundingClientRect(); const k = rc.width / 148; const at = (cx, cy) => [rc.left + (10 + cx * 128) * k, rc.top + (10 + (1 - cy) * 128) * k];
  const d = dot.getBoundingClientRect(); const from = [d.left + d.width / 2, d.top + d.height / 2]; const to = at(${x}, ${y});
  const ev = (type, el, p) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: p[0], clientY: p[1], buttons: type === 'pointerup' ? 0 : 1 }));
  ev('pointerdown', dot, from);
  for (let s = 1; s <= ${steps}; s++) { await new Promise((res) => setTimeout(res, 40)); ev('pointermove', svg, [from[0] + (to[0] - from[0]) * s / ${steps}, from[1] + (to[1] - from[1]) * s / ${steps}]); }
  ev('pointerup', svg, to);
})()`);
/** Click the line at x to add a dot (real pointer events). */
const addDot = (x) => L.js(`(async () => {
  const svg = document.querySelector('.dab-curve-graph'); const rc = svg.getBoundingClientRect(); const k = rc.width / 148;
  const lut = null; const p = [rc.left + (10 + ${x} * 128) * k, rc.top + (10 + (1 - ${x}) * 128) * k];
  const ev = (type, p) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: p[0], clientY: p[1], buttons: type === 'pointerup' ? 0 : 1 }));
  ev('pointerdown', p); ev('pointerup', p);
})()`);

module.exports = { start, draw, whole, away, L, fill, inkBack, open, scrollTo, ramp, BRUSH, pen, feel, dragDot, addDot, r };
