// @vitest-environment jsdom
// The pixel brush tool: its place among the tools, its commands, how the edge is decided, and its words.
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { allCommands, getTool } from '../../src/core/registry';
import { _resetChoicesForTests, setChoice } from '../../src/core/choices';
import { setToolSettings } from '../../src/tools/settings';
import { DEFAULT_DAB } from '../../src/dab/maths';
import { getDab, resetDab } from '../../src/dab/settings';
import { SPACING_STEPS, stepSpacing } from '../../src/dab/commands';
import { edgeNote } from '../../src/dab/Options';
import { renderSample, sampleBrush } from '../../src/dab/sample';
import { dabEdge } from '../../src/dab/tools';
import { footprint } from '../../src/dab/cursor';
import { getCommand } from '../../src/core/registry';
import { PIXEL_STARTERS } from '../../src/brushes/pixelStarters';
import '../../src/dab';

beforeEach(() => {
  _resetChoicesForTests();
  resetStore(newDoc({ width: 32, height: 32, pixel: { pixelSize: 1 } }));
  resetDab();
  setToolSettings({ pixelPerfect: false });
});

describe('the pixel brush tool', () => {
  it('is a pixel layer tool with a key and a help topic, so a vector layer never offers it', () => {
    const t = getTool('pixel-brush');
    expect(t?.layers).toEqual(['pixel']);
    expect(t?.key).toBe('Alt+Shift+N');
    expect(t?.help).toBe('pixel-brush');
  });

  it('has a palette command for every setting you flip, each with the pixel brush help', () => {
    const mine = allCommands().filter((c) => c.id.startsWith('pixelbrush.'));
    expect(mine.map((c) => c.id).sort()).toEqual(['pixelbrush.dual', 'pixelbrush.fade', 'pixelbrush.follow', 'pixelbrush.grain', 'pixelbrush.pen', 'pixelbrush.scatter', 'pixelbrush.smooth', 'pixelbrush.spacing.closer', 'pixelbrush.spacing.wider', 'pixelbrush.tip.picture', 'pixelbrush.tip.round', 'pixelbrush.tip.square', 'pixelbrush.wet', 'pixelbrush.wobble']);
    for (const c of mine) expect(c.help).toBe('pixel-brush');
  });

  it('flips smooth edges, turning with the line and scatter from the palette', () => {
    expect(getDab().aliased).toBe(true);
    getCommand('pixelbrush.smooth')!.run();
    expect(getDab().aliased).toBe(false);
    getCommand('pixelbrush.follow')!.run();
    expect(getDab().follow).toBe(true);
    getCommand('pixelbrush.scatter')!.run();
    expect(getDab().scatter).toBeGreaterThan(0);
    getCommand('pixelbrush.scatter')!.run();
    expect(getDab().scatter).toBe(0);
    getCommand('pixelbrush.tip.square')!.run();
    expect(getDab().tip).toBe('square');
  });

  it('asks for a picture before it makes a picture tip, and does not make a tip with nothing in it', () => {
    getCommand('pixelbrush.tip.picture')!.run();
    expect(getDab().tip).toBe('round');
  });

  it('steps the spacing through a short list of useful ones, staying at the ends', () => {
    expect(stepSpacing(0.25, 1)).toBe(0.5);
    expect(stepSpacing(0.25, -1)).toBe(0.1);
    expect(stepSpacing(0.1, -1)).toBe(SPACING_STEPS[0]);
    expect(stepSpacing(2.5, 1)).toBe(2.5);
    expect(stepSpacing(0.3, 1)).toBe(0.5);
    expect(stepSpacing(0.3, -1)).toBe(0.25);
  });
});

describe('how the edge is made', () => {
  const free = { paletteLock: false };
  const locked = { paletteLock: true };

  it('is always sharp for a brush with sharp pixels, whatever the layer or Pixel perfect say', () => {
    expect(dabEdge(true, free)).toEqual({ mode: 'crisp', why: 'aliased' });
    expect(dabEdge(true, locked).mode).toBe('crisp');
  });

  it('is smooth for a smooth brush on a free layer, and dithered when the palette is locked', () => {
    setChoice('soft.edge', 'smooth');
    expect(dabEdge(false, free)).toEqual({ mode: 'smooth', why: null });
    expect(dabEdge(false, locked)).toEqual({ mode: 'crisp', why: 'locked' });
  });

  it('follows the Pixel perfect answer for a smooth brush', () => {
    setToolSettings({ pixelPerfect: true });
    setChoice('soft.edge', 'crisp');
    expect(dabEdge(false, free)).toEqual({ mode: 'crisp', why: 'perfect' });
    setChoice('soft.edge', 'smooth');
    expect(dabEdge(false, free).mode).toBe('smooth');
  });

  it('says why in plain words when a smooth edge is dithered, and nothing when it is as asked', () => {
    expect(edgeNote(true, false, 'smooth', false)).toMatch(/palette/);
    expect(edgeNote(false, true, 'crisp', false)).toMatch(/Pixel perfect/);
    expect(edgeNote(false, true, 'smooth', false)).toBeNull();
    expect(edgeNote(true, true, 'crisp', true)).toBeNull();
    for (const w of [edgeNote(true, false, 'smooth', false), edgeNote(false, true, 'crisp', false)]) expect(w).not.toMatch(/\u2014|\u2013/);
  });
});

describe('the sample pictures in the picker', () => {
  const ink: [number, number, number] = [10, 20, 30];

  it('draw a sharp pixel brush with whole pixels only, in the ink asked for', () => {
    const px = renderSample({ kind: 'dab', dab: { ...DEFAULT_DAB, size: 3 } }, 'stroke', 120, 30, ink);
    let on = 0;
    for (let i = 0; i < px.length; i += 4) {
      expect(px[i + 3] === 0 || px[i + 3] === 255).toBe(true);
      if (px[i + 3]) {
        on++;
        expect([px[i], px[i + 1], px[i + 2]]).toEqual(ink);
      }
    }
    expect(on).toBeGreaterThan(100);
  });

  it('draw the same picture every time, and a dab in the middle of its box', () => {
    const spec = { kind: 'dab' as const, dab: { ...DEFAULT_DAB, size: 5, scatter: 1, sizeJitter: 0.5 } };
    expect(Array.from(renderSample(spec, 'stroke', 100, 30, ink))).toEqual(Array.from(renderSample(spec, 'stroke', 100, 30, ink)));
    const one = renderSample({ kind: 'dab', dab: { ...DEFAULT_DAB, size: 5 } }, 'dab', 40, 30, ink);
    expect(one[(15 * 40 + 20) * 4 + 3]).toBe(255);
    expect(one[3]).toBe(0);
  });

  it('shrink a big brush to fit the row, and show soft paint and dry media as smooth brushes', () => {
    expect(sampleBrush({ kind: 'dab', dab: { ...DEFAULT_DAB, size: 200 } }, 30).size).toBeLessThanOrEqual(24);
    expect(sampleBrush({ kind: 'soft', tool: 'airbrush', size: 28, hardness: 0, flow: 0.3 }, 30).aliased).toBe(false);
    const dry = renderSample({ kind: 'dry', medium: 'chalk', paper: 'rough', size: 14, hardness: 0.3, press: 0.3 }, 'stroke', 100, 30, ink);
    const alphas = new Set<number>();
    for (let i = 3; i < dry.length; i += 4) alphas.add(dry[i]);
    expect(alphas.size).toBeGreaterThan(2);
  });
});

describe('the cursor footprint', () => {
  it('is the pixels the first dab would paint, whatever the tip', () => {
    expect(footprint({ ...DEFAULT_DAB, size: 5 }, 5, 10.2, 10.7)).toHaveLength(21);
    expect(footprint({ ...DEFAULT_DAB, tip: 'square', size: 3 }, 3, 10, 10)).toHaveLength(9);
    expect(footprint({ ...DEFAULT_DAB, size: 1 }, 1, 4.9, 4.1)).toEqual([{ x: 4, y: 4 }]);
  });

  it('turns and flattens with the brush', () => {
    const flat = footprint({ ...DEFAULT_DAB, tip: 'square', size: 11, roundness: 0.2 }, 11, 20.5, 20.5);
    const wide = Math.max(...flat.map((c) => c.x)) - Math.min(...flat.map((c) => c.x));
    const tall = Math.max(...flat.map((c) => c.y)) - Math.min(...flat.map((c) => c.y));
    expect(wide).toBeGreaterThan(tall * 2);
    const turned = footprint({ ...DEFAULT_DAB, tip: 'square', size: 11, roundness: 0.2, angle: 90 }, 11, 20.5, 20.5);
    expect(Math.max(...turned.map((c) => c.y)) - Math.min(...turned.map((c) => c.y))).toBeGreaterThan(tall * 2);
  });
});

describe('the new starters', () => {
  it('draw as pictures in the picker: dynamics, grain, dual tip and colour all render a stroke', () => {
    for (const s of PIXEL_STARTERS.filter((x) => x.pixel?.kind === 'dab' && ['Pen and speed', 'Grain and texture', 'Colour'].includes(x.group ?? ''))) {
      const px = renderSample(s.pixel!, 'stroke', 120, 32, [20, 20, 20]);
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i]) n++;
      expect(n, s.name).toBeGreaterThan(10);
    }
  });
});
