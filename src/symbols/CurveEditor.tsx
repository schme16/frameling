// The easing as an editable graph (ported from Interactives' CurveEditor): time runs left to right, the move bottom
// (start) to top (end). Dashed lines mark the start and end; the range grows to show overshoot. Dragging a handle
// makes it a custom curve.
import type { PointerEvent as RPointerEvent } from 'react';
import type { Easing } from '../core/format';
import { bezierFor, ease } from '../core/ease';

export function CurveEditor({ value, onChange, onDone }: { value: Easing; onChange: (e: Easing) => void; onDone?: () => void }) {
  const W = 220;
  const H = 128;
  const pad = 12;
  const handles = bezierFor(value);
  const samples: number[] = [];
  for (let i = 0; i <= 60; i++) samples.push(ease(value, i / 60));
  const lo = Math.min(0, ...samples, handles[1], handles[3]) - 0.08;
  const hi = Math.max(1, ...samples, handles[1], handles[3]) + 0.08;
  const sx = (t: number) => pad + t * (W - pad * 2);
  const sy = (v: number) => pad + ((hi - v) / (hi - lo)) * (H - pad * 2);
  const fromScreen = (px: number, py: number) => ({ t: Math.max(0, Math.min(1, (px - pad) / (W - pad * 2))), v: hi - ((py - pad) / (H - pad * 2)) * (hi - lo) });
  const pts = samples.map((v, i) => `${sx(i / 60).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');

  const drag = (which: 0 | 1) => (ev: RPointerEvent<SVGCircleElement>) => {
    ev.preventDefault();
    const svg = ev.currentTarget.ownerSVGElement!;
    const box = svg.getBoundingClientRect();
    const start = [...handles] as [number, number, number, number];
    const move = (m: PointerEvent) => {
      const p = fromScreen(((m.clientX - box.left) / box.width) * W, ((m.clientY - box.top) / box.height) * H);
      const next = [...start] as [number, number, number, number];
      const v = Math.round(Math.max(-2, Math.min(3, p.v)) * 100) / 100;
      const t = Math.round(p.t * 100) / 100;
      if (which === 0) [next[0], next[1]] = [t, v];
      else [next[2], next[3]] = [t, v];
      onChange(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onDone?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Arrow keys nudge the focused handle, so the curve works without a mouse too.
  const keys = (which: 0 | 1) => (e: React.KeyboardEvent<SVGCircleElement>) => {
    const d = e.shiftKey ? 0.1 : 0.02;
    const next = [...handles] as [number, number, number, number];
    const i = which === 0 ? 0 : 2;
    if (e.key === 'ArrowLeft') next[i] = Math.max(0, next[i] - d);
    else if (e.key === 'ArrowRight') next[i] = Math.min(1, next[i] + d);
    else if (e.key === 'ArrowUp') next[i + 1] = Math.min(3, next[i + 1] + d);
    else if (e.key === 'ArrowDown') next[i + 1] = Math.max(-2, next[i + 1] - d);
    else return;
    e.preventDefault();
    e.stopPropagation();
    onChange(next.map((n) => Math.round(n * 100) / 100) as [number, number, number, number]);
  };

  return (
    <svg className="sy-curve" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="group" aria-label="Easing curve">
      <line className="sy-curve-guide" x1={sx(0)} x2={sx(1)} y1={sy(0)} y2={sy(0)} />
      <line className="sy-curve-guide" x1={sx(0)} x2={sx(1)} y1={sy(1)} y2={sy(1)} />
      <text className="sy-curve-label" x={sx(1) - 2} y={sy(1) - 4} textAnchor="end">
        end
      </text>
      <text className="sy-curve-label" x={sx(0) + 2} y={sy(0) + 11}>
        start
      </text>
      <polyline className="sy-curve-line" points={pts} />
      <line className="sy-curve-arm" x1={sx(0)} y1={sy(0)} x2={sx(handles[0])} y2={sy(handles[1])} />
      <line className="sy-curve-arm" x1={sx(1)} y1={sy(1)} x2={sx(handles[2])} y2={sy(handles[3])} />
      <circle className="sy-curve-handle" cx={sx(handles[0])} cy={sy(handles[1])} r={6} tabIndex={0} aria-label="Start of the curve" onPointerDown={drag(0)} onKeyDown={keys(0)}>
        <title>Drag to shape how it starts</title>
      </circle>
      <circle className="sy-curve-handle" cx={sx(handles[2])} cy={sy(handles[3])} r={6} tabIndex={0} aria-label="End of the curve" onPointerDown={drag(1)} onKeyDown={keys(1)}>
        <title>Drag to shape how it stops</title>
      </circle>
    </svg>
  );
}
