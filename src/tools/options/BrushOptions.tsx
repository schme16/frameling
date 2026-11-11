import { useEffect, useRef } from 'react';
import { findLayer } from '../../core/doc';
import type { BrushSettings } from '../../core/format';
import { drawShape } from '../../core/render';
import { store, useStore } from '../../core/store';
import { Choice, Slider, Tip, Toggle } from '../../canvas/controls';
import { buildStroke } from '../vectorStroke';
import { DrawModeToggle } from './DrawModeToggle';
import { setToolSettings, useToolSettings } from '../settings';

export function useActiveLayerKind(): 'vector' | 'pixel' {
  return useStore((s) => (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.kind === 'pixel' ? 'pixel' : 'vector');
}

/** A sample squiggle drawn with the brush as set, so you can see what you're choosing. */
export function BrushPreview({ brush, color }: { brush: BrushSettings; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
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
    const pts = [];
    const n = 60;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // An S-shaped curve, with pressure swelling in the middle like a real pen stroke.
      pts.push({ x: 14 + t * (w - 28), y: h / 2 + Math.sin(t * Math.PI * 2) * (h * 0.28), p: 0.25 + 0.6 * Math.sin(t * Math.PI) });
    }
    // Keep the preview inside its box however big the brush gets.
    const size = Math.min(brush.size, h * 0.8);
    drawShape(g, buildStroke(pts, { ...brush, size }, color));
  }, [brush, color]);
  return <canvas className="cv-preview" ref={ref} aria-label="Preview of the brush stroke" role="img" />;
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
  return (
    <div className="cv-options">
      <DrawModeToggle />
      <BrushPreview brush={brush} color={color} />
      <Slider label="Size" value={brush.size} min={1} max={120} format={(v) => `${v}px`} onChange={(v) => setBrush({ size: v })} />
      <Slider label="Smoothing" value={Math.round(brush.streamline * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => setBrush({ streamline: v / 100, smoothing: v / 100 })} hint="Higher evens out a shaky hand." />
      <Toggle label="Pressure changes thickness" checked={pressure} onChange={(on) => setBrush({ thinning: on ? 0.6 : 0 })} hint={pressure ? 'With a pen, pressing harder draws thicker. With a mouse, faster draws thinner.' : undefined} />
      {pressure && <Slider label="How much" value={Math.round(brush.thinning * 100)} min={5} max={100} format={(v) => `${v}%`} onChange={(v) => setBrush({ thinning: v / 100 })} />}
      <Slider label="Pointy start" value={brush.taperStart} min={0} max={120} format={(v) => (v ? `${v}px` : 'Off')} onChange={(v) => setBrush({ taperStart: v })} />
      <Slider label="Pointy end" value={brush.taperEnd} min={0} max={120} format={(v) => (v ? `${v}px` : 'Off')} onChange={(v) => setBrush({ taperEnd: v })} />
    </div>
  );
}

function PixelBrushOptions() {
  const size = useToolSettings((s) => s.pixelBrushSize);
  const shape = useToolSettings((s) => s.pixelBrushShape);
  const perfect = useToolSettings((s) => s.pixelPerfect);
  return (
    <div className="cv-options">
      <Slider label="Size" value={size} min={1} max={24} format={(v) => `${v} pixel${v === 1 ? '' : 's'}`} onChange={(v) => setToolSettings({ pixelBrushSize: v })} />
      {size > 2 && (
        <Choice
          label="Shape"
          value={shape}
          options={[
            { value: 'square', label: 'Square' },
            { value: 'round', label: 'Round' },
          ]}
          onChange={(v) => setToolSettings({ pixelBrushShape: v })}
        />
      )}
      <Toggle label="Pixel perfect" checked={perfect} onChange={(v) => setToolSettings({ pixelPerfect: v })} hint="Keeps hand-drawn lines one pixel thick by tidying the corners. Works with size 1." />
      <Tip>Hold Shift and click to draw a straight line from where you last stopped.</Tip>
    </div>
  );
}

