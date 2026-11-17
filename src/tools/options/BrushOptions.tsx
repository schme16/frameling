import { useEffect, useRef } from 'react';
import { PenOptions } from '../../tablet/PenOptions';
import { findLayer } from '../../core/doc';
import type { BrushSettings } from '../../core/format';
import { store, useStore } from '../../core/store';
import { Choice, MoreOptions, Slider, Tip, Toggle } from '../../canvas/controls';
import { drawPreviewStroke } from '../../brushes/thumbs';
import { inkFor, useThemeTick } from '../../brushes/ink';
import { DrawModeToggle } from './DrawModeToggle';
import { setToolSettings, useToolSettings } from '../settings';
import { MirrorOptions } from './MirrorOptions';
import { HoldToTidyOptions } from './HoldToTidyOptions';
import { BrushPresetActions } from '../../brushes/BrushPresetRow';
import { PreviewFlash } from '../../brushes/PartsOptions';
import { DRAW_ON_MS, drawnOn, PREVIEW_POINTS, useFlash } from '../../brushes/flash';
import { reducedMotion } from '../../ui/prefs';
import { useDry } from '../../dry/settings';
import { TipOptions } from '../../brushes/TipOptions';
import { PixelStampOptions } from '../../brushes/PixelStampOptions';
import { readPixelStamp } from '../../brushes/stamps';
import { typedSize } from '../brushRange';
import { useBrushRange } from './useBrushRange';

export function useActiveLayerKind(): 'vector' | 'pixel' {
  return useStore((s) => (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.kind === 'pixel' ? 'pixel' : 'vector');
}

/** A sample squiggle drawn with the brush as set, so you can see what you're choosing. */
export function BrushPreview({ brush, color }: { brush: BrushSettings; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useThemeTick();
  // A line that catches on paper is drawn on the sheet's paper, so the picture is drawn again when the paper changes.
  const paper = useDry((s) => s.paper);
  const drawOn = useFlash().n;
  const seen = useRef(drawOn);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 220;
    const h = c.clientHeight || 64;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const pts: { x: number; y: number; p: number }[] = [];
    const n = PREVIEW_POINTS;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // An S-shaped curve, with pressure swelling in the middle like a real pen stroke.
      pts.push({ x: 14 + t * (w - 28), y: h / 2 + Math.sin(t * Math.PI * 2) * (h * 0.28), p: 0.25 + 0.6 * Math.sin(t * Math.PI) });
    }
    // Keep the preview inside its box however big the brush gets.
    const size = Math.min(brush.size, h * 0.8);
    // Your drawing colour when it shows up against the panel, otherwise the theme's own ink (near black on near black is no preview).
    const ink = inkFor(c, color, 3);
    const paint = (count: number) => {
      g.clearRect(0, 0, w, h);
      drawPreviewStroke(g, count > n ? pts : pts.slice(0, count), { ...brush, size }, ink);
    };
    // A part of the brush just changed: the line is drawn on from its start, as a hand would, so the change is seen.
    const fresh = drawOn !== seen.current;
    seen.current = drawOn;
    if (!fresh || reducedMotion()) return paint(n + 1);
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const ms = performance.now() - t0;
      paint(drawnOn(ms, n + 1));
      if (ms < DRAW_ON_MS) raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  }, [brush, color, theme, paper, drawOn]);
  return <canvas className="cv-preview" data-control="preview" ref={ref} aria-label="Preview of the brush stroke" role="img" />;
}

export function BrushOptions() {
  const kind = useActiveLayerKind();
  return kind === 'pixel' ? <PixelBrushOptions /> : <VectorBrushOptions />;
}

function setBrush(patch: Partial<BrushSettings>): void {
  store().setUi((u) => ({ brush: { ...u.brush, ...patch } }));
}

function VectorBrushOptions() {
  const brush = useStore((s) => s.ui.brush);
  const color = useStore((s) => s.ui.color);
  const pressure = brush.thinning !== 0;
  const range = useBrushRange(false);
  return (
    <div className="cv-options">
      <PreviewFlash>
        <BrushPreview brush={brush} color={color} />
      </PreviewFlash>
      <TipOptions />
      <Slider control="size" label="Size" value={brush.size} min={range.min} max={range.max} typeMax={range.typedMax} curve format={(v) => `${v}px`} onChange={(v) => setBrush({ size: typedSize(v) })} />
      <BrushPresetActions revert={false} />
      <MoreOptions name="brush" command="draw.moreBrushOptions" label="More brush options" hint="Merge shapes together, smoothing, pressure, pointy ends, the stabilizer and mirror drawing.">
        <DrawModeToggle />
        <Slider control="smoothing" label="Smoothing" value={Math.round(brush.streamline * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => setBrush({ streamline: v / 100, smoothing: v / 100 })} hint="Higher evens out a shaky hand." />
        <Toggle control="size-follows" label="Pressure changes thickness" checked={pressure} onChange={(on) => setBrush({ thinning: on ? 0.6 : 0 })} hint={pressure ? 'With a pen, pressing harder draws thicker. With a mouse, faster draws thinner.' : undefined} />
        {pressure && <Slider control="size-follows-amount" label="How much" value={Math.round(brush.thinning * 100)} min={5} max={100} format={(v) => `${v}%`} onChange={(v) => setBrush({ thinning: v / 100 })} />}
        <Slider control="taper-start" label="Pointy start" value={brush.taperStart} min={0} max={120} format={(v) => (v ? `${v}px` : 'Off')} onChange={(v) => setBrush({ taperStart: v })} />
        <Slider control="taper-end" label="Pointy end" value={brush.taperEnd} min={0} max={120} format={(v) => (v ? `${v}px` : 'Off')} onChange={(v) => setBrush({ taperEnd: v })} />
        <HoldToTidyOptions />
        <PenOptions tool="brush" opacity />
        <MirrorOptions />
      </MoreOptions>
    </div>
  );
}

function PixelBrushOptions() {
  const size = useToolSettings((s) => s.pixelBrushSize);
  const shape = useToolSettings((s) => s.pixelBrushShape);
  const perfect = useToolSettings((s) => s.pixelPerfect);
  const stamp = readPixelStamp(useToolSettings((s) => s.pixelStamp));
  const range = useBrushRange(true);
  return (
    <div className="cv-options">
      {!stamp && <Slider control="size" label="Size" value={size} min={range.min} max={range.max} typeMax={range.typedMax} curve format={(v) => `${v} pixel${v === 1 ? '' : 's'}`} onChange={(v) => setToolSettings({ pixelBrushSize: typedSize(v, true) })} />}
      {!stamp && size > 2 && (
        <Choice
          control="plain-shape"
          label="Shape"
          value={shape}
          options={[
            { value: 'square', label: 'Square' },
            { value: 'round', label: 'Round' },
          ]}
          onChange={(v) => setToolSettings({ pixelBrushShape: v })}
        />
      )}
      {!stamp && <Toggle control="pixel-perfect" label="Pixel perfect" checked={perfect} onChange={(v) => setToolSettings({ pixelPerfect: v })} hint="Keeps hand-drawn lines one pixel thick by tidying the corners. Works with size 1." />}
      <PixelStampOptions />
      <Tip>Hold Shift and click to draw a straight line from where you last stopped.</Tip>
      <PenOptions tool="brush" size />
    </div>
  );
}

