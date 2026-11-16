import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { currentChoice, setChoice } from '../../src/core/choices';
import { getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { getPx } from '../../src/canvas/pixels';
import { pencilTool } from '../../src/tools/pencil';
import { gradientTool } from '../../src/tools/gradient-tool';
import { GRADIENT_DITHERS, gradientThreshold, type GradientDither } from '../../src/pixel/dither';
import { gradientInk, gradientPosition, mixColors, paletteRamp, rampColor, rampFor, twoRamp, type GradientSpec } from '../../src/pixel/gradient';
import { setDocPalette } from '../../src/pixel/commands';
import { DEFAULT_PIXEL_SETTINGS, getPixelSettings, setPixelSettings } from '../../src/pixel/settings';
import { fullMask, rectMask } from '../../src/select/mask';
import { resetPixelSelection, setPixelSelection } from '../../src/select/pixel-state';
import { asGrid } from '../helpers/grid';
import '../../src/pixel';
import { ctx, drag, pixelStore } from '../tools/helpers';

const BLACK = [0, 0, 0, 255] as const;
const WHITE = [255, 255, 255, 255] as const;

describe('dither cut-offs', () => {
  it('spread evenly over a whole pattern, so a third of the way gives the second colour to about a third of pixels', () => {
    for (const [style, side] of [['chunky', 2], ['classic', 4], ['smooth', 8]] as [GradientDither, number][]) {
      let above = 0;
      for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) if (0.25 > gradientThreshold(style, x, y)) above++;
      expect(above / (side * side)).toBeCloseTo(0.25, 5);
    }
  });
  it('stay inside 0 to 1, repeat, and work for negative pixels', () => {
    for (const d of GRADIENT_DITHERS) {
      for (let y = -9; y < 9; y++)
        for (let x = -9; x < 9; x++) {
          const t = gradientThreshold(d.id, x, y);
          expect(t).toBeGreaterThan(0);
          expect(t).toBeLessThan(1);
          if (d.id !== 'grainy') expect(gradientThreshold(d.id, x + 8, y + 8)).toBe(t);
        }
    }
  });
  it('are always the same for the same pixel', () => {
    expect(gradientThreshold('grainy', 5, 7)).toBe(gradientThreshold('grainy', 5, 7));
  });
});

describe('position along a gradient', () => {
  it('runs 0 to 1 along a line and stays clamped beyond the ends', () => {
    const g = { x0: 0, y0: 0, x1: 10, y1: 0 };
    expect(gradientPosition('linear', g, -5, 3)).toBe(0);
    expect(gradientPosition('linear', g, 4, 9)).toBeCloseTo(0.45, 5);
    expect(gradientPosition('linear', g, 40, 0)).toBe(1);
  });
  it('works out from the middle when radial', () => {
    const g = { x0: 5, y0: 5, x1: 15, y1: 5 };
    expect(gradientPosition('radial', g, 4, 4)).toBeCloseTo(Math.hypot(0.5, 0.5) / 10, 5);
    expect(gradientPosition('radial', g, 50, 5)).toBe(1);
  });
  it('does not blow up on a zero length line', () => {
    expect(gradientPosition('linear', { x0: 3, y0: 3, x1: 3, y1: 3 }, 9, 9)).toBe(0);
  });
});

describe('palette steps', () => {
  const greys = ['#000000', '#444444', '#888888', '#cccccc', '#ffffff'];
  it('walks the palette colours between the two ends, in order', () => {
    const r = paletteRamp(BLACK, WHITE, greys);
    expect(r.colors.map((c) => c[0])).toEqual([0, 0x44, 0x88, 0xcc, 0xff]);
    expect(r.at[0]).toBe(0);
    expect(r.at[r.at.length - 1]).toBe(1);
    expect([...r.at].sort((a, b) => a - b)).toEqual(r.at);
  });
  it('leaves out palette colours that are not on the way', () => {
    const r = paletteRamp(BLACK, [136, 136, 136, 255], [...greys, '#ff0000']);
    expect(r.colors.every((c) => c[0] === c[1] && c[1] === c[2])).toBe(true);
    expect(r.colors.at(-1)![0]).toBe(0x88);
  });
  it('only ever gives palette colours, dithering between neighbours', () => {
    const ramp = paletteRamp(BLACK, WHITE, greys);
    const seen = new Set<number>();
    for (let t = 0; t <= 1; t += 0.013) for (const thr of [0.1, 0.5, 0.9]) seen.add(rampColor(ramp, t, thr)[0]);
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 0x44, 0x88, 0xcc, 0xff]);
  });
  it('mixes the two neighbours in the right amount between their centres', () => {
    const ramp = { colors: [BLACK, WHITE], at: [0, 1] };
    expect(rampColor(ramp, 0.25, 0.5)).toEqual(BLACK);
    expect(rampColor(ramp, 0.75, 0.5)).toEqual(WHITE);
    expect(rampColor(ramp, 0.5, 0.49)).toEqual(WHITE);
    expect(rampColor(ramp, 0.5, 0.51)).toEqual(BLACK);
  });
  it('keeps a fade between two bright colours in bright colours, not dull greys', () => {
    const cosy = ['#1d1b26', '#4a4557', '#8a8598', '#e8e3ee', '#5a1f33', '#b33a4c', '#ff6f91', '#ffc2cf', '#a8501f', '#ff9e3d', '#ffe066', '#1f4d3a', '#4f9a45', '#a8e070', '#2b4a9e', '#6fb8ff'];
    const r = paletteRamp([0x5a, 0x1f, 0x33, 255], [0xff, 0xe0, 0x66, 255], cosy);
    const hexes = r.colors.map((c) => '#' + [c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
    expect(hexes[0]).toBe('#5a1f33');
    expect(hexes.at(-1)).toBe('#ffe066');
    expect(hexes).not.toContain('#8a8598');
    expect(hexes).not.toContain('#4a4557');
  });
  it('falls back to the two ends when the palette is empty or has a single colour', () => {
    expect(paletteRamp(BLACK, WHITE, [])).toEqual(twoRamp(BLACK, WHITE));
    const one = rampFor({ from: BLACK, to: WHITE, colours: 'palette', palette: ['#ff0000'] });
    expect(one.colors).toEqual([BLACK, WHITE]);
  });
  it('mixes two colours plainly', () => {
    expect(mixColors(BLACK, WHITE, 0.5)).toEqual([128, 128, 128, 255]);
  });
});

const spec = (over: Partial<GradientSpec> = {}): GradientSpec => ({
  shape: 'linear',
  line: { x0: 0, y0: 0, x1: 8, y1: 0 },
  from: BLACK,
  to: WHITE,
  colours: 'two',
  dither: 'classic',
  palette: [],
  paintedOnly: false,
  ...over,
});
const run = (s: GradientSpec, x: number, y: number, a = 0) => {
  const out = new Uint8Array(4);
  const base = new Uint8ClampedArray([10, 20, 30, a]);
  return gradientInk(s).color(x, y, base, 0, out) ? [...out] : null;
};

describe('the gradient ink', () => {
  it('paints only the two colours when dithering two', () => {
    for (let x = 0; x < 8; x++) for (let y = 0; y < 4; y++) expect([0, 255]).toContain(run(spec(), x, y)![0]);
  });
  it('is the start colour at the start and the end colour at the end', () => {
    expect(run(spec(), -1, 0)).toEqual([0, 0, 0, 255]);
    expect(run(spec(), 8, 0)).toEqual([255, 255, 255, 255]);
  });
  it('gives hard steps with bands and a smooth mix with smooth', () => {
    expect(run(spec({ dither: 'bands' }), 1, 0)![0]).toBe(0);
    expect(run(spec({ dither: 'bands' }), 6, 0)![0]).toBe(255);
    const mid = run(spec({ colours: 'blend' }), 3, 5)!;
    expect(mid[0]).toBeGreaterThan(100);
    expect(mid[0]).toBeLessThan(155);
  });
  it('leaves clear pixels alone and keeps the alpha of painted ones in painted only mode', () => {
    expect(run(spec({ paintedOnly: true }), 3, 0, 0)).toBeNull();
    expect(run(spec({ paintedOnly: true }), 3, 0, 200)![3]).toBe(200);
  });
  it('does not mind which pixel it meets first (the same pixel always gets the same colour)', () => {
    expect(run(spec(), 3, 2)).toEqual(run(spec(), 3, 2));
  });
});

// ---------------------------------------------------------------- the tool on a real pixel layer

const at = (px: number, py: number): [number, number] => [px * 8 + 4, py * 8 + 4];
const drawing = () => asGrid(Object.values(store().get().doc.drawings)[0] as PixelDrawing);
const noneYet = () => Object.values(store().get().doc.drawings).length === 0;
const hex = (x: number, y: number) => {
  if (noneYet()) return null;
  const d = drawing();
  const [r, g, b, a] = getPx(d.pixels, d.width, x, y);
  return a ? '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') : null;
};
const layer = () => store().get().doc.layers[0] as PixelLayer;
const GREYS = { name: 'Greys', colors: ['#000000', '#444444', '#888888', '#cccccc', '#ffffff'], ramps: [5] };

beforeEach(() => {
  setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
  setChoice('pixelGradient.where', undefined);
  resetPixelSelection();
});

describe('Gradient tool on a pixel layer', () => {
  it('is available on both kinds of layer', () => {
    expect(gradientTool.layers).toEqual(['vector', 'pixel']);
  });
  it('paints from Paint to Back across the whole canvas in one undo step', () => {
    pixelStore();
    setDocPalette(GREYS);
    store().setUi({ color: '#000000', fillColor: '#ffffff' });
    drag(gradientTool, ctx(), [at(0, 0), at(7, 0)]);
    expect(hex(0, 3)).toBe('#000000');
    expect(hex(7, 7)).toBe('#ffffff');
    const colours = new Set<string | null>();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) colours.add(hex(x, y));
    expect(colours.has(null)).toBe(false);
    for (const c of colours) expect(GREYS.colors).toContain(c);
    expect(colours.size).toBeGreaterThan(2);
    store().undo();
    expect(hex(0, 0)).toBeNull();
  });
  it('keeps to the selection', () => {
    pixelStore();
    store().setUi({ color: '#000000', fillColor: '#ffffff' });
    setPixelSelection(rectMask(8, 8, 2, 2, 5, 5));
    drag(gradientTool, ctx(), [at(0, 0), at(7, 0)]);
    expect(hex(1, 3)).toBeNull();
    expect(hex(6, 3)).toBeNull();
    expect(hex(3, 3)).not.toBeNull();
    expect(hex(3, 6)).toBeNull();
  });
  it('only colours painted pixels when asked to', () => {
    pixelStore();
    store().setUi({ color: '#ff0000' });
    drag(pencilTool, ctx(), [at(2, 2), at(2, 2)]);
    setChoice('pixelGradient.where', 'painted');
    store().setUi({ color: '#000000', fillColor: '#ffffff' });
    drag(gradientTool, ctx(), [at(0, 0), at(7, 0)]);
    expect(hex(2, 2)).not.toBe('#ff0000');
    expect(hex(2, 2)).not.toBeNull();
    expect(hex(5, 5)).toBeNull();
  });
  it('snaps to the palette on a palette locked layer', () => {
    pixelStore();
    setDocPalette(GREYS);
    store().update('lock', (d) => void ((d.layers[0] as PixelLayer).paletteLock = true));
    store().setUi({ color: '#101010', fillColor: '#f0f0f0' });
    setPixelSettings({ gradientColours: 'blend' });
    drag(gradientTool, ctx(), [at(0, 0), at(7, 0)]);
    for (let x = 0; x < 8; x++) expect(GREYS.colors).toContain(hex(x, 4));
    expect(layer().paletteLock).toBe(true);
  });
  it('says so, and changes nothing, when Back is none', () => {
    pixelStore();
    store().setUi({ color: '#000000', fillColor: null });
    const c = ctx();
    drag(gradientTool, c, [at(0, 0), at(7, 0)]);
    expect(c.hint).toHaveBeenCalled();
    expect(hex(0, 0)).toBeNull();
  });
  it('treats a click as a click', () => {
    pixelStore();
    store().setUi({ color: '#000000', fillColor: '#ffffff' });
    const c = ctx();
    drag(gradientTool, c, [at(3, 3), at(3, 3)]);
    expect(hex(3, 3)).toBeNull();
    expect(c.hint).toHaveBeenCalled();
  });
  it('goes out from the middle when radial', () => {
    pixelStore();
    setPixelSettings({ gradientShape: 'radial', gradientColours: 'two', gradientDither: 'bands' });
    store().setUi({ color: '#000000', fillColor: '#ffffff' });
    drag(gradientTool, ctx(), [at(4, 4), at(7, 4)]);
    expect(hex(4, 4)).toBe('#000000');
    expect(hex(0, 0)).toBe('#ffffff');
  });
});

describe('Gradient commands and choices', () => {
  it('cycles the dither style, the colour mode and the shape', () => {
    expect(getPixelSettings().gradientDither).toBe('classic');
    getCommand('pixel.gradientDither')!.run();
    expect(getPixelSettings().gradientDither).toBe('smooth');
    expect(getPixelSettings().gradientColours).toBe('palette');
    getCommand('pixel.gradientColours')!.run();
    expect(getPixelSettings().gradientColours).toBe('two');
    getCommand('pixel.gradientRadial')!.run();
    expect(getPixelSettings().gradientShape).toBe('radial');
    getCommand('pixel.gradientRadial')!.run();
    expect(getPixelSettings().gradientShape).toBe('linear');
  });
  it('covers everywhere until told otherwise', () => {
    expect(currentChoice('pixelGradient.where')).toBe('all');
    setChoice('pixelGradient.where', 'painted');
    expect(currentChoice('pixelGradient.where')).toBe('painted');
  });
  it('a full mask is the whole grid (sanity for the selection path)', () => {
    expect(fullMask(3, 3).bits.every((b) => b === 1)).toBe(true);
  });
});
