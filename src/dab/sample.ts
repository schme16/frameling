// The sample pictures for pixel brushes in the picker: a long stroke and a single dab, drawn by the real dab engine (so
// spacing, scatter and the picture tip show as they will), at the brush's own pixel size so a pixel brush looks like pixels.
// The soft paint tools and the dry media are shown as the nearest dab brush (a round soft one, with the paper's grain for the dry ones).
import { paperHeight } from '../dry/paper';
import { DEFAULT_DAB, type DabBrush } from './maths';
import { bufferSurface, DabStroke } from './stroke';
import type { PixelSpec } from './spec';

export type SampleKind = 'stroke' | 'dab';

/** The dab brush that draws a pixel brush's sample, with its size scaled down to fit a box `h` tall. */
export function sampleBrush(spec: PixelSpec, h: number, w = 200): DabBrush {
  const fit = (size: number) => Math.max(1, Math.min(size, h * 0.8));
  if (spec.kind === 'dab') {
    const k = Math.min(1, (h * 0.8) / Math.max(1, spec.dab.size));
    // A fade is measured in pixels of line, and the sample is a short one: it runs out over most of it.
    return { ...spec.dab, size: Math.max(1, Math.round(spec.dab.size * k)), fadeLength: Math.min(spec.dab.fadeLength, w * 0.85) };
  }
  if (spec.kind === 'soft') return { ...DEFAULT_DAB, size: Math.round(fit(spec.size)), hardness: spec.hardness, spacing: 0.1, flow: Math.min(1, spec.flow * 0.6 + 0.1), aliased: false };
  return { ...DEFAULT_DAB, size: Math.round(fit(spec.size)), hardness: spec.hardness, spacing: 0.1, flow: Math.min(1, spec.press * 0.5 + 0.15), aliased: false };
}

/** The points of the long sample: a slow wave across the box with room at each end. */
function wave(w: number, h: number): { x: number; y: number }[] {
  const pad = Math.min(14, w * 0.06);
  return Array.from({ length: 49 }, (_, i) => {
    const t = i / 48;
    return { x: pad + t * (w - pad * 2), y: h / 2 + Math.sin(t * Math.PI * 2) * h * 0.2 };
  });
}

/** An RGBA picture, `w` by `h`, of the brush's stroke or dab in `ink`. Nothing is drawn where the brush leaves the box empty. */
export function renderSample(spec: PixelSpec, kind: SampleKind, w: number, h: number, ink: [number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  const brush = sampleBrush(spec, h, w);
  // The back colour for a brush that mixes: the ink, a good way toward white.
  const back: [number, number, number, number] = [ink[0] + (255 - ink[0]) * 0.65, ink[1] + (255 - ink[1]) * 0.65, ink[2] + (255 - ink[2]) * 0.65, 255];
  const stroke = new DabStroke(bufferSurface(px, w, h), { brush, color: [ink[0], ink[1], ink[2], 255], back, edge: brush.aliased ? 'crisp' : 'smooth', seed: 7 });
  const flow = spec.kind === 'dab' ? brush.flow : 1;
  if (kind === 'dab') stroke.moveTo({ x: w / 2, y: h / 2 }, brush.size, flow, { pressure: 1, speed: 0.4 });
  else {
    // A pretend pen: pressure swells and eases off over the stroke, and the hand moves at a medium speed.
    const pts = wave(w, h);
    pts.forEach((p, i) => stroke.moveTo(p, brush.size, flow, { pressure: 0.2 + 0.8 * Math.sin((i / (pts.length - 1)) * Math.PI), speed: 0.4 }));
  }
  stroke.finish();
  if (spec.kind === 'dry') {
    // The paper shows through: pigment sits on the high points only, more of them the harder you press.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4 + 3;
        if (px[i] && paperHeight(spec.paper, x, y) > 0.35 + spec.press * 0.65) px[i] = Math.round(px[i] * 0.18);
      }
  }
  return px;
}

