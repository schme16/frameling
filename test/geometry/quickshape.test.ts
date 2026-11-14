import { describe, expect, it } from 'vitest';
import { FIT, dragQuick, pathLength, quickCentre, quickName, quickPath, recogniseShape, resample, type QPt, type QuickShape } from '../../src/geometry/quickshape';
import { sampleSubPath } from '../../src/geometry/bezier';

/** A small seeded random, so the wobble is the same every run. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

/** Points along a shape, jittered the way a hand and a mouse do it: a little noise, and the pen doesn't land evenly. */
const wobble = (pts: QPt[], amount: number, seed = 1): QPt[] => {
  const r = seeded(seed);
  return pts.map((p) => ({ x: p.x + r() * amount * 2, y: p.y + r() * amount * 2 }));
};

const circle = (cx: number, cy: number, r: number, n = 90, from = 0, turns = 1.03): QPt[] => Array.from({ length: n }, (_, i) => ({ x: cx + Math.cos(from + (i / (n - 1)) * turns * Math.PI * 2) * r, y: cy + Math.sin(from + (i / (n - 1)) * turns * Math.PI * 2) * r }));
const ellipse = (cx: number, cy: number, rx: number, ry: number, ang: number, n = 90): QPt[] =>
  circle(0, 0, 1, n, 0.4, 1.02).map((p) => ({ x: cx + p.x * rx * Math.cos(ang) - p.y * ry * Math.sin(ang), y: cy + p.x * rx * Math.sin(ang) + p.y * ry * Math.cos(ang) }));
/** The outline of a polygon, walked once round, starting a bit along the first side (people don't start at corners). */
function walk(corners: QPt[], per = 26): QPt[] {
  const all: QPt[] = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % n];
    for (let k = 0; k < per; k++) all.push({ x: a.x + ((b.x - a.x) * k) / per, y: a.y + ((b.y - a.y) * k) / per });
  }
  const off = Math.floor(per / 3);
  // Once round, and back to where it began (the pen is near the start again, not past it).
  return [...all.slice(off), ...all.slice(0, off + 1)];
}
const rect = (x: number, y: number, w: number, h: number, ang = 0): QPt[] => {
  const c = { x: x + w / 2, y: y + h / 2 };
  const cs = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * Math.cos(ang) - dy * Math.sin(ang), y: c.y + dx * Math.sin(ang) + dy * Math.cos(ang) };
  });
  return walk(cs);
};
const line = (a: QPt, b: QPt, n = 40): QPt[] => Array.from({ length: n }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / (n - 1), y: a.y + ((b.y - a.y) * i) / (n - 1) }));

describe('a circle', () => {
  it('a wobbly hand-drawn circle becomes a circle in the right place at the right size', () => {
    const q = recogniseShape(wobble(circle(200, 150, 80), 2.5), 1) as Extract<QuickShape, { kind: 'ellipse' }>;
    expect(q.kind).toBe('ellipse');
    expect(q.rx).toBe(q.ry);
    expect(q.cx).toBeCloseTo(200, -1);
    expect(q.cy).toBeCloseTo(150, -1);
    expect(q.rx).toBeGreaterThan(74);
    expect(q.rx).toBeLessThan(88);
    expect(quickName(q)).toBe('a circle');
  });

  it('an overshoot, and a start part way round, still make a circle', () => {
    expect(recogniseShape(wobble(circle(0, 0, 60, 120, 2.2, 1.12), 1.5, 4), 1)?.kind).toBe('ellipse');
  });

  it('works at any size and any starting angle', () => {
    for (const [r, from] of [[20, 0], [40, 1.7], [300, 4]] as const) expect(recogniseShape(wobble(circle(0, 0, r, 90, from), r * 0.03, 9), 1)?.kind, `r=${r}`).toBe('ellipse');
  });
});

describe('an ellipse', () => {
  it('keeps its stretch and its tilt', () => {
    const q = recogniseShape(wobble(ellipse(100, 100, 120, 50, 0.5), 2), 1) as Extract<QuickShape, { kind: 'ellipse' }>;
    expect(q.kind).toBe('ellipse');
    expect(Math.max(q.rx, q.ry)).toBeGreaterThan(110);
    expect(Math.min(q.rx, q.ry)).toBeLessThan(58);
    expect(quickName(q)).toBe('an ellipse');
    // The long axis lies along the tilt (0.5 radians, within a few degrees).
    const along = q.rx > q.ry ? q.rot : q.rot + Math.PI / 2;
    expect(Math.abs((((along - 0.5) % Math.PI) + Math.PI * 1.5) % Math.PI - Math.PI / 2)).toBeLessThan(0.12);
  });
});

describe('a rectangle', () => {
  it('becomes a rectangle with level sides', () => {
    const q = recogniseShape(wobble(rect(50, 40, 200, 120), 2.5, 3), 1) as Extract<QuickShape, { kind: 'rect' }>;
    expect(q.kind).toBe('rect');
    expect(q.rot).toBe(0);
    expect(q.w).toBeGreaterThan(190);
    expect(q.w).toBeLessThan(215);
    expect(q.h).toBeGreaterThan(112);
    expect(q.h).toBeLessThan(128);
  });

  it('a square drawn roughly is a square', () => {
    const q = recogniseShape(wobble(rect(0, 0, 100, 96), 2, 5), 1) as Extract<QuickShape, { kind: 'rect' }>;
    expect(q.kind).toBe('rect');
    expect(q.w).toBe(q.h);
    expect(quickName(q)).toBe('a square');
  });

  it('a tilted one stays tilted', () => {
    const q = recogniseShape(wobble(rect(0, 0, 160, 90, 0.5), 1.5, 8), 1) as Extract<QuickShape, { kind: 'rect' }>;
    expect(q.kind).toBe('rect');
    expect(Math.abs(q.rot)).toBeGreaterThan(0.3);
  });
});

describe('a line', () => {
  it('a rough straight stroke becomes a straight line between its ends', () => {
    const q = recogniseShape(wobble(line({ x: 10, y: 10 }, { x: 210, y: 70 }), 1.5, 2), 1) as Extract<QuickShape, { kind: 'line' }>;
    expect(q.kind).toBe('line');
    expect(q.a.x).toBeCloseTo(10, -1);
    expect(q.b.x).toBeCloseTo(210, -1);
  });

  it('one that is nearly level comes out exactly level, nearly upright exactly upright', () => {
    const lvl = recogniseShape(wobble(line({ x: 0, y: 100 }, { x: 200, y: 106 }), 0.5, 3), 1) as Extract<QuickShape, { kind: 'line' }>;
    expect(lvl.a.y).toBe(lvl.b.y);
    const up = recogniseShape(wobble(line({ x: 100, y: 0 }, { x: 105, y: 200 }), 0.5, 3), 1) as Extract<QuickShape, { kind: 'line' }>;
    expect(up.a.x).toBe(up.b.x);
  });
});

describe('a triangle and other plain shapes', () => {
  it('a triangle', () => {
    const q = recogniseShape(wobble(walk([{ x: 100, y: 20 }, { x: 200, y: 180 }, { x: 0, y: 180 }]), 2, 6), 1) as Extract<QuickShape, { kind: 'polygon' }>;
    expect(q.kind).toBe('polygon');
    expect(q.pts).toHaveLength(3);
    expect(quickName(q)).toBe('a triangle');
  });

  it('a pentagon', () => {
    const corners = Array.from({ length: 5 }, (_, i) => ({ x: 100 + Math.cos((i / 5) * Math.PI * 2 - 1.57) * 90, y: 100 + Math.sin((i / 5) * Math.PI * 2 - 1.57) * 90 }));
    const q = recogniseShape(wobble(walk(corners), 1.5, 11), 1);
    expect(q?.kind).toBe('polygon');
  });
});

describe('what it must leave alone', () => {
  it('a short mark, a dot, a tick', () => {
    expect(recogniseShape(line({ x: 0, y: 0 }, { x: 30, y: 2 }), 1)).toBeNull();
    expect(recogniseShape([{ x: 5, y: 5 }, { x: 5, y: 5 }], 1)).toBeNull();
    expect(recogniseShape(line({ x: 0, y: 0 }, { x: 60, y: 0 }, 3), 1)).toBeNull();
  });

  it('short as the hand sees it: the same line zoomed out is too small to tidy', () => {
    const l = wobble(line({ x: 0, y: 0 }, { x: 100, y: 0 }), 0.5);
    expect(recogniseShape(l, 1)?.kind).toBe('line');
    expect(recogniseShape(l, 0.3)).toBeNull();
  });

  it('an arc, a half circle, a C: not closed, not straight', () => {
    expect(recogniseShape(circle(0, 0, 80, 60, 0, 0.5), 1)).toBeNull();
    expect(recogniseShape(circle(0, 0, 80, 60, 0.5, 0.7), 1)).toBeNull();
  });

  it('a gentle curve is not a line', () => {
    const bow = Array.from({ length: 40 }, (_, i) => ({ x: i * 5, y: Math.sin((i / 39) * Math.PI) * 25 }));
    expect(recogniseShape(bow, 1)).toBeNull();
  });

  it('a zigzag, a wave, a squiggle', () => {
    const zig = Array.from({ length: 60 }, (_, i) => ({ x: i * 4, y: (i % 10 < 5 ? 1 : -1) * 20 }));
    expect(recogniseShape(zig, 1)).toBeNull();
    const wave = Array.from({ length: 80 }, (_, i) => ({ x: i * 3, y: Math.sin(i / 5) * 30 }));
    expect(recogniseShape(wave, 1)).toBeNull();
  });

  it('a spiral and a figure eight', () => {
    const spiral = Array.from({ length: 120 }, (_, i) => ({ x: Math.cos(i / 12) * (10 + i), y: Math.sin(i / 12) * (10 + i) }));
    expect(recogniseShape(spiral, 1)).toBeNull();
    const eight = Array.from({ length: 100 }, (_, i) => ({ x: Math.sin((i / 99) * Math.PI * 2) * 80, y: Math.sin((i / 99) * Math.PI * 4) * 40 }));
    expect(recogniseShape(eight, 1)).toBeNull();
  });

  it('a lumpy closed blob that is not any of these', () => {
    const blob = Array.from({ length: 100 }, (_, i) => {
      const a = (i / 99) * Math.PI * 2;
      const r = 70 + 28 * Math.sin(a * 3) + 12 * Math.cos(a * 5);
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
    expect(recogniseShape(blob, 1)).toBeNull();
  });

  it('a loop that is nearly closed but is a squashed tear drop', () => {
    const tear = Array.from({ length: 100 }, (_, i) => {
      const a = (i / 99) * Math.PI * 2;
      return { x: Math.sin(a) * Math.sin(a / 2) * 80, y: -Math.cos(a) * 70 };
    });
    expect(recogniseShape(tear, 1)).toBeNull();
  });

  it('a pen that jumped: too few points', () => {
    expect(recogniseShape([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], 1)).toBeNull();
  });

  it('shapes that fit loosely are left alone: the tolerances are real', () => {
    // A three-lobed circle, a fifth out of true each way, is a trefoil, not a circle.
    const lobed = Array.from({ length: 100 }, (_, i) => {
      const a = (i / 99) * Math.PI * 2;
      const r = 80 * (1 + 0.15 * Math.sin(a * 3));
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
    expect(recogniseShape(lobed, 1)).toBeNull();
  });
});

describe('the clean shape as a path', () => {
  it('a circle path has its points on the circle', () => {
    const p = quickPath({ kind: 'ellipse', cx: 10, cy: 20, rx: 50, ry: 50, rot: 0 });
    for (const s of sampleSubPath(p, 12)) expect(Math.abs(Math.hypot(s.x - 10, s.y - 20) - 50)).toBeLessThan(0.3);
    expect(p.closed).toBe(true);
  });

  it('a tilted ellipse is tilted', () => {
    const p = quickPath({ kind: 'ellipse', cx: 0, cy: 0, rx: 100, ry: 20, rot: Math.PI / 2 });
    const ys = sampleSubPath(p, 12).map((s) => s.y);
    expect(Math.max(...ys)).toBeGreaterThan(95);
  });

  it('a rectangle path has four straight corners, a line two points, a polygon its own', () => {
    expect(quickPath({ kind: 'rect', cx: 0, cy: 0, w: 20, h: 10, rot: 0 }).points).toEqual([{ x: -10, y: -5 }, { x: 10, y: -5 }, { x: 10, y: 5 }, { x: -10, y: 5 }]);
    expect(quickPath({ kind: 'line', a: { x: 0, y: 0 }, b: { x: 5, y: 5 } })).toEqual({ closed: false, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] });
    expect(quickPath({ kind: 'polygon', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }] }).points).toHaveLength(3);
  });
});

describe('dragging to change it', () => {
  it('a line follows the pen, and with Shift goes in 45 degree steps', () => {
    const l: QuickShape = { kind: 'line', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
    expect((dragQuick(l, { x: 100, y: 0 }, { x: 80, y: 30 }, false) as { b: QPt }).b).toEqual({ x: 80, y: 30 });
    const s = dragQuick(l, { x: 100, y: 0 }, { x: 100, y: 10 }, true) as { b: QPt };
    expect(s.b.y).toBeCloseTo(0, 6);
  });

  it('a circle grows as the pen moves out and shrinks as it comes in', () => {
    const c: QuickShape = { kind: 'ellipse', cx: 0, cy: 0, rx: 50, ry: 50, rot: 0 };
    expect((dragQuick(c, { x: 50, y: 0 }, { x: 100, y: 0 }, false) as { rx: number }).rx).toBeCloseTo(100, 6);
    expect((dragQuick(c, { x: 50, y: 0 }, { x: 25, y: 0 }, false) as { rx: number }).rx).toBeCloseTo(25, 6);
  });

  it('an ellipse keeps its stretch unless Shift makes it round', () => {
    const e: QuickShape = { kind: 'ellipse', cx: 0, cy: 0, rx: 100, ry: 40, rot: 0 };
    const grown = dragQuick(e, { x: 100, y: 0 }, { x: 200, y: 0 }, false) as { rx: number; ry: number };
    expect(grown.rx / grown.ry).toBeCloseTo(2.5, 6);
    const round = dragQuick(e, { x: 100, y: 0 }, { x: 200, y: 0 }, true) as { rx: number; ry: number };
    expect(round.rx).toBe(round.ry);
  });

  it('a rectangle and a polygon scale about their centre', () => {
    const r = dragQuick({ kind: 'rect', cx: 10, cy: 10, w: 20, h: 10, rot: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }, false) as { w: number; cx: number };
    expect(r.w).toBeCloseTo(40, 6);
    expect(r.cx).toBe(10);
    const t: QuickShape = { kind: 'polygon', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] };
    const g = dragQuick(t, { x: 10, y: 0 }, { x: 20, y: 0 }, false) as { pts: QPt[] };
    expect(quickCentre(g as QuickShape).x).toBeCloseTo(quickCentre(t).x, 6);
    expect(g.pts[1].x - g.pts[0].x).toBeGreaterThan(10);
  });

  it('never collapses to nothing', () => {
    const c: QuickShape = { kind: 'ellipse', cx: 0, cy: 0, rx: 50, ry: 50, rot: 0 };
    expect((dragQuick(c, { x: 50, y: 0 }, { x: 0, y: 0 }, false) as { rx: number }).rx).toBeGreaterThan(0);
  });
});

describe('the small helpers', () => {
  it('measures and resamples a path', () => {
    const l = line({ x: 0, y: 0 }, { x: 100, y: 0 }, 3);
    expect(pathLength(l)).toBe(100);
    const r = resample(l, 11);
    expect(r).toHaveLength(11);
    expect(r[5].x).toBeCloseTo(50, 6);
  });
});

describe('how often it is right (many wobbly strokes, fixed seeds)', () => {
  const rate = (n: number, make: (i: number) => QPt[], want: (q: QuickShape | null) => boolean) => {
    let ok = 0;
    for (let i = 0; i < n; i++) if (want(recogniseShape(make(i), 1))) ok++;
    return ok / n;
  };

  it('nearly every wobbly circle, rectangle, line and triangle is tidied into the right thing', () => {
    expect(rate(200, (i) => wobble(circle(0, 0, 50 + (i % 7) * 20, 90, i * 0.7), 2 + (i % 4), i + 1), (q) => q?.kind === 'ellipse')).toBeGreaterThanOrEqual(0.97);
    expect(rate(200, (i) => wobble(rect(0, 0, 80 + (i % 5) * 30, 60 + (i % 3) * 40, (i % 6) * 0.1), 2 + (i % 3), i + 1), (q) => q?.kind === 'rect')).toBeGreaterThanOrEqual(0.95);
    expect(rate(200, (i) => wobble(line({ x: 0, y: 0 }, { x: 150 + i, y: (i % 9) * 11 }), 1.2, i + 1), (q) => q?.kind === 'line')).toBeGreaterThanOrEqual(0.97);
    expect(rate(200, (i) => wobble(walk([{ x: 100, y: 10 }, { x: 190 + (i % 5) * 10, y: 170 }, { x: 5, y: 160 + (i % 4) * 8 }]), 2, i + 1), (q) => q?.kind === 'polygon' && q.pts.length === 3)).toBeGreaterThanOrEqual(0.9);
  });

  it('almost no smooth curve, arc or loop that was not meant as a shape is touched', () => {
    // Open: waves and hooks. Closed: lumpy blobs with three to five bumps, a quarter or more out of round.
    const smooth = (i: number): QPt[] => {
      const amp = 30 + (i % 7) * 6;
      const n = 3 + (i % 3);
      const half = 1 + (i % 3);
      const closed = i % 2 === 0;
      return Array.from({ length: 100 }, (_, k) => {
        const t = (k / 99) * (closed ? Math.PI * 2 : 1);
        if (closed) {
          const rad = 60 + amp * 0.5 * Math.sin(n * t + i);
          return { x: Math.cos(t) * rad, y: Math.sin(t) * rad };
        }
        return { x: k * 3, y: amp * 0.6 * Math.sin(t * Math.PI * half) };
      });
    };
    expect(rate(300, smooth, (q) => q !== null)).toBeLessThanOrEqual(0.03);
  });

  it('arcs of every length are never made lines or circles', () => {
    expect(rate(100, (i) => circle(0, 0, 80, 70, i * 0.3, 0.2 + (i % 8) * 0.07), (q) => q !== null)).toBe(0);
  });
});
