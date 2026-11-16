// Moving, sizing and turning a reference picture right on the canvas: drag the picture to move it, a corner to size it,
// the knob above it to turn it. A small bar says what it is doing and has the exact numbers, Fit and Done.
// It sits in the canvas's turn box, so it follows the view's turn and flip like the drawing does.
import { useEffect, useRef, useState } from 'react';
import { findLayer } from '../core/doc';
import type { LayerPicture, ReferencePicture } from '../core/format';
import { useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { getTurn, unturnVector } from '../canvas/turn';
import { setLayerLocked, setLayerOpacity } from '../timeline/ops';
import { cornersOf, MAX_SCALE, MIN_SCALE, pictureAt, scaleByDrag, turnByDrag, type Pt } from './model';
import { fitPicture, resetPicture, setPlacement } from './ops';
import { setPlacing, usePlacing } from './state';
import './reference.css';

/** How far the turn knob sits beyond the top edge, in screen pixels. */
const KNOB = 30;

type Drag = { kind: 'move' | 'scale' | 'turn'; id: string; x0: number; y0: number; start: LayerPicture; grab: Pt; zoom: number };

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;

function NumberField({ label, value, unit, min, max, step = 1, onCommit, disabled }: { label: string; value: number; unit?: string; min?: number; max?: number; step?: number; onCommit: (n: number) => void; disabled?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className="rf-field">
      <span>{label}</span>
      <input
        type="number"
        value={text ?? String(value)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n)) onCommit(n);
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          e.stopPropagation();
        }}
      />
      {unit && <small>{unit}</small>}
    </label>
  );
}

/** The picture's box and handles, inside the canvas's turn box. */
export function ReferenceHandles() {
  const id = usePlacing();
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const zoom = useStore((s) => s.ui.zoom);
  const panX = useStore((s) => s.ui.panX);
  const panY = useStore((s) => s.ui.panY);
  const view = { zoom, panX, panY };
  const drag = useRef<Drag | null>(null);
  const layer = id ? findLayer(doc, id) : undefined;
  const lp = layer?.picture;
  const pic: ReferencePicture | undefined = layer ? pictureAt(doc, layer, frame) : undefined;

  // The layer went away (undo, a new file): nothing to place.
  useEffect(() => {
    if (id && !layer?.picture) setPlacing(null);
  }, [id, layer]);

  useEffect(() => {
    if (!id) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) setPlacing(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [id]);

  if (!id || !layer || !lp) return null;
  const locked = layer.locked;
  const to = (p: Pt): Pt => ({ x: p.x * view.zoom + view.panX, y: p.y * view.zoom + view.panY });

  const begin = (kind: Drag['kind'], grab: Pt) => (e: React.PointerEvent) => {
    if (e.button !== 0 || locked) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, id, x0: e.clientX, y0: e.clientY, start: lp, grab, zoom: view.zoom };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const v = unturnVector(getTurn(), e.clientX - d.x0, e.clientY - d.y0);
    const dx = v.x / d.zoom;
    const dy = v.y / d.zoom;
    const key = `reference-drag:${d.id}`;
    if (d.kind === 'move') setPlacement(d.id, { x: d.start.x + dx, y: d.start.y + dy }, key);
    else if (d.kind === 'scale') setPlacement(d.id, { scale: scaleByDrag(d.start, d.grab, { x: d.grab.x + dx, y: d.grab.y + dy }) }, key);
    else setPlacement(d.id, { turn: turnByDrag(d.start, d.grab, { x: d.grab.x + dx, y: d.grab.y + dy }, e.shiftKey) }, key);
  };
  const end = () => void (drag.current = null);
  let box: React.ReactNode = null;
  if (pic) {
    const w = pic.width * lp.scale * view.zoom;
    const h = pic.height * lp.scale * view.zoom;
    const c = to(lp);
    const corners = cornersOf(lp, pic);
    const a = ((lp.turn ?? 0) * Math.PI) / 180;
    const up = { x: Math.sin(a), y: -Math.cos(a) };
    const knobGrab: Pt = { x: lp.x + up.x * (h / 2 + KNOB) / view.zoom, y: lp.y + up.y * (h / 2 + KNOB) / view.zoom };
    box = (
      <div className={`rf-box${locked ? ' is-locked' : ''}`} style={{ left: c.x, top: c.y, width: w, height: h, transform: `translate(-50%, -50%) rotate(${lp.turn ?? 0}deg)` }} data-testid="reference.box">
        <div className="rf-body" onPointerDown={begin('move', lp)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
        {!locked && (
          <>
            {(['tl', 'tr', 'br', 'bl'] as const).map((k, i) => (
              <div key={k} className={`rf-corner rf-${k}`} onPointerDown={begin('scale', corners[i])} onPointerMove={move} onPointerUp={end} onPointerCancel={end} data-testid={`reference.corner.${k}`} />
            ))}
            <div className="rf-stalk" style={{ height: KNOB }} />
            <div className="rf-knob" style={{ top: -KNOB - 7 }} onPointerDown={begin('turn', knobGrab)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} data-testid="reference.knob" title="Drag to turn. Hold Shift to snap." />
          </>
        )}
      </div>
    );
  }

  return (
      <div className="rf-veil" data-canvas-hold="" aria-hidden="true">
        {box}
      </div>
  );
}

/** The bar with the exact numbers, over the canvas. */
/** Where the bar was left last time it was moved, so it stays out of the way from one picture to the next. */
let chipOffset = { x: 0, y: 0 };

export function ReferenceBar() {
  const id = usePlacing();
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const layer = id ? findLayer(doc, id) : undefined;
  const lp = layer?.picture;
  const pic: ReferencePicture | undefined = layer ? pictureAt(doc, layer, frame) : undefined;
  const [off, setOff] = useState(chipOffset);
  const moving = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);
  if (!id || !layer || !lp) return null;
  const locked = layer.locked;
  // The bar can be dragged out of the way by its top row (not by the buttons in it).
  const grab = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    moving.current = { x: e.clientX, y: e.clientY, from: off };
  };
  const slide = (e: React.PointerEvent) => {
    const m = moving.current;
    if (m) setOff({ x: m.from.x + e.clientX - m.x, y: m.from.y + e.clientY - m.y });
  };
  const drop = () => {
    if (moving.current) chipOffset = off;
    moving.current = null;
  };
  return (
      <div className="rf-chip" style={off.x || off.y ? { transform: `translate(${off.x}px, ${off.y}px)` } : undefined} role="group" aria-label="Move and size the reference picture" data-testid="reference.chip" data-canvas-hold="">
        <div className="rf-head" onPointerDown={grab} onPointerMove={slide} onPointerUp={drop} onPointerCancel={drop} title="Drag here to move this bar out of the way">
          <Icon name="image" size={15} />
          <b>{layer.name}</b>
          <small>{!pic ? 'No picture on this frame.' : locked ? 'Locked. Unlock it to move it.' : 'Drag it to move, a corner to size, the knob to turn.'}</small>
          <div className="rf-actions">
            <button type="button" className="rf-btn" onClick={() => fitPicture(layer.id, 'fit')} disabled={locked || !pic} data-tip="Fit to the page" data-tip-desc="As big as it can be without cutting any off, in the middle.">
              Fit
            </button>
            <button type="button" className="rf-btn" onClick={() => fitPicture(layer.id, 'fill')} disabled={locked || !pic} data-tip="Fill the page" data-tip-desc="Covers the whole page, cutting off what is left over.">
              Fill
            </button>
            <button type="button" className="rf-btn" onClick={() => resetPicture(layer.id)} disabled={locked || !pic} data-tip="Its own size" data-tip-desc="One picture pixel for each page pixel, in the middle, not turned.">
              Own size
            </button>
            <button type="button" className="rf-btn" aria-pressed={locked} onClick={() => void setLayerLocked(layer.id, !locked)} data-tip={locked ? 'Unlock it' : 'Lock it where it is'} data-tip-desc="A locked picture can't be moved by accident.">
              <Icon name={locked ? 'lock' : 'unlock'} size={14} /> {locked ? 'Locked' : 'Lock'}
            </button>
            <button type="button" className="rf-btn rf-done" onClick={() => setPlacing(null)} data-testid="reference.done" data-autofocus>
              Done
            </button>
          </div>
        </div>
        <div className="rf-row">
          <NumberField label="Across" value={round(lp.x)} step={1} onCommit={(n) => setPlacement(layer.id, { x: n }, `reference-field:${layer.id}:x`)} disabled={locked} />
          <NumberField label="Down" value={round(lp.y)} step={1} onCommit={(n) => setPlacement(layer.id, { y: n }, `reference-field:${layer.id}:y`)} disabled={locked} />
          <NumberField label="Size" value={round(lp.scale * 100)} unit="%" min={MIN_SCALE * 100} max={MAX_SCALE * 100} step={5} onCommit={(n) => setPlacement(layer.id, { scale: n / 100 }, `reference-field:${layer.id}:s`)} disabled={locked} />
          <NumberField label="Turn" value={round(lp.turn ?? 0)} unit="deg" min={-180} max={180} step={5} onCommit={(n) => setPlacement(layer.id, { turn: n }, `reference-field:${layer.id}:t`)} disabled={locked} />
          <NumberField label="Fade" value={Math.round(layer.opacity * 100)} unit="%" min={0} max={100} step={5} onCommit={(n) => void setLayerOpacity(layer.id, Math.min(1, Math.max(0, n / 100)))} />
        </div>
      </div>
  );
}
