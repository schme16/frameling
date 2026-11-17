// The sample pictures for the soft paint tools and the dry media in the picker. Each is drawn by the real tool's own
// stroke (SoftStroke, SmudgeStroke, DryStroke) on a small picture of its own, the way a stroke lands on a pixel layer, so
// the highlighter is see-through, the airbrush builds soft and chalk catches on the paper's tooth because the tool does.
// A pixel dab brush is the dab engine's own picture (see src/dab/sample.ts), so it is handed straight on.
//
// A tool that works on what is already there (the highlighter, the soft eraser, smudge, a wet brush) is drawn over
// something: a line of words, a bar, two tones, bands of colour. On a blank picture it would show nothing, or show the
// opposite of what it does.
import { edgeFor, type SoftKind } from '../soft/maths';
import { SmudgeStroke, SoftStroke, type PaintSurface } from '../soft/stroke';
import { DryStroke } from '../dry/stroke';
import { mediumInfo } from '../dry/maths';
import type { PixelSpec } from '../dab/spec';
import { renderSample, type SampleKind } from '../dab/sample';
import type { RGBA } from '../canvas/pixels';

export type { SampleKind };

/** Which stick the paper tooth streaks come from in every picture, so a picture never changes between draws. */
export const PIXEL_PREVIEW_SEED = 7;

/** The soft edge a layer gets with no palette lock and Pixel perfect off, which is what a plain pixel layer gives. */
const EDGE = edgeFor({ locked: false, pixelPerfect: false, crispAnswer: 'smooth' }).mode;

/** A picture the strokes can paint on: reads the picture as it was before the stroke, and writes into `px`. */
export function pictureSurface(px: Uint8ClampedArray, w: number, h: number): PaintSurface {
  const was = px.slice();
  const cell = (src: Uint8ClampedArray, x: number, y: number): RGBA => {
    const i = (y * w + x) * 4;
    return [src[i], src[i + 1], src[i + 2], src[i + 3]];
  };
  return {
    width: w,
    height: h,
    mirror: { mode: 'off', ax2: w, ay2: h },
    get: (x, y) => cell(px, x, y),
    getBase: (x, y) => cell(was, x, y),
    set(x, y, c) {
      const i = (y * w + x) * 4;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = c[3];
    },
  };
}

/** The points of the long sample: a slow wave across the box with room at each end. */
export function wavePoints(w: number, h: number): { x: number; y: number }[] {
  const pad = Math.min(14, w * 0.06);
  return Array.from({ length: 49 }, (_, i) => {
    const t = i / 48;
    return { x: pad + t * (w - pad * 2), y: h / 2 + Math.sin(t * Math.PI * 2) * h * 0.2 };
  });
}

/** The tool's width in the picture: the brush's own, scaled down to fit a box `h` tall. */
export const previewSize = (size: number, h: number): number => Math.max(1, Math.round(Math.min(size, h * 0.8)));

/** True for the tools that need something under them to show what they do. */
export const needsBase = (spec: PixelSpec): boolean =>
  spec.kind === 'dab' ? spec.dab.wet > 0 : spec.kind === 'soft' && (spec.tool === 'highlighter' || spec.tool === 'soft-eraser' || spec.tool === 'smudge');

/** The bands a wet brush drags through: three colours that sit well on both a light and a dark page and are far from each other, so a smear of one into the next shows. */
export const WET_BANDS: readonly [number, number, number][] = [
  [226, 96, 54],
  [46, 160, 190],
  [236, 190, 60],
];

/** How many colour bands a wet brush picture has: a long stroke crosses three, a single pull two. */
export const wetBandCount = (kind: SampleKind): number => (kind === 'dab' ? 2 : 3);

/** The bands as an RGBA picture: upright stripes of solid colour edge to edge, so the stroke runs from one into the next. */
export function wetBackdrop(w: number, h: number, kind: SampleKind): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  const n = wetBandCount(kind);
  for (let i = 0; i < n; i++) {
    const c = WET_BANDS[i];
    paintRect(px, w, h, Math.round((w * i) / n), 0, Math.round((w * (i + 1)) / n), h, [c[0], c[1], c[2], 255]);
  }
  return px;
}

const paintRect = (px: Uint8ClampedArray, w: number, h: number, x0: number, y0: number, x1: number, y1: number, c: RGBA): void => {
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      const i = (y * w + x) * 4;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = c[3];
    }
};

/** What the tool is drawn over: lines of words for the highlighter, a bar for the eraser, two tones for smudge, bands of colour for a wet brush. Blank for the rest. */
export function underlay(spec: PixelSpec, w: number, h: number, ink: [number, number, number], kind: SampleKind = 'stroke'): Uint8ClampedArray {
  if (spec.kind === 'dab' && spec.dab.wet > 0) return wetBackdrop(w, h, kind);
  const px = new Uint8ClampedArray(w * h * 4);
  if (spec.kind !== 'soft') return px;
  const solid: RGBA = [ink[0], ink[1], ink[2], 255];
  if (spec.tool === 'highlighter') {
    const t = Math.max(2, Math.round(h * 0.1));
    const words = [18, 9, 24, 12, 15, 21, 8, 17];
    // A single dab only covers a little of the line, so the words stop where the dab does.
    const lo = kind === 'dab' ? w / 2 - h * 0.5 : 8;
    const hi = kind === 'dab' ? w / 2 + h * 0.5 : w - 8;
    (kind === 'dab' ? [0.5] : [0.36, 0.64]).forEach((at, row) => {
      let x = lo + row * 11;
      for (let k = row * 3; x < hi; k++) {
        const len = words[k % words.length];
        paintRect(px, w, h, Math.round(x), Math.round(h * at - t / 2), Math.round(Math.min(hi, x + len)), Math.round(h * at - t / 2) + t, solid);
        x += len + 6;
      }
    });
  } else if (spec.tool === 'soft-eraser') {
    paintRect(px, w, h, 0, Math.round(h * 0.06), w, Math.round(h * 0.94), solid);
  } else if (spec.tool === 'smudge') {
    paintRect(px, w, h, 0, 0, w, Math.round(h / 2), solid);
    paintRect(px, w, h, 0, Math.round(h / 2), w, h, [ink[0], ink[1], ink[2], 70]);
  }
  return px;
}

/** The colour a lively picture is drawn in when the ink is a grey: turning the hue of a grey changes nothing. */
export const LIVELY_INK: [number, number, number] = [226, 96, 54];

/**
 * The ink to draw with. A brush that swings hue or saturation (Rainbow trail, Autumn leaves, Pixel confetti) is drawn in a
 * lively colour when the page's ink is grey, because it has nothing to turn otherwise and its picture would be a plain dark line.
 */
export function previewInk(spec: PixelSpec, ink: [number, number, number]): [number, number, number] {
  if (spec.kind !== 'dab' || !spec.dab.dynamics.some((r) => r.to === 'hue' || r.to === 'saturation')) return ink;
  return Math.max(ink[0], ink[1], ink[2]) - Math.min(ink[0], ink[1], ink[2]) < 40 ? LIVELY_INK : ink;
}

/** An RGBA picture, `w` by `h`, of the tool's stroke or dab in `ink`. Nothing is drawn where the tool leaves the box empty. */
export function renderPixelPreview(spec: PixelSpec, kind: SampleKind, w: number, h: number, ink: [number, number, number]): Uint8ClampedArray {
  if (spec.kind === 'dab') return renderSample(spec, kind, w, h, previewInk(spec, ink), needsBase(spec) ? underlay(spec, w, h, ink, kind) : undefined);
  const px = underlay(spec, w, h, ink, kind);
  const surface = pictureSurface(px, w, h);
  const color: RGBA = [ink[0], ink[1], ink[2], 255];
  const size = previewSize(spec.size, h);
  // A smudge needs a drag to show anything: its single dab is a short pull across the middle.
  const drag = spec.kind === 'soft' && spec.tool === 'smudge';
  const points = kind === 'stroke' ? wavePoints(w, h) : drag ? [-1, -0.5, 0, 0.5, 1].map((k) => ({ x: w / 2 + k * Math.min(size, w / 3), y: h / 2 })) : [{ x: w / 2, y: h / 2 }];
  if (spec.kind === 'dry') {
    const stroke = new DryStroke(surface, null, null, { medium: mediumInfo(spec.medium), paper: spec.paper ?? 'medium', color, hardness: spec.hardness, edge: EDGE, seed: PIXEL_PREVIEW_SEED });
    for (const p of points) stroke.moveTo(p, size, spec.press);
  } else if (spec.tool === 'smudge') {
    const stroke = new SmudgeStroke(surface, { kind: 'smudge', color, hardness: spec.hardness, edge: EDGE }, size);
    for (const p of points) stroke.moveTo(p, size, spec.flow);
  } else {
    const stroke = new SoftStroke(surface, null, null, { kind: spec.tool as SoftKind, color, hardness: spec.hardness, edge: EDGE });
    for (const p of points) stroke.moveTo(p, size, spec.flow);
  }
  return px;
}
