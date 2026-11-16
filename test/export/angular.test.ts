// Angular (conic) gradients: the maths, and what every writer does with one. SVG and PDF make it out of thin wedges, Illustrator
// gets the PDF's wedges, Lottie has no conic gradient and falls back to the shape's plain colour.
import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import type { Doc, Gradient, PathShape } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { angularAt, angularWedges, canvasGradient, conicStart, gradientCss, placeGradient, readGradient, styleOf } from '../../src/core/gradient';
import { angularPattern, reachOf, shapeToSvg, svgGradient } from '../../src/export/svg';
import { writePdf } from '../../src/export/pdf';
import { docToLottie } from '../../src/export/lottie';
import { carryWarnings, docFeatures, FEATURE_WORDS } from '../../src/export/carries';
import { gradientPosition } from '../../src/pixel/gradient';
import { blendGradient } from '../../src/core/gradient';

const ang = (over: Partial<Gradient> = {}): Gradient => ({
  kind: 'angular',
  stops: [{ at: 0, color: '#ff0000' }, { at: 0.5, color: '#00ff00' }, { at: 1, color: '#ff0000' }],
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

describe('where a point falls round an angular gradient', () => {
  it('starts in the direction of the end handle and turns clockwise on screen', () => {
    const g = ang();
    expect(angularAt(g, 30, 10)).toBeCloseTo(0, 9); // straight on: the start
    expect(angularAt(g, 10, 30)).toBeCloseTo(0.25, 9); // below (y is down): a quarter turn
    expect(angularAt(g, -10, 10)).toBeCloseTo(0.5, 9);
    expect(angularAt(g, 10, -10)).toBeCloseTo(0.75, 9);
  });
  it('turns the start with the handle, and the middle is 0', () => {
    const g = ang({ to: { x: 10, y: 20 } }); // pointing down
    expect(angularAt(g, 10, 30)).toBeCloseTo(0, 9);
    expect(angularAt(g, -10, 10)).toBeCloseTo(0.25, 9);
    expect(angularAt(g, 10, 10)).toBe(0);
  });
  it('stays between 0 and 1 all the way round', () => {
    const g = ang({ to: { x: 3, y: 17 } });
    for (let a = 0; a < 360; a += 7) {
      const t = angularAt(g, 10 + Math.cos((a * Math.PI) / 180) * 9, 10 + Math.sin((a * Math.PI) / 180) * 9);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(1);
    }
  });
  it('the canvas start angle is the same direction', () => {
    expect(conicStart(ang())).toBeCloseTo(0, 9);
    expect(conicStart(ang({ to: { x: 10, y: 20 } }))).toBeCloseTo(Math.PI / 2, 9);
  });
  it('the pixel gradient agrees with it, on the middle of each pixel', () => {
    const line = { x0: 8, y0: 8, x1: 14, y1: 8 };
    expect(gradientPosition('angular', line, 20, 8)).toBeCloseTo(((Math.atan2(0.5, 12.5) / Math.PI / 2) + 1) % 1, 6);
    // The middle of pixel (7, 8) is half a pixel left of and below the start: an eighth of a turn short of half way round (3 / 8).
    expect(gradientPosition('angular', line, 7, 8)).toBeCloseTo(0.375, 6);
    expect(gradientPosition('angular', { x0: 3, y0: 3, x1: 3, y1: 3 }, 9, 9)).toBe(0);
  });
});

describe('wedges for the formats with no conic gradient', () => {
  it('cuts the circle into equal steps, each the colour at its middle', () => {
    const w = angularWedges(ang().stops, 4);
    expect(w.map((x) => [x.from, x.to])).toEqual([[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1]]);
    // The middle of the first step is 12.5 percent of the way from red to green.
    expect(w[0].color).toBe('#bf4000');
    expect(w[3].color).toBe(w[0].color);
  });
  it('ninety of them by default, and never fewer than three', () => {
    expect(angularWedges(ang().stops)).toHaveLength(90);
    expect(angularWedges(ang().stops, 1)).toHaveLength(3);
  });
});

describe('placing, showing and reading an angular gradient', () => {
  it('goes in the middle of a box, starting in the style angle', () => {
    const g = placeGradient({ kind: 'angular', stops: ang().stops, angle: 90 }, { x0: 0, y0: 0, x1: 100, y1: 40 });
    expect(g.kind).toBe('angular');
    expect(g.from).toEqual({ x: 50, y: 20 });
    expect(g.to.x).toBeCloseTo(50, 6);
    expect(g.to.y).toBeGreaterThan(20);
    expect(styleOf(g).angle).toBe(90);
  });
  it('shows in the colour panel as a conic gradient that starts where the canvas one does', () => {
    expect(gradientCss({ kind: 'angular', stops: ang().stops }, 0)).toMatch(/^conic-gradient\(from 90deg, #ff0000 0%, #00ff00 50%, #ff0000 100%\)$/);
  });
  it('is read from a file, and a kind this Frameling does not know is dropped', () => {
    expect(readGradient(ang())?.kind).toBe('angular');
    expect(readGradient({ ...ang(), kind: 'conical-v2' })).toBeUndefined();
    expect(readGradient({ ...ang(), stops: [] })).toBeUndefined();
  });
  it('blends between two angular gradients, but not with another kind', () => {
    const b = blendGradient(ang(), ang({ stops: [{ at: 0, color: '#0000ff' }, { at: 0.5, color: '#0000ff' }, { at: 1, color: '#0000ff' }] }), 0.5)!;
    expect(b.kind).toBe('angular');
    expect(b.stops[0].color).toBe('#800080');
    expect(blendGradient(ang(), { ...ang(), kind: 'linear' }, 0.2)?.kind).toBe('angular');
  });
  it('asks the canvas for a conic gradient at the start angle, and a linear one where the canvas has none', () => {
    const calls: unknown[][] = [];
    const stop = () => {};
    const ctx = { createConicGradient: (...a: unknown[]) => (calls.push(a), { addColorStop: stop }), createLinearGradient: (...a: unknown[]) => (calls.push(['linear', ...a]), { addColorStop: stop }) };
    canvasGradient(ctx as never, ang({ to: { x: 10, y: 20 } }));
    expect(calls[0][0]).toBeCloseTo(Math.PI / 2, 9);
    expect(calls[0].slice(1)).toEqual([10, 10]);
    canvasGradient({ createLinearGradient: ctx.createLinearGradient } as never, ang());
    expect(calls[1][0]).toBe('linear');
  });
});

describe('SVG', () => {
  it('fills with a pattern of wedges, since SVG has no conic gradient', () => {
    const svg = shapeToSvg(rect(ang(), ang()));
    expect(svg).toMatch(/<pattern id="(grad\w+)" patternUnits="userSpaceOnUse"/);
    expect((svg.match(/<path d="M10 10L/g) ?? []).length).toBe(180); // 90 for the fill, 90 for the line
    expect(svg).toMatch(/fill="url\(#grad\w+\)"/);
    expect(svg).toMatch(/stroke="url\(#grad\w+\)"/);
    expect(svg).not.toContain('Gradient id');
  });
  it('the pattern is a square round the centre that covers the shape, and starts the sweep at the handle', () => {
    const p = angularPattern('g', ang(), 30);
    const w = Number(/width="([\d.]+)"/.exec(p)![1]);
    expect(w).toBeGreaterThanOrEqual(60);
    // The first wedge begins on the line to the handle (to the right of the centre at the same height).
    expect(p).toMatch(/<path d="M10 10L\d+(\.\d+)? 10L/);
    expect(p).toMatch(/fill="#f[0-9a-f]0[0-9a-f]00"/);
  });
  it('keeps see-through stops', () => {
    const p = angularPattern('g', ang({ stops: [{ at: 0, color: '#ff000080' }, { at: 1, color: '#ff000000' }] }), 20);
    expect(p).toContain('fill-opacity=');
  });
  it('two shapes that reach different distances get patterns of their own', () => {
    expect(svgGradient(ang(), 10).id).not.toBe(svgGradient(ang(), 400).id);
    expect(svgGradient(ang(), 10).id).toBe(svgGradient(ang(), 20).id);
  });
  it('reach counts the curve handles and a line margin', () => {
    expect(reachOf([{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0, c1: { x: 40, y: 0 }, c2: { x: 5, y: 0 } }] }], { x: 0, y: 0 }, 3)).toBe(43);
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
  it('fills 90 wedges cut to the shape (no clip, no shading), each one plain colour', () => {
    const all = pdfText(docWith(rect(ang())));
    expect((all.match(/f\* Q/g) ?? []).length).toBe(90);
    expect(all).not.toMatch(/\/Sh\d+ sh/);
    expect(all).not.toContain('W* n');
    // Red at the start of the sweep, green half a turn round, 90 steps between.
    const reds = [...all.matchAll(/q ([\d.]+) ([\d.]+) 0 rg/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(reds).toHaveLength(90);
    expect(reds[0][0]).toBeGreaterThan(0.98);
    expect(reds[44][1]).toBeGreaterThan(0.95);
  });
  it('stays inside the shape: no point of a wedge is outside the 20 by 20 box', () => {
    const all = pdfText(docWith(rect(ang())));
    const nums = [...all.matchAll(/^(-?[\d.]+) (-?[\d.]+) [ml]$/gm)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(nums.length).toBeGreaterThan(200);
    for (const [x, y] of nums.filter(([x, y]) => Math.abs(x) < 1e4 && Math.abs(y) < 1e4)) {
      expect(x).toBeGreaterThanOrEqual(-0.01);
      expect(x).toBeLessThanOrEqual(20.01);
      expect(y).toBeGreaterThanOrEqual(-0.01);
      expect(y).toBeLessThanOrEqual(20.01);
    }
  });
  it('a line takes wedges inside its own outline', () => {
    const all = pdfText(docWith(rect(undefined, ang())));
    expect((all.match(/f\* Q/g) ?? []).length).toBe(90);
  });
  it('a see-through stop fades its wedges', () => {
    const all = pdfText(docWith(rect(ang({ stops: [{ at: 0, color: '#ff0000ff' }, { at: 1, color: '#ff000000' }] }))));
    expect(all).toMatch(/\/GS\d+ gs/);
  });
});

describe('Illustrator', () => {
  it('gets the wedges as ordinary filled shapes, none of them anywhere near as big as an unclipped wedge would be', () => {
    const bytes = writePdf(docWith(rect(ang())), { frames: [0], scale: 1, background: '#ffffff', title: 'T', native: true });
    const text = Buffer.from(bytes).toString('latin1');
    const re = /stream\n([\s\S]*?)\nendstream/g;
    let m: RegExpExecArray | null;
    let ai = '';
    while ((m = re.exec(text))) {
      try {
        const t = Buffer.from(unzlibSync(Buffer.from(m[1], 'latin1'))).toString('latin1');
        if (t.includes('AI5_BeginLayer')) ai = t;
      } catch {
        // not compressed text
      }
    }
    expect(ai).toContain('(A) Ln');
    const layer = ai.slice(ai.indexOf('(A) Ln'));
    expect((layer.match(/^f$/gm) ?? []).length).toBeGreaterThanOrEqual(90);
    for (const [, x, y] of layer.matchAll(/^(-?[\d.]+) (-?[\d.]+) [mL]$/gm)) {
      expect(Math.abs(Number(x))).toBeLessThan(200);
      expect(Math.abs(Number(y))).toBeLessThan(200);
    }
  });
});

describe('Lottie', () => {
  it('has no conic gradient: the shape keeps its own plain colour, fill and line', () => {
    const json = JSON.stringify(docToLottie(docWith(rect(ang(), ang()))));
    expect(json).not.toContain('"ty":"gf"');
    expect(json).not.toContain('"ty":"gs"');
    expect(json).toContain('"ty":"fl"');
    expect(json).toContain('"ty":"st"');
  });
});

describe('what the Export window says', () => {
  const doc = docWith(rect(ang()));
  it('finds angular gradients in a document and not in one without', () => {
    expect(docFeatures(doc).features.has('gradientAngular')).toBe(true);
    expect(docFeatures(docWith(rect({ ...ang(), kind: 'linear' }))).features.has('gradientAngular')).toBe(false);
    expect(FEATURE_WORDS.gradientAngular).toMatch(/angular/);
  });
  it('Lottie says they come out as a plain colour; SVG, PDF and Illustrator say they are thin wedges; pictures say nothing', () => {
    expect(carryWarnings(doc, 'lottie').join(' ')).toMatch(/angular gradients.*plain colour/);
    for (const f of ['svg', 'svganim', 'pdf', 'ai'] as const) expect(carryWarnings(doc, f).join(' ')).toMatch(/Angular gradients .* wedges/);
    for (const f of ['png', 'mp4', 'gif', 'psd'] as const) expect(carryWarnings(doc, f).join(' ')).not.toMatch(/ngular/);
  });
});
