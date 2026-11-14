// Options for the Gradient tool on a pixel layer: how it steps (dither), which colours it uses, linear or radial, and
// whether it covers empty pixels. A small strip shows what the current choices make from Paint to Back.
import { useEffect, useRef } from 'react';
import { setChoice, useChoice } from '../core/choices';
import { useStore } from '../core/store';
import { parseHex } from '../canvas/colors';
import { Choice, Field, Tip } from '../canvas/controls';
import { docPalette } from './palette';
import { GRADIENT_DITHERS, type GradientDither } from './dither';
import { gradientInk, GRADIENT_COLOURS, GRADIENT_SHAPES, type GradientColours, type GradientShape } from './gradient';
import { setPixelSettings, usePixelSettings } from './settings';
import type { GradientWhere } from './gradient-tool';
import './pixel.css';

const W = 48;
const H = 8;

function Strip() {
  const ref = useRef<HTMLCanvasElement>(null);
  const paint = useStore((s) => s.ui.color);
  const back = useStore((s) => s.ui.fillColor);
  const palette = useStore((s) => docPalette(s.doc).colors);
  const dither = usePixelSettings((s) => s.gradientDither);
  const colours = usePixelSettings((s) => s.gradientColours);
  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext('2d');
    const from = paint ? parseHex(paint) : null;
    const to = back ? parseHex(back) : null;
    if (!cv || !g) return;
    g.clearRect(0, 0, W, H);
    if (!from || !to) return;
    const ink = gradientInk({ shape: 'linear', line: { x0: 0, y0: 0, x1: W, y1: 0 }, from, to, colours, dither, palette, paintedOnly: false });
    const img = g.createImageData(W, H);
    const out = new Uint8Array(4);
    const none = new Uint8ClampedArray(4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!ink.color(x, y, none, 0, out)) continue;
        img.data.set(out, (y * W + x) * 4);
      }
    g.putImageData(img, 0, 0);
  }, [paint, back, palette, dither, colours]);
  return (
    <Field label="Preview">
      <canvas ref={ref} className="px-grad-strip" width={W} height={H} aria-label="What the gradient looks like from Paint to Back" />
    </Field>
  );
}

export function PixelGradientOptions() {
  const dither = usePixelSettings((s) => s.gradientDither);
  const colours = usePixelSettings((s) => s.gradientColours);
  const shape = usePixelSettings((s) => s.gradientShape);
  const where = useChoice<GradientWhere>('pixelGradient.where');
  return (
    <div className="cv-options">
      <Strip />
      <Choice<GradientColours> label="Colours" value={colours} options={GRADIENT_COLOURS.map((c) => ({ value: c.id, label: c.label, title: c.detail }))} onChange={(v) => setPixelSettings({ gradientColours: v })} />
      {colours !== 'blend' && <Choice<GradientDither> label="Dither" value={dither} options={GRADIENT_DITHERS.map((d) => ({ value: d.id, label: d.label, title: d.detail }))} onChange={(v) => setPixelSettings({ gradientDither: v })} />}
      <Choice<GradientShape> label="Shape" value={shape} options={GRADIENT_SHAPES.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => setPixelSettings({ gradientShape: v })} />
      <Choice<GradientWhere> label="Covers" value={where} options={[{ value: 'all', label: 'Everywhere', title: 'The whole selection, or the whole canvas when nothing is selected.' }, { value: 'painted', label: 'Painted pixels', title: 'Only pixels that already have paint. Empty ones stay empty.' }]} onChange={(v) => setChoice('pixelGradient.where', v)} />
      <Tip>Drag across the picture. The colours run from Paint to Back, stepping through your palette. Select first to keep it to one spot. Shift keeps 45 degree steps.</Tip>
    </div>
  );
}
