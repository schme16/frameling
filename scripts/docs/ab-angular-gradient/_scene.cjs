// Shared by the angular gradient entries: a metal coin and a pie, first with the gradients that were there (radial for the metal, linear
// for the pie), then with angular ones. Where things land is measured from the running app (view() in help/_shapes.cjs), so no window numbers are kept here.
const { T, view, put, away, ell, stroke, INK, WARM, dom } = require('../help/_shapes.cjs');

const METAL = [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 1].map((at, i) => ({ at, color: ['#f4f6f8', '#9aa1ab', '#eef0f3', '#6b717b', '#f4f6f8', '#9aa1ab', '#eef0f3', '#6b717b', '#f4f6f8'][i] }));
const PIE = [
  { at: 0, color: '#ff6f91' }, { at: 0.3, color: '#ff6f91' },
  { at: 0.3, color: '#ffc75f' }, { at: 0.55, color: '#ffc75f' },
  { at: 0.55, color: '#4dd0b1' }, { at: 0.85, color: '#4dd0b1' },
  { at: 0.85, color: '#6f8fff' }, { at: 1, color: '#6f8fff' },
];
const COIN = { x: 130, y: 100, d: 300 };
const PIEBOX = { x: 480, y: 100, d: 300 };
const mid = (b) => ({ x: b.x + b.d / 2, y: b.y + b.d / 2 });

const coin = (kind) => {
  const c = mid(COIN);
  const g = kind === 'angular' ? { kind, stops: METAL, from: c, to: { x: c.x + 150, y: c.y } } : { kind: 'radial', stops: METAL, from: c, to: { x: c.x + 150, y: c.y } };
  return { ...ell(COIN.x, COIN.y, COIN.d, COIN.d, '#f4f6f8', stroke(INK, 6)), fillGradient: g };
};
const pie = (kind) => {
  const c = mid(PIEBOX);
  const g = kind === 'angular' ? { kind, stops: PIE, from: c, to: { x: c.x, y: c.y - 150 } } : { kind: 'linear', stops: PIE, from: { x: PIEBOX.x, y: c.y }, to: { x: PIEBOX.x + PIEBOX.d, y: c.y } };
  return { ...ell(PIEBOX.x, PIEBOX.y, PIEBOX.d, PIEBOX.d, '#ff6f91', stroke(INK, 6)), fillGradient: g };
};

/** The scene with the gradients of one kind ('old' = the ones there already, 'angular'), and an optional pick. */
const scene = (kind, sel) => [T('blank-vector'), view(1.12, 455, 250), put('Lines', [coin(kind), pie(kind)], sel ?? []), away, dom('0'), WARM, { wait: 600 }];

module.exports = { scene, coin, pie, METAL, PIE };
