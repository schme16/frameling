// Diamond gradients: the maths, and what every writer does with one. A diamond is a straight gradient in each of four quarters,
// so the canvas paints four quarters, SVG a pattern of four pieces, PDF and Illustrator four shaded pieces; Lottie has no
// such gradient and falls back to the shape's plain colour.
import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import type { Doc, Gradient, PathShape } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { blendGradient, canvasGradient, colorAt, diamondAt, diamondCorners, diamondQuarters, dropSpareCanvases, fillDiamond, gradientCss, placeGradient, readGradient, strokeDiamond } from '../../src/core/gradient';
import { reachOf, shapeToSvg, svgGradient, diamondPattern } from '../../src/export/svg';
import { writePdf } from '../../src/export/pdf';
import { docToLottie } from '../../src/export/lottie';
import { carryWarnings, docFeatures, FEATURE_WORDS } from '../../src/export/carries';
import { gradientPosition } from '../../src/pixel/gradient';

const dia = (over: Partial<Gradient> = {}): Gradient => ({
  kind: 'diamond',
  stops: [{ at: 0, color: '#ffffff' }, { at: 1, color: '#0000ff' }],
  from: { x: 10, y: 10 },
  to: { x: 20, y: 10 },
  ...over,
});

const rect = (g?: Gradient, sg?: Gradient): PathShape => ({
  id: 'r',
  type: 'path',
  paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] }],
  fill: '#ff0000',
  stroke: sg ? { color: '#ff0000', width: 4, join: 'round', cap: 'round' } : null,
  opacity: 1,
  ...(g ? { fillGradient: g } : {}),
  ...(sg ? { strokeGradient: sg } : {}),
});

function docWith(s: PathShape): Doc {
  const doc = newDoc({ width: 20, height: 20 });
  const l = Object.assign(newVectorLayer('A'), { id: 'a' });
  doc.drawings = { d: { id: 'd', kind: 'vector', shapes: [s] } };
  l.cels = [{ id: 'c', start: 0, length: 1, drawingId: 'd' }];
  doc.layers = [l];
  doc.length = 1;
  return doc;
}

describe('how far out a diamond gradient a point is', () => {
  it('is 0 in the middle and 1 on each of the four corners', () => {
    const g = dia();
    expect(diamondAt(g, 10, 10)).toBe(0);
    expect(diamondAt(g, 20, 10)).toBeCloseTo(1, 9);
    expect(diamondAt(g, 0, 10)).toBeCloseTo(1, 9);
    expect(diamondAt(g, 10, 20)).toBeCloseTo(1, 9);
    expect(diamondAt(g, 10, 0)).toBeCloseTo(1, 9);
  });
  it('steps out in straight lines between the corners, so the edge midpoints are half way', () => {
    expect(diamondAt(dia(), 15, 15)).toBeCloseTo(1, 9); // on the outline, half way along it
    expect(diamondAt(dia(), 15, 10)).toBeCloseTo(0.5, 9);
    expect(diamondAt(dia(), 12.5, 12.5)).toBeCloseTo(0.5, 9);
  });
  it('is a square turned on its corner, not a circle: the same distance out is further along a diagonal', () => {
    expect(diamondAt(dia(), 10 + 5, 10 + 5)).toBeGreaterThan(diamondAt(dia(), 10 + 7.07, 10));
  });
  it('turns with the end handle, so a handle at 45 degrees makes an upright square', () => {
    const g = dia({ to: { x: 10 + 10 * Math.SQRT1_2, y: 10 + 10 * Math.SQRT1_2 } });
    // Upright square: every point on one side is as far out as any other on it, and a point past the side is further.
    expect(diamondAt(g, 15, 10)).toBeCloseTo(diamondAt(g, 10, 15), 9);
    expect(diamondAt(g, 15, 15)).toBeCloseTo(diamondAt(g, 15, 10), 9);
    expect(diamondAt(g, 20, 15)).toBeGreaterThan(diamondAt(g, 15, 15));
  });
  it('goes past 1 outside the diamond (the last colour carries on) and colorAt clamps it', () => {
    expect(diamondAt(dia(), 30, 10)).toBeCloseTo(2, 9);
    expect(colorAt(dia().stops, diamondAt(dia(), 30, 10))).toBe('#0000ff');
  });
  it('copes with an end handle on top of the middle', () => {
    expect(Number.isFinite(diamondAt(dia({ to: { x: 10, y: 10 } }), 14, 12))).toBe(true);
  });
  it('has its four corners at the handle and a quarter turn apart', () => {
    const c = diamondCorners(dia());
    expect(c[0]).toEqual({ x: 20, y: 10 });
    expect(c[1].x).toBeCloseTo(10, 9);
    expect(c[1].y).toBeCloseTo(20, 9);
    expect(c[2].x).toBeCloseTo(0, 9);
    expect(c[3].y).toBeCloseTo(0, 9);
  });
  it('the pixel gradient agrees with it, on the middle of each pixel, and stops at 1', () => {
    const line = { x0: 8, y0: 8, x1: 18, y1: 8 };
    // The middle of pixel (12, 11) is 4.5 across and 3.5 down from the start: 8 out of 10.
    expect(gradientPosition('diamond', line, 12, 11)).toBeCloseTo(0.8, 9);
    expect(gradientPosition('diamond', line, 40, 8)).toBe(1);
    expect(gradientPosition('diamond', { x0: 3, y0: 3, x1: 3, y1: 3 }, 9, 9)).toBe(0);
    // Turned: a drag straight down puts the corner below the start, and a point to the right is across, not along.
    expect(gradientPosition('diamond', { x0: 8, y0: 8, x1: 8, y1: 18 }, 12, 11)).toBeCloseTo(0.8, 9);
  });
});

describe('four straight gradients, one in each quarter', () => {
  const g = dia({ from: { x: 50, y: 40 }, to: { x: 80, y: 40 } });
  const t = (q: { from: { x: number; y: number }; to: { x: number; y: number } }, x: number, y: number) => {
    const dx = q.to.x - q.from.x;
    const dy = q.to.y - q.from.y;
    return ((x - q.from.x) * dx + (y - q.from.y) * dy) / (dx * dx + dy * dy);
  };
  const inside = (poly: { x: number; y: number }[], x: number, y: number) => {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (Math.abs(cross) < 1e-9) continue;
      if (sign && Math.sign(cross) !== sign) return false;
      sign = Math.sign(cross);
    }
    return true;
  };
  it('gives four, each running from the middle to half way along its corner', () => {
    const q = diamondQuarters(g, 500);
    expect(q).toHaveLength(4);
    for (const x of q) expect(x.from).toEqual({ x: 50, y: 40 });
    expect(q[0].to).toEqual({ x: 65, y: 55 });
  });
  it('agrees with diamondAt at every point inside the quarter it covers', () => {
    const q = diamondQuarters(g, 500);
    let seen = 0;
    for (let x = -20; x <= 120; x += 7) {
      for (let y = -30; y <= 110; y += 7) {
        const mine = q.filter((p) => inside(p.poly, x, y));
        expect(mine.length).toBeGreaterThanOrEqual(1);
        seen++;
        for (const p of mine) expect(t(p, x, y)).toBeCloseTo(diamondAt(g, x, y), 6);
      }
    }
    expect(seen).toBeGreaterThan(300);
  });
  it('tiles the plane: a point on no quarter does not exist, and with no overlap a point is in one quarter only', () => {
    const q = diamondQuarters(g, 500, 0);
    for (const [x, y] of [[60, 50], [30, 50], [30, 20], [60, 20]]) expect(q.filter((p) => inside(p.poly, x, y))).toHaveLength(1);
  });
  it('overlap lays each quarter a hair over the axes, and no further', () => {
    const q = diamondQuarters(g, 500, 1);
    expect(q.filter((p) => inside(p.poly, 50.5, 60))).toHaveLength(2);
    expect(q.filter((p) => inside(p.poly, 52, 60))).toHaveLength(1);
  });
});

describe('placing, showing and reading a diamond gradient', () => {
  it('goes in the middle of a box and reaches the longer side, like a radial one', () => {
    const g = placeGradient({ kind: 'diamond', stops: dia().stops, angle: 0 }, { x0: 0, y0: 0, x1: 100, y1: 40 });
    expect(g.kind).toBe('diamond');
    expect(g.from).toEqual({ x: 50, y: 20 });
    expect(g.to).toEqual({ x: 100, y: 20 });
  });
  it('shows in the colour panel as four straight gradients, each half the box, stops squeezed into half', () => {
    const css = gradientCss({ kind: 'diamond', stops: dia().stops });
    expect((css.match(/linear-gradient/g) ?? []).length).toBe(4);
    expect(css).toContain('linear-gradient(to top left, #ffffff 0%, #0000ff 50%) left top / 50% 50% no-repeat');
    expect(css).toContain('to bottom right');
  });
  it('is read from a file, and a kind this Frameling does not know is dropped', () => {
    expect(readGradient(dia())?.kind).toBe('diamond');
    expect(readGradient({ ...dia(), kind: 'kite' })).toBeUndefined();
  });
  it('blends between two diamond gradients, and keeps its kind', () => {
    const b = blendGradient(dia(), dia({ stops: [{ at: 0, color: '#000000' }, { at: 1, color: '#000000' }] }), 0.5)!;
    expect(b.kind).toBe('diamond');
    expect(b.stops[0].color).toBe('#808080');
  });
});

/** Canvases that write down what they are asked to draw: the main one and the spare ones the diamond is painted on. */
function fakeCanvases() {
  const log: string[] = [];
  const gradients: { args: number[]; stops: [number, string][] }[] = [];
  const make = (name: string) => {
    const ctx: Record<string, unknown> = {
      globalAlpha: 1,
      fillStyle: null,
      globalCompositeOperation: 'source-over',
      getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }),
      setTransform: () => {},
      save: () => {},
      restore: () => {},
      clip: (...a: unknown[]) => log.push(`${name} clip${a.length ? ' ' + a[a.length - 1] : ''}`),
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      clearRect: () => {},
      fill: () => log.push(`${name} fill ${gradients.indexOf(ctx.fillStyle as never)}`),
      fillRect: () => log.push(`${name} fillRect ${ctx.globalCompositeOperation} ${gradients.indexOf(ctx.fillStyle as never)}`),
      drawImage: () => log.push(`${name} drawImage ${ctx.globalCompositeOperation}`),
      createLinearGradient: (...args: number[]) => {
        const gr = { args, stops: [] as [number, string][], addColorStop: (at: number, c: string) => gr.stops.push([at, c]) };
        gradients.push(gr);
        return gr;
      },
    };
    ctx.canvas = { width: 100, height: 100, getContext: () => ctx };
    return ctx;
  };
  dropSpareCanvases();
  const made: unknown[] = [];
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = class {
    width = 0;
    height = 0;
    ctx = make(`spare${made.length}`);
    constructor() {
      made.push(this);
    }
    getContext() {
      return this.ctx;
    }
  };
  return { main: make('main'), log, gradients, done: () => {
      delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
      dropSpareCanvases();
    },
  };
}

describe('the canvas', () => {
  it('paints four straight gradients on a spare canvas, then lays them on through the shape', () => {
    const t = fakeCanvases();
    try {
      fillDiamond(t.main as never, dia(), {} as Path2D, 'evenodd');
    } finally {
      t.done();
    }
    expect(t.gradients).toHaveLength(4);
    expect(t.gradients.map((g) => g.args.slice(0, 2))).toEqual([[10, 10], [10, 10], [10, 10], [10, 10]]);
    // The first quarter runs towards the bottom right, half way to its corner (5 across and 5 down).
    expect(t.gradients[0].args[2]).toBeCloseTo(15, 9);
    expect(t.gradients[0].args[3]).toBeCloseTo(15, 9);
    expect(t.gradients[0].stops).toEqual([[0, '#ffffff'], [1, '#0000ff']]);
    // The first quarter just fills; each of the others replaces what is under it, inside its own clip, so no seam shows.
    expect(t.log.filter((l) => l.startsWith('spare'))).toEqual(['spare0 fill 0', 'spare0 clip', 'spare0 fillRect copy 1', 'spare0 clip', 'spare0 fillRect copy 2', 'spare0 clip', 'spare0 fillRect copy 3']);
    expect(t.log.filter((l) => l.startsWith('main'))).toEqual(['main clip evenodd', 'main drawImage source-over']);
  });
  it('a line is drawn plain on one spare canvas, kept where the diamond is painted on another, and laid on', () => {
    const t = fakeCanvases();
    let drawn = 0;
    try {
      strokeDiamond(t.main as never, dia(), () => (drawn++, t.log.push('stroke')));
    } finally {
      t.done();
    }
    expect(drawn).toBe(1);
    expect(t.gradients).toHaveLength(4);
    expect(t.log.indexOf('stroke')).toBeLessThan(t.log.indexOf('spare1 fill 0'));
    expect(t.log).toContain('spare0 drawImage source-in');
    expect(t.log[t.log.length - 1]).toBe('main drawImage source-over');
  });
  it('asks for a straight gradient when something wants one gradient for the whole shape', () => {
    const calls: unknown[][] = [];
    canvasGradient({ createLinearGradient: (...a: unknown[]) => (calls.push(a), { addColorStop: () => {} }) } as never, dia());
    expect(calls).toHaveLength(1);
  });
});

describe('SVG', () => {
  it('fills with a pattern of four pieces, each with its own straight gradient', () => {
    const svg = shapeToSvg(rect(dia(), dia()));
    expect(svg).toMatch(/<pattern id="(grad\w+)" patternUnits="userSpaceOnUse"/);
    expect((svg.match(/<linearGradient id="grad\w+q[0-3]"/g) ?? []).length).toBe(8); // four for the fill, four for the line
    expect((svg.match(/<path d="M[^"]*" fill="url\(#grad\w+q[0-3]\)" shape-rendering="crispEdges"\/>/g) ?? []).length).toBe(8);
    expect(svg).toMatch(/fill="url\(#grad\w+\)"/);
    expect(svg).toMatch(/stroke="url\(#grad\w+\)"/);
  });
  it('the pattern is a square round the centre that covers the shape, and its gradients run from the middle', () => {
    const p = diamondPattern('g', dia(), 30);
    const w = Number(/width="([\d.]+)"/.exec(p)![1]);
    expect(w).toBeGreaterThanOrEqual(60);
    expect(p).toMatch(/<linearGradient id="gq0" gradientUnits="userSpaceOnUse" x1="10" y1="10" x2="15" y2="15">/);
    expect(p).toContain('stop-color="#ffffff"');
    expect(p).toContain('stop-color="#0000ff"');
  });
  it('keeps see-through stops, and the pieces meet exactly without edge smoothing, so nothing is painted twice or left a seam', () => {
    const fade = diamondPattern('g', dia({ stops: [{ at: 0, color: '#ff000080' }, { at: 1, color: '#ff000000' }] }), 20);
    expect(fade).toContain('stop-opacity=');
    expect(fade).toMatch(/<path d="M10 10L/);
    expect((fade.match(/shape-rendering="crispEdges"/g) ?? []).length).toBe(4);
  });
  it('two shapes that reach different distances get patterns of their own', () => {
    expect(svgGradient(dia(), 10).id).not.toBe(svgGradient(dia(), 400).id);
    expect(svgGradient(dia(), 10).id).toBe(svgGradient(dia(), 20).id);
    expect(reachOf([{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }], { x: 0, y: 0 }, 2)).toBe(12);
  });
});

function pdfText(doc: Doc): string {
  const s = Buffer.from(writePdf(doc, { frames: [0], scale: 1, background: null, title: 't' })).toString('latin1');
  const re = /stream\n([\s\S]*?)\nendstream/g;
  let all = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    try {
      all += Buffer.from(unzlibSync(Buffer.from(m[1], 'latin1'))).toString('latin1');
    } catch {
      // not compressed text
    }
  }
  return all;
}

describe('PDF', () => {
  it('shades four pieces, each cut to the shape and clipped on its own, with a straight gradient each', () => {
    const all = pdfText(docWith(rect(dia())));
    expect((all.match(/W\* n \/Sh\d+ sh/g) ?? []).length).toBe(4);
    expect(new Set(all.match(/\/Sh\d+ sh/g)).size).toBe(4);
    // Each clip sits between q and Q, so the next piece starts clean.
    expect((all.match(/^q$/gm) ?? []).length).toBeGreaterThanOrEqual(4);
  });
  it('stays inside the shape: no point of a piece is outside the 20 by 20 box', () => {
    const all = pdfText(docWith(rect(dia())));
    const nums = [...all.matchAll(/^(-?[\d.]+) (-?[\d.]+) [ml]$/gm)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(nums.length).toBeGreaterThan(12);
    for (const [x, y] of nums.filter(([x, y]) => Math.abs(x) < 1e4 && Math.abs(y) < 1e4)) {
      expect(x).toBeGreaterThanOrEqual(-0.01);
      expect(x).toBeLessThanOrEqual(20.01);
      expect(y).toBeGreaterThanOrEqual(-0.01);
      expect(y).toBeLessThanOrEqual(20.01);
    }
  });
  it('a line takes pieces inside its own outline', () => {
    const all = pdfText(docWith(rect(undefined, dia())));
    expect((all.match(/ sh/g) ?? []).length).toBe(4);
  });
  it('a see-through stop fades each piece', () => {
    const all = pdfText(docWith(rect(dia({ stops: [{ at: 0, color: '#ff0000ff' }, { at: 1, color: '#ff000000' }] }))));
    expect(all).toMatch(/\/GS\d+ gs/);
  });
  it('a shape that lies in only one quarter gets one piece', () => {
    const small: PathShape = { ...rect(dia({ from: { x: -50, y: -50 }, to: { x: -30, y: -50 } })) };
    const all = pdfText(docWith(small));
    expect((all.match(/ sh/g) ?? []).length).toBe(1);
  });
});

describe('Illustrator', () => {
  function ai(doc: Doc): string {
    const bytes = writePdf(doc, { frames: [0], scale: 1, background: '#ffffff', title: 'T', native: true });
    const text = Buffer.from(bytes).toString('latin1');
    const re = /stream\n([\s\S]*?)\nendstream/g;
    let m: RegExpExecArray | null;
    let out = '';
    while ((m = re.exec(text))) {
      try {
        const t = Buffer.from(unzlibSync(Buffer.from(m[1], 'latin1'))).toString('latin1');
        if (t.includes('AI5_BeginLayer')) out = t;
      } catch {
        // not compressed text
      }
    }
    return out;
  }
  it('gets four ordinary paths with real linear gradients, none of them bigger than the shape', () => {
    const text = ai(docWith(rect(dia())));
    expect(text).toContain('(A) Ln');
    const layer = text.slice(text.indexOf('(A) Ln'));
    expect((layer.match(/^Bb$/gm) ?? []).length).toBe(4);
    expect((layer.match(/^Bg$|\bBg$/gm) ?? []).length).toBe(4);
    for (const [, x, y] of layer.matchAll(/^(-?[\d.]+) (-?[\d.]+) [mL]$/gm)) {
      expect(Math.abs(Number(x))).toBeLessThan(200);
      expect(Math.abs(Number(y))).toBeLessThan(200);
    }
  });
  it('a diamond line comes across as those pieces too, not as one gradient stroke along the wrong line', () => {
    const text = ai(docWith(rect(undefined, dia())));
    const layer = text.slice(text.indexOf('(A) Ln'));
    expect((layer.match(/^1 Bb$/gm) ?? []).length).toBe(0);
    expect((layer.match(/^Bb$/gm) ?? []).length).toBe(4);
  });
});

describe('Lottie', () => {
  it('has no such gradient: the shape keeps its own plain colour, fill and line', () => {
    const json = JSON.stringify(docToLottie(docWith(rect(dia(), dia()))));
    expect(json).not.toContain('"ty":"gf"');
    expect(json).not.toContain('"ty":"gs"');
    expect(json).toContain('"ty":"fl"');
    expect(json).toContain('"ty":"st"');
  });
});

describe('what the Export window says', () => {
  const doc = docWith(rect(dia()));
  it('finds diamond gradients in a document and not in one without', () => {
    expect(docFeatures(doc).features.has('gradientDiamond')).toBe(true);
    expect(docFeatures(docWith(rect({ ...dia(), kind: 'linear' }))).features.has('gradientDiamond')).toBe(false);
    expect(docFeatures(doc).features.has('gradientAngular')).toBe(false);
    expect(FEATURE_WORDS.gradientDiamond).toMatch(/diamond/);
  });
  it('Lottie says they come out as a plain colour; SVG, PDF and Illustrator say they are four straight gradients; pictures say nothing', () => {
    expect(carryWarnings(doc, 'lottie').join(' ')).toMatch(/diamond gradients.*plain colour/);
    for (const f of ['svg', 'svganim', 'pdf', 'ai'] as const) expect(carryWarnings(doc, f).join(' ')).toMatch(/Diamond gradients .* four straight gradients/);
    for (const f of ['png', 'mp4', 'gif', 'psd'] as const) expect(carryWarnings(doc, f).join(' ')).not.toMatch(/iamond/);
  });
});
