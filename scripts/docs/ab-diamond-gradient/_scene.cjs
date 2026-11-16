// Shared by the diamond gradient entries: the same square with each kind of gradient side by side, and a flat panel given a sheen.
// Window coordinates as in help/_shapes.cjs: the canvas is 764 x 444 at (113, 47).
const { T, view, put, away, rect, label, stroke, INK, WARM, dom } = require('../help/_shapes.cjs');

const STOPS = [{ at: 0, color: '#fff7c2' }, { at: 0.5, color: '#ff7a90' }, { at: 1, color: '#4b4fd0' }];
const SIDE = 140;
const KINDS = ['linear', 'radial', 'angular', 'diamond'];

const gradientFor = (kind, x, y, side, stops) => {
  const cx = x + side / 2;
  const cy = y + side / 2;
  return kind === 'linear' ? { kind, stops, from: { x, y: cy }, to: { x: x + side, y: cy } } : { kind, stops, from: { x: cx, y: cy }, to: { x: cx + side / 2, y: cy } };
};

/** Four squares, one of each kind, the same colours, with their names underneath. */
const kinds = () => {
  const shapes = [];
  KINDS.forEach((kind, i) => {
    const x = 145 + i * (SIDE + 20);
    const y = 120;
    shapes.push({ ...rect(x, y, SIDE, SIDE, STOPS[0].color, stroke(INK, 4)), fillGradient: gradientFor(kind, x, y, SIDE, STOPS) });
    shapes.push(label(x + SIDE / 2, y + SIDE + 44, kind[0].toUpperCase() + kind.slice(1), 24));
  });
  return [T('blank-vector'), view(1.12, 455, 250), put('Lines', shapes, []), away, dom('0'), WARM, { wait: 600 }];
};

const PANEL = '#3a4a8c';
const SHEEN = [{ at: 0, color: '#ffffffb3' }, { at: 0.45, color: '#ffffff4d' }, { at: 1, color: '#ffffff00' }];

/** A flat panel, then the same panel with a straight sheen, then with a diamond one: the light sits up and to the left. */
const sheen = () => {
  const shapes = [];
  const names = ['Flat', 'Linear sheen', 'Diamond sheen'];
  names.forEach((name, i) => {
    const x = 150 + i * 224;
    const y = 120;
    const w = 200;
    const h = 150;
    shapes.push(rect(x, y, w, h, PANEL, stroke(INK, 4)));
    const at = { x: x + 62, y: y + 48 };
    if (i === 1) shapes.push({ ...rect(x, y, w, h, '#ffffff', null), fillGradient: { kind: 'linear', stops: SHEEN, from: { x: x + 20, y: y + 20 }, to: { x: x + 150, y: y + 110 } } });
    if (i === 2) shapes.push({ ...rect(x, y, w, h, '#ffffff', null), fillGradient: { kind: 'diamond', stops: SHEEN, from: at, to: { x: at.x + 120, y: at.y } } });
    shapes.push(label(x + w / 2, y + h + 44, name, 24));
  });
  return [T('blank-vector'), view(1.12, 474, 250), put('Lines', shapes, []), away, dom('0'), WARM, { wait: 600 }];
};

module.exports = { kinds, sheen, STOPS, PANEL, SHEEN };
