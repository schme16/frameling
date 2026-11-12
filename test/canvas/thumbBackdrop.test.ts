import { describe, expect, it } from 'vitest';
import { brightness, parseBrightness, pickBackdrop } from '../../src/canvas/thumbBackdrop';

/** An RGBA picture, `n` pixels: `art` of them the given colour, the rest clear. */
const pic = (n: number, art: number, rgb: [number, number, number], alpha = 255) => {
  const d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < art; i++) d.set([...rgb, alpha], i * 4);
  return d;
};

const LIGHT_PANEL = brightness(0xf3, 0xee, 0xe6);
const DARK_PANEL = brightness(0x17, 0x15, 0x1f);

describe('thumbnail backdrop', () => {
  it('puts a dark backdrop behind white art on a light panel (the Twinkle star)', () => {
    expect(pickBackdrop(pic(100, 20, [255, 255, 255]), LIGHT_PANEL)).toBe('dark');
  });

  it('puts a light backdrop behind black art on a dark panel', () => {
    expect(pickBackdrop(pic(100, 20, [10, 10, 10]), DARK_PANEL)).toBe('light');
  });

  it('leaves art that already stands out alone, in both modes', () => {
    expect(pickBackdrop(pic(100, 20, [255, 255, 255]), DARK_PANEL)).toBeNull();
    expect(pickBackdrop(pic(100, 20, [20, 20, 30]), LIGHT_PANEL)).toBeNull();
    expect(pickBackdrop(pic(100, 20, [255, 150, 0]), DARK_PANEL)).toBeNull();
  });

  it('looks at most of the art, so a pale star with a dark outline is fine', () => {
    const d = pic(100, 40, [255, 255, 255]);
    for (let i = 40; i < 70; i++) d.set([20, 20, 20, 255], i * 4);
    expect(pickBackdrop(d, LIGHT_PANEL)).toBeNull();
  });

  it('ignores faint edge pixels and empty or fully covered pictures', () => {
    expect(pickBackdrop(pic(100, 0, [255, 255, 255]), LIGHT_PANEL)).toBeNull();
    expect(pickBackdrop(pic(100, 100, [255, 255, 255]), LIGHT_PANEL)).toBeNull();
    expect(pickBackdrop(pic(100, 30, [255, 255, 255], 10), LIGHT_PANEL)).toBeNull();
  });

  it('reads computed colours', () => {
    expect(parseBrightness('rgb(255, 255, 255)')).toBeCloseTo(1);
    expect(parseBrightness('rgba(0, 0, 0, 0.5)')).toBeCloseTo(0);
    expect(parseBrightness('color(srgb 1 1 1 / 0.82)')).toBeCloseTo(1);
    expect(parseBrightness('transparent')).toBeNull();
  });
});
