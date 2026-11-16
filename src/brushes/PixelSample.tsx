// The sample pictures for pixel brushes in the picker: a long stroke and a single dab, drawn by the real dab engine at the
// brush's own pixel size, so a pixel brush looks like pixels and a scatter brush shows its scatter (see src/dab/sample.ts).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderSample, type SampleKind } from '../dab/sample';
import type { PixelSpec } from '../dab/spec';
import { inkFor, parseCssColour, useThemeTick } from './ink';
import { useSeen } from './Stroke';

/** Draws one sample into the canvas, at one canvas pixel to one art pixel. */
function paint(c: HTMLCanvasElement, spec: PixelSpec, kind: SampleKind, w: number, h: number): void {
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g || w < 1 || h < 1) return;
  const ink = parseCssColour(inkFor(c)) ?? [0, 0, 0, 1];
  const px = renderSample(spec, kind, w, h, [Math.round(ink[0]), Math.round(ink[1]), Math.round(ink[2])]);
  const img = g.createImageData(w, h);
  img.data.set(px);
  g.putImageData(img, 0, 0);
}

/** A sample stroke drawn with a pixel brush's own settings, filling the width of its row. */
export function PixelStroke({ spec, h, on }: { spec: PixelSpec; h: number; on?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const seen = useSeen(ref);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || !seen) return;
    setW(Math.round(c.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => setW(Math.round(c.clientWidth)));
    watch.observe(c);
    return () => watch.disconnect();
  }, [seen]);
  const theme = useThemeTick();
  useEffect(() => {
    const c = ref.current;
    if (c && w) paint(c, spec, 'stroke', w, h);
  }, [spec, w, h, theme, on]);
  return <canvas ref={ref} className="pk-stroke pk-pixel" style={{ height: h }} aria-hidden="true" />;
}

/** The brush's real tip as one dab in a small fixed box. */
export function PixelTip({ spec, w, h, on }: { spec: PixelSpec; w: number; h: number; on?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const seen = useSeen(ref);
  const theme = useThemeTick();
  useEffect(() => {
    const c = ref.current;
    if (c && seen) paint(c, spec, 'dab', w, h);
  }, [spec, w, h, seen, theme, on]);
  return <canvas ref={ref} className="pk-thumb pk-pixel" width={w} height={h} style={{ width: w, height: h }} aria-hidden="true" />;
}
