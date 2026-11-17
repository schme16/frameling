// Shared by the paint mode entries: four colour blocks on a sprite, then five strokes of the same pink across them, one per mode.
const { start, draw, whole, away, L } = require('../ab-pixel-brush/_draw.cjs');
const F = '__frameling';

const BLOCKS = ['#e8c22f', '#2f6fe8', '#d0452f', '#3aa86a'];
const colour = (c) => L.js(`${F}.store().setUi({ color: ${JSON.stringify(c)} })`);
const column = (i) => 20 + i * 40;
const line = (x0, y0, x1, y1, n = 24) => Array.from({ length: n }, (_, k) => { const t = k / (n - 1); return [Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 0.5]; });

/** The blocks: each a tall bar of one colour, painted with the plain brush. */
const blocks = () => [
  whole({ size: 34, spacing: 0.1, hardness: 1, blend: 'normal' }),
  ...BLOCKS.flatMap((c, i) => [colour(c), draw(line(column(i), 6, column(i), 154, 30), {})]),
];
const MODES = ['normal', 'multiply', 'screen', 'overlay', 'color'];
const PINK = '#c0508f';
/** The five strokes across the blocks; `modes` says which mode each one uses. */
const strokes = (modes) => [colour(PINK), ...modes.flatMap((m, i) => [whole({ size: 14, spacing: 0.1, hardness: 1, blend: m }), draw(line(4, 22 + i * 30, 156, 22 + i * 30, 40), {})])];
// The steps are built after start() so the strokes are scaled to the sprite (draw reads the scale when it is called).
const scene = (modes) => { const s = start(160); return [...s, ...blocks(), ...strokes(modes)]; };

module.exports = { scene, MODES, away, L, BLOCKS };
