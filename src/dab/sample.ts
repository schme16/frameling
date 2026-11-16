// The sample pictures for pixel brushes in the picker: a long stroke and a single dab, drawn by the real dab engine (so
// spacing, scatter and the picture tip show as they will), at the brush's own pixel size so a pixel brush looks like pixels.
// Only dab brushes come here: soft paint and the dry media are drawn by src/brushes/pixelPreview.ts.
import type { DabBrush } from './maths';
import { bufferSurface, DabStroke } from './stroke';
import type { PixelSpec } from './spec';

export type SampleKind = 'stroke' | 'dab';

export type DabSpec = Extract<PixelSpec, { kind: 'dab' }>;

/** The dab brush that draws a pixel brush's sample, with its size scaled down to fit a box `h` tall. */
export function sampleBrush(spec: DabSpec, h: number, w = 200): DabBrush {
  const k = Math.min(1, (h * 0.8) / Math.max(1, spec.dab.size));
  // A fade is measured in pixels of line, and the sample is a short one: it runs out over most of it.
  return { ...spec.dab, size: Math.max(1, Math.round(spec.dab.size * k)), fadeLength: Math.min(spec.dab.fadeLength, w * 0.85) };
}

/** The points of the long sample: a slow wave across the box with room at each end. */
function wave(w: number, h: number): { x: number; y: number }[] {
  const pad = Math.min(14, w * 0.06);
  return Array.from({ length: 49 }, (_, i) => {
    const t = i / 48;
    return { x: pad + t * (w - pad * 2), y: h / 2 + Math.sin(t * Math.PI * 2) * h * 0.2 };
  });
}

/**
 * An RGBA picture, `w` by `h`, of the brush's stroke or dab in `ink`. Nothing is drawn where the brush leaves the box empty.
 * `base` is what the brush is drawn over (a wet brush needs paint under it to pick up); it comes back in the picture.
 */
export function renderSample(spec: DabSpec, kind: SampleKind, w: number, h: number, ink: [number, number, number], base?: Uint8ClampedArray): Uint8ClampedArray {
  const px = base && base.length === w * h * 4 ? base.slice() : new Uint8ClampedArray(w * h * 4);
  const brush = sampleBrush(spec, h, w);
  // The back colour for a brush that mixes: the ink, a good way toward white.
  const back: [number, number, number, number] = [ink[0] + (255 - ink[0]) * 0.65, ink[1] + (255 - ink[1]) * 0.65, ink[2] + (255 - ink[2]) * 0.65, 255];
  const stroke = new DabStroke(bufferSurface(px, w, h), { brush, color: [ink[0], ink[1], ink[2], 255], back, edge: brush.aliased ? 'crisp' : 'smooth', seed: 7 });
  const flow = brush.flow;
  if (kind === 'dab' && brush.wet > 0) {
    // A wet brush shows nothing in one dab (it has met no paint yet): its dab is a short pull across the middle.
    const reach = Math.min(brush.size, w / 3);
    for (const k of [-1, -0.5, 0, 0.5, 1]) stroke.moveTo({ x: w / 2 + k * reach, y: h / 2 }, brush.size, flow, { pressure: 1, speed: 0.4 });
  } else if (kind === 'dab') stroke.moveTo({ x: w / 2, y: h / 2 }, brush.size, flow, { pressure: 1, speed: 0.4 });
  else {
    // A pretend pen: pressure swells and eases off over the stroke, and the hand moves at a medium speed.
    const pts = wave(w, h);
    pts.forEach((p, i) => stroke.moveTo(p, brush.size, flow, { pressure: 0.2 + 0.8 * Math.sin((i / (pts.length - 1)) * Math.PI), speed: 0.4 }));
  }
  stroke.finish();
  return px;
}

