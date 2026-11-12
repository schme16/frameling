// The pressure curve editor: a square graph of "how hard you press" (across) against "how hard Frameling treats it"
// (up), with two handles to bend the curve. Handles are real buttons so the keyboard can move them too.
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cleanCurve, curveAt, mapPressure, type Curve } from './curve';
import './tablet.css';

const SIZE = 200;
const PAD = 14;
const INNER = SIZE - PAD * 2;

const sx = (v: number) => PAD + v * INNER;
const sy = (v: number) => PAD + (1 - v) * INNER;

export interface CurveEditorProps {
  curve: Curve;
  min: number;
  max: number;
  onChange: (c: Curve) => void;
  /** The pressure the pen is reporting now (before the curve), drawn as a dot on the curve. */
  live?: number | null;
}

/** Where the curve's handles sit on the graph: the curve spans the range from the minimum to the maximum. */
export function handleSpots(curve: Curve, min: number, max: number): { x: number; y: number }[] {
  return [
    { x: min + curve.x1 * (max - min), y: curve.y1 },
    { x: min + curve.x2 * (max - min), y: curve.y2 },
  ];
}

/** The curve for a handle dragged to graph position (x, y). */
export function curveWithHandle(curve: Curve, which: 0 | 1, x: number, y: number, min: number, max: number): Curve {
  const nx = (x - min) / Math.max(0.01, max - min);
  return cleanCurve(which === 0 ? { ...curve, x1: nx, y1: y } : { ...curve, x2: nx, y2: y });
}

export function CurveEditor({ curve, min, max, onChange, live }: CurveEditorProps) {
  const box = useRef<HTMLDivElement>(null);
  const shape = { curve, min, max };
  const path = Array.from({ length: 65 }, (_, i) => {
    const raw = i / 64;
    return `${i ? 'L' : 'M'}${sx(raw).toFixed(1)} ${sy(mapPressure(raw, shape)).toFixed(1)}`;
  }).join('');
  const spots = handleSpots(curve, min, max);

  const drag = (which: 0 | 1, e: PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    const r = box.current!.getBoundingClientRect();
    const x = (e.clientX - r.left - (PAD / SIZE) * r.width) / ((INNER / SIZE) * r.width);
    const y = 1 - (e.clientY - r.top - (PAD / SIZE) * r.height) / ((INNER / SIZE) * r.height);
    onChange(curveWithHandle(curve, which, Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)), min, max));
  };
  const key = (which: 0 | 1, e: KeyboardEvent<HTMLButtonElement>) => {
    const d = e.shiftKey ? 0.1 : 0.02;
    const dx = e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0;
    const dy = e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const s = spots[which];
    onChange(curveWithHandle(curve, which, s.x + dx * (max - min), s.y + dy, min, max));
  };
  const livePt = typeof live === 'number' ? { x: sx(live), y: sy(mapPressure(live, shape)) } : null;

  return (
    <div className="tb-curve" ref={box} style={{ width: SIZE, height: SIZE }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="Pressure curve. Across is how hard you press, up is how hard Frameling treats it.">
        <rect x={PAD} y={PAD} width={INNER} height={INNER} className="tb-curve-box" />
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g} className="tb-curve-grid">
            <line x1={sx(g)} y1={PAD} x2={sx(g)} y2={PAD + INNER} />
            <line x1={PAD} y1={sy(g)} x2={PAD + INNER} y2={sy(g)} />
          </g>
        ))}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} className="tb-curve-straight" />
        {spots.map((s, i) => (
          <line key={i} x1={i ? sx(max) : sx(min)} y1={i ? sy(1) : sy(0)} x2={sx(s.x)} y2={sy(s.y)} className="tb-curve-arm" />
        ))}
        <path d={path} className="tb-curve-line" fill="none" />
        {livePt && <circle cx={livePt.x} cy={livePt.y} r={5} className="tb-curve-live" />}
      </svg>
      {spots.map((s, i) => (
        <button
          key={i}
          type="button"
          className="tb-curve-handle"
          style={{ left: `${(sx(s.x) / SIZE) * 100}%`, top: `${(sy(s.y) / SIZE) * 100}%` }}
          aria-label={`Curve handle ${i + 1}. Arrow keys bend the curve.`}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => drag(i as 0 | 1, e)}
          onKeyDown={(e) => key(i as 0 | 1, e)}
        />
      ))}
    </div>
  );
}

/** The curve's output at an input, for the readouts beside the graph. */
export const curveOutput = (c: Curve, t: number): number => curveAt(c, t);
