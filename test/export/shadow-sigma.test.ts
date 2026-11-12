// How soft Shadow and Glow are in each format. The editor draws a shadow with the canvas `drop-shadow(x y b)`, which
// Chromium blurs with a sigma of b itself (not the CSS spec's b / 2), and a glow with `blur(size / 2)`. Each format that writes
// its own blur has to convert, and scripts/e2e/shadow-sigma.cjs measures the real blur width of every format in a browser
// against the editor. These tests pin the mapping so it can't drift without that script being run again.
import { describe, expect, it } from 'vitest';
import type { Doc, LayerEffect } from '../../src/core/format';
import { newDoc, uid } from '../../src/core/doc';
import { effectReach } from '../../src/core/render';
import { defaultValues } from '../../src/effects/model';
import { filterFor } from '../../src/effects/apply';
import { lottieExport } from '../../src/export/lottie';
import { animatedSvg } from '../../src/export/svg-anim';
import { frameToSvg } from '../../src/export/svg';
import { addVectorLayer, fill, hold, rectPath, vectorDrawing } from '../../src/templates/build';

const fx = (kind: LayerEffect['kind'], values: Record<string, number | string> = {}): LayerEffect => ({ id: uid('e'), kind, values: { ...defaultValues(kind), ...values } });

function docWith(effect: LayerEffect): Doc {
  const doc = newDoc({ width: 100, height: 80, length: 4, fps: 12 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Box');
  l.effects = [effect];
  hold(l, vectorDrawing(doc, [fill([rectPath(10, 10, 40, 40)], '#5ab8ff')]).id, 0, 4);
  return doc;
}

/** The blur sigmas an SVG writes, in order. */
const sigmas = (svg: string) => [...svg.matchAll(/<feGaussianBlur[^>]* stdDeviation="([\d.]+)"/g)].map((m) => Number(m[1]));

describe('editor (native canvas filter)', () => {
  it('draws a shadow with drop-shadow(blur = softness) and a glow with blur(size / 2)', () => {
    expect(filterFor('shadow', { x: 3, y: 4, softness: 12, opacity: 1, color: '#000000' }, 1)).toMatch(/^drop-shadow\(3px 4px 12px /);
    expect(filterFor('shadow', { x: 3, y: 4, softness: 12, opacity: 1, color: '#000000' }, 2)).toMatch(/^drop-shadow\(6px 8px 24px /);
    expect(filterFor('blur', { radius: 5 }, 1)).toBe('blur(5px)');
  });
});

describe('SVG and moving SVG', () => {
  for (const [name, write] of [['SVG', (d: Doc) => frameToSvg(d, 0)], ['Moving SVG', (d: Doc) => animatedSvg(d)]] as const) {
    it(`${name}: shadow sigma is the softness, glow sigma is size / 2, soften sigma is the radius`, () => {
      for (const softness of [2, 6, 12.5]) expect(sigmas(write(docWith(fx('shadow', { softness }))))).toEqual([softness]);
      for (const size of [4, 12, 25]) expect(sigmas(write(docWith(fx('glow', { size }))))).toEqual([size / 2]);
      for (const radius of [1, 5, 9]) expect(sigmas(write(docWith(fx('blur', { radius }))))).toEqual([radius]);
    });
  }
});

describe('Lottie', () => {
  const ef = (e: LayerEffect) => (lottieExport(docWith(e)).data.layers.find((l: { nm: string }) => l.nm === 'Box') as { ef: { ef: { v: { k: number } }[] }[] }).ef;
  it('shadow Softness is four times ours (lottie-web and ThorVG: sigma = Softness / 4)', () => {
    for (const softness of [2, 6, 12.5]) expect(ef(fx('shadow', { softness }))[0].ef[4].v.k).toBe(softness * 4);
  });
  it('soften Blurriness is radius / 0.3 (lottie-web: sigma = Blurriness * 0.3)', () => {
    for (const radius of [1, 5, 9]) expect(ef(fx('blur', { radius }))[0].ef[0].v.k).toBeCloseTo(radius / 0.3, 2);
  });
});

describe('effect reach', () => {
  it('covers three sigmas of each blur', () => {
    expect(effectReach('blur', { radius: 3 })).toBe(9);
    expect(effectReach('shadow', { x: 5, y: -2, softness: 4 })).toBe(5 + 12);
    expect(effectReach('glow', { size: 8 })).toBe(12);
  });
});
