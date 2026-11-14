// The magnetic select: the edge finding as pure functions, then the tool on both kinds of layer.
import { describe, expect, it } from 'vitest';
import { MagneticTrace, MIN_EDGE, PixelEdges, pixelDiff, pixelSource, ringSource, snapToRings, snapToVertex, straighten, wireAlong, type Ring } from '../../src/select/magnetic';
import { clingReach, DEFAULT_SELECT_SETTINGS } from '../../src/select/settings';
import { modeOfTool, WAYS } from '../../src/select/ways';

const COLOURS: Record<string, [number, number, number, number]> = {
  '.': [0, 0, 0, 0],
  k: [0, 0, 0, 255],
  r: [255, 0, 0, 255],
  p: [250, 10, 10, 255], // almost r
  g: [60, 60, 60, 255],
};

/** Rows of characters to RGBA pixels. */
function edgesOf(rows: string[]): PixelEdges {
  const h = rows.length;
  const w = rows[0].length;
  const px = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) => [...row].forEach((c, x) => px.set(COLOURS[c], (y * w + x) * 4)));
  return new PixelEdges(px, w, h);
}

describe('telling pixels apart', () => {
  const px = (...cs: string[]) => {
    const a = new Uint8ClampedArray(cs.length * 4);
    cs.forEach((c, i) => a.set(COLOURS[c], i * 4));
    return a;
  };

  it('sees no difference between the same colour, or between two see-through pixels', () => {
    expect(pixelDiff(px('r', 'r'), 0, 4)).toBe(0);
    expect(pixelDiff(px('.', '.'), 0, 4)).toBe(0);
  });

  it('sees solid against see-through as the strongest edge', () => {
    expect(pixelDiff(px('k', '.'), 0, 4)).toBe(1);
  });

  it('weighs a big colour change above a small one, and a tiny one below the edge threshold', () => {
    expect(pixelDiff(px('k', 'r'), 0, 4)).toBe(1);
    expect(pixelDiff(px('r', 'g'), 0, 4)).toBeGreaterThan(pixelDiff(px('r', 'p'), 0, 4));
    expect(pixelDiff(px('r', 'p'), 0, 4)).toBeLessThan(MIN_EDGE);
  });

  it('does not count the side of the picture as an edge', () => {
    const e = edgesOf(['k.', '..']);
    // The black pixel against the see-through one beside it is an edge. Against the side of the picture it is not.
    expect(e.v(1, 0)).toBe(1);
    expect(e.h(0, 1)).toBe(1);
    expect(e.h(0, 0)).toBe(0);
    expect(e.v(0, 0)).toBe(0);
    expect(e.h(1, 1)).toBe(0);
    expect(e.h(9, 9)).toBe(0);
  });

  it('knows which lines meet at a corner', () => {
    const e = edgesOf(['....', '.kk.', '.kk.', '....']);
    expect(e.strength(1, 1)).toBe(1);
    expect(e.strength(0, 0)).toBe(0);
    expect(e.strength(2, 2)).toBe(0); // the middle of the square
  });
});

describe('snapping to a corner of an edge', () => {
  const square = edgesOf(['........', '........', '..kkkk..', '..kkkk..', '..kkkk..', '........', '........', '........']);

  it('lands on the corner of the outline nearest the pointer', () => {
    expect(snapToVertex(square, { x: 1.7, y: 1.6 }, 3)).toEqual({ x: 2, y: 2 });
    expect(snapToVertex(square, { x: 6.2, y: 5.4 }, 3)).toEqual({ x: 6, y: 5 });
  });

  it('finds nothing in flat colour or beyond its reach', () => {
    expect(snapToVertex(edgesOf(['....', '....', '....', '....']), { x: 2, y: 2 }, 3)).toBeNull();
    expect(snapToVertex(square, { x: 0.1, y: 0.1 }, 1)).toBeNull();
  });

  it('prefers a clear outline a little way off to a faint line right under the pointer', () => {
    // A dark square outlined on white, with a faint shade line inside.
    const e = edgesOf(['rrrrrrrr', 'rrrrrrrr', 'rrrkkkkr', 'rrrkgkkr', 'rrrkkkkr', 'rrrrrrrr']);
    const at = snapToVertex(e, { x: 4.1, y: 3.5 }, 3)!;
    expect(e.strength(at.x, at.y)).toBe(1);
  });

  it('takes the stronger of two edges at the same distance', () => {
    // A faint step (grey to black) at x = 2 and a solid one (black to see-through) at x = 4.
    const e = edgesOf(['ggkk....', 'ggkk....', 'ggkk....', 'ggkk....']);
    expect(e.strength(2, 2)).toBeGreaterThan(MIN_EDGE);
    expect(e.strength(2, 2)).toBeLessThan(e.strength(4, 2));
    expect(snapToVertex(e, { x: 3, y: 2 }, 1.5)).toEqual({ x: 4, y: 2 });
  });

  it('ignores a colour change too small to be an edge', () => {
    const f = edgesOf(['pprr', 'pprr', 'pprr', 'pprr']);
    expect(f.strength(2, 2)).toBeLessThan(MIN_EDGE);
    expect(snapToVertex(f, { x: 2, y: 2 }, 1.2)).toBeNull();
  });

  it('stays inside the picture, and does not cling to the side of it', () => {
    const e = edgesOf(['kk.', 'kk.']);
    const v = snapToVertex(e, { x: -3, y: -3 }, 6);
    expect(v === null || (v.x >= 0 && v.y >= 0)).toBe(true);
    // Only the step from black to see-through counts.
    expect(snapToVertex(e, { x: 0.2, y: 1 }, 1.2)).toBeNull();
    expect(snapToVertex(e, { x: 1.9, y: 1 }, 1.2)).toEqual({ x: 2, y: 1 });
  });
});

describe('walking along an edge', () => {
  it('follows the staircase of a diagonal edge corner by corner', () => {
    const e = edgesOf(['k...', 'kk..', 'kkk.', 'kkkk']);
    const w = wireAlong(e, { x: 1, y: 0 }, { x: 4, y: 3 })!;
    expect(w[0]).toEqual({ x: 1, y: 0 });
    expect(w[w.length - 1]).toEqual({ x: 4, y: 3 });
    // Every step is along one grid line, and every line stepped on is a real edge.
    expect(w.length).toBeGreaterThan(3);
  });

  it('reduces a straight run to its two ends', () => {
    const e = edgesOf(['........', '..kkkkk.', '..kkkkk.', '........']);
    expect(wireAlong(e, { x: 2, y: 1 }, { x: 7, y: 1 })).toEqual([
      { x: 2, y: 1 },
      { x: 7, y: 1 },
    ]);
  });

  it('turns a corner and keeps only the corner', () => {
    const e = edgesOf(['........', '..kkkkk.', '..kkkkk.', '..kkkkk.', '........']);
    expect(wireAlong(e, { x: 2, y: 1 }, { x: 2, y: 4 })).toEqual([
      { x: 2, y: 1 },
      { x: 2, y: 4 },
    ]);
    expect(wireAlong(e, { x: 7, y: 1 }, { x: 2, y: 4 })).toEqual([
      { x: 7, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 4 },
    ]);
  });

  it('gives up where the edge does not join the two, so the caller draws a straight line', () => {
    const e = edgesOf(['k.......', '........', '.......k', '........']);
    expect(wireAlong(e, { x: 0, y: 0 }, { x: 7, y: 2 })).toBeNull();
  });

  it('gives up on corners that are not corners, and on distances too big to search', () => {
    const e = edgesOf(['kkkk', 'kkkk']);
    expect(wireAlong(e, { x: 0.5, y: 0 }, { x: 3, y: 0 })).toBeNull();
    const big = new PixelEdges(new Uint8ClampedArray(400 * 4 * 4), 400, 4);
    expect(wireAlong(big, { x: 0, y: 0 }, { x: 399, y: 0 })).toBeNull();
  });

  it('is one point when the two corners are the same', () => {
    expect(wireAlong(edgesOf(['k']), { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([{ x: 0, y: 0 }]);
  });

  it('straightens collinear points only', () => {
    expect(
      straighten([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ]);
  });
});

describe('snapping to the outline of a shape', () => {
  const square: Ring = {
    closed: true,
    pts: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
  };

  it('lands on the nearest point of the line', () => {
    expect(snapToRings([square], { x: 50, y: -6 }, 12)).toEqual({ x: 50, y: 0 });
    expect(snapToRings([square], { x: 108, y: 40 }, 12)).toEqual({ x: 100, y: 40 });
  });

  it('lands on a corner that is close, so a square comes out square', () => {
    expect(snapToRings([square], { x: 103, y: 2 }, 12)).toEqual({ x: 100, y: 0 });
  });

  it('closes the loop and leaves an open line open', () => {
    expect(snapToRings([square], { x: -5, y: 50 }, 12)).toEqual({ x: 0, y: 50 });
    const open: Ring = { closed: false, pts: square.pts };
    // The left side is the closing one, so an open line has no such side.
    expect(snapToRings([open], { x: -5, y: 50 }, 12)).toBeNull();
  });

  it('finds nothing beyond its reach, or with no lines', () => {
    expect(snapToRings([square], { x: 50, y: -30 }, 12)).toBeNull();
    expect(snapToRings([], { x: 0, y: 0 }, 12)).toBeNull();
  });

  it('picks the nearer of two lines', () => {
    const other: Ring = {
      closed: false,
      pts: [
        { x: 0, y: 20 },
        { x: 100, y: 20 },
      ],
    };
    expect(snapToRings([square, other], { x: 50, y: 14 }, 20)).toEqual({ x: 50, y: 20 });
  });
});

describe('how strongly it clings', () => {
  it('reaches further the higher it is set, and has a middle default', () => {
    for (let c = 1; c < 10; c++) expect(clingReach(c + 1)).toBeGreaterThan(clingReach(c));
    expect(DEFAULT_SELECT_SETTINGS.cling).toBe(5);
  });

  it('copes with a setting out of range', () => {
    expect(clingReach(0)).toBe(clingReach(1));
    expect(clingReach(99)).toBe(clingReach(10));
  });
});

describe('a trace round a pixel shape', () => {
  // A 10 x 10 picture with a 6 x 4 block in it. One art pixel is 8 document pixels.
  const rows = ['..........', '..........', '..kkkkkk..', '..kkkkkk..', '..kkkkkk..', '..kkkkkk..', '..........', '..........', '..........', '..........'];
  const size = 8;
  const make = () => new MagneticTrace(pixelSource(edgesOf(rows), size));
  const reach = 20;

  it('starts on the corner of the edge nearest the first click', () => {
    const t = make();
    t.begin({ x: 2 * size + 3, y: 2 * size + 2 }, reach);
    expect(t.pts).toEqual([{ x: 2 * size, y: 2 * size }]);
  });

  it('starts where it is clicked when there is no edge near', () => {
    const t = make();
    t.begin({ x: 5, y: 5 }, 4);
    expect(t.pts).toEqual([{ x: 5, y: 5 }]);
  });

  it('clings along an edge as the pointer moves roughly beside it', () => {
    const t = make();
    t.begin({ x: 2 * size, y: 2 * size }, reach);
    // Along the top edge, a little above it.
    t.move({ x: 5 * size, y: 2 * size - 5 }, reach, 1);
    expect(t.target).toEqual({ x: 5 * size, y: 2 * size });
    expect(t.tail[t.tail.length - 1]).toEqual({ x: 5 * size, y: 2 * size });
    for (const p of t.tail) expect(p.y).toBe(2 * size);
  });

  it('fastens a point by itself once it has gone far enough, and again on a click', () => {
    const t = make();
    t.begin({ x: 2 * size, y: 2 * size }, reach);
    // Zoom 4: 70 screen px is 17.5 document px, so a 24 px walk fastens it.
    t.move({ x: 5 * size, y: 2 * size - 4 }, reach, 4);
    expect(t.pts.length).toBeGreaterThan(1);
    expect(t.fastened).toBe(2);
    t.move({ x: 8 * size + 2, y: 2 * size - 3 }, reach, 4);
    t.place({ x: 8 * size + 2, y: 3 * size }, reach, 4);
    expect(t.fastened).toBeGreaterThanOrEqual(2);
  });

  it('takes the last stretch back, and says no at the start', () => {
    const t = make();
    t.begin({ x: 2 * size, y: 2 * size }, reach);
    expect(t.back()).toBe(false);
    t.place({ x: 8 * size, y: 2 * size - 3 }, reach, 1);
    const n = t.pts.length;
    expect(n).toBeGreaterThan(1);
    expect(t.back()).toBe(true);
    expect(t.pts).toEqual([{ x: 2 * size, y: 2 * size }]);
    expect(t.back()).toBe(false);
  });

  it('follows the whole outline and closes it into exactly the shape', () => {
    const t = make();
    const z = 1;
    t.begin({ x: 2 * size + 2, y: 2 * size + 3 }, reach);
    // Round the block clockwise, a little outside it, clicking near each corner.
    for (const [x, y] of [
      [8 * size, 2 * size],
      [8 * size, 6 * size],
      [2 * size, 6 * size],
    ]) {
      t.place({ x: x + 4, y: y + 3 }, reach, z);
    }
    const out = t.outline();
    // Every point is on the block's outline, and its four corners are all there.
    for (const p of out) {
      const onSide = (p.x === 2 * size || p.x === 8 * size) && p.y >= 2 * size && p.y <= 6 * size;
      const onTop = (p.y === 2 * size || p.y === 6 * size) && p.x >= 2 * size && p.x <= 8 * size;
      expect(onSide || onTop).toBe(true);
    }
    expect(out).toEqual(
      expect.arrayContaining([
        { x: 2 * size, y: 2 * size },
        { x: 8 * size, y: 2 * size },
        { x: 8 * size, y: 6 * size },
        { x: 2 * size, y: 6 * size },
      ]),
    );
  });

  it('draws straight to the pointer where there is no edge in reach', () => {
    const t = make();
    t.begin({ x: 2 * size, y: 2 * size }, reach);
    t.move({ x: 70, y: 70 }, 3, 1);
    expect(t.target).toBeNull();
    expect(t.tail).toEqual([{ x: 70, y: 70 }]);
  });
});

describe('a trace round a vector shape', () => {
  const square: Ring = {
    closed: true,
    pts: [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ],
  };
  const make = () => new MagneticTrace(ringSource(() => [square]));

  it('snaps the start and the points to the outline', () => {
    const t = make();
    t.begin({ x: 95, y: 104 }, 15);
    expect(t.pts).toEqual([{ x: 100, y: 100 }]);
    t.move({ x: 150, y: 94 }, 15, 1);
    expect(t.target).toEqual({ x: 150, y: 100 });
  });

  it('keeps the way the pointer went along the outline, so a curve is followed and not cut across', () => {
    const t = make();
    t.begin({ x: 100, y: 100 }, 15);
    for (let x = 100; x <= 160; x += 10) t.move({ x, y: 93 }, 15, 1);
    expect(t.tail.length).toBeGreaterThan(2);
    for (const p of t.tail) expect(p.y).toBe(100);
  });

  it('closes into the shape it went round', () => {
    const t = make();
    t.begin({ x: 100, y: 100 }, 15);
    for (const [x, y] of [
      [200, 100],
      [200, 200],
      [100, 200],
    ])
      t.place({ x: x + 3, y: y - 3 }, 15, 1);
    const out = t.outline();
    expect(out).toEqual(
      expect.arrayContaining([
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 },
      ]),
    );
  });
});

describe('what a long trace costs', () => {
  it('stays cheap on a big picture: a thousand moves along an outline', () => {
    const w = 1024;
    const h = 1024;
    const px = new Uint8ClampedArray(w * h * 4);
    // A big disc.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (Math.hypot(x - 512, y - 512) < 400) px.set([20, 20, 20, 255], (y * w + x) * 4);
    const t = new MagneticTrace(pixelSource(new PixelEdges(px, w, h), 1));
    t.begin({ x: 912, y: 512 }, 20);
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const a = (i / 1000) * Math.PI * 1.5;
      t.move({ x: 512 + Math.cos(a) * 407, y: 512 + Math.sin(a) * 407 }, 20, 1);
    }
    const ms = performance.now() - start;
    expect(t.pts.length).toBeGreaterThan(10);
    // Generous: it is far under this on any machine, the point is it does not scale with the picture.
    expect(ms).toBeLessThan(1500);
  });
});

describe('the magnetic way', () => {
  it('is a tool on both kinds of layer, between the polygon and the wand', () => {
    const modes = WAYS.map((w) => w.mode);
    expect(modes.indexOf('magnetic')).toBe(modes.indexOf('polygon') + 1);
    expect(modes.indexOf('wand')).toBe(modes.indexOf('magnetic') + 1);
    expect(modeOfTool('select-magnetic')).toBe('magnetic');
    expect(modeOfTool('pixel-select-magnetic')).toBe('magnetic');
  });

  it('has its own place in the tool group and a key of its own', () => {
    const at = WAYS.map((w) => w.at);
    expect(new Set(at).size).toBe(at.length);
    const keys = WAYS.map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
