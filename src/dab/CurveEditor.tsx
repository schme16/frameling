// The little graph that shapes how a pen input turns into an effect: drag the dots, click the line to add one, double-click
// a dot to take it away. Ready-made feels sit above it in plain words. The maths is in curve.ts.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ActionButton } from '../canvas/controls';
import { addPoint, curveAt, feelOf, FEELS, movePoint, removePoint, STRAIGHT, type Curve } from './curve';

const SIZE = 148;
const PAD = 10;
const SPAN = SIZE - PAD * 2;
const px = (x: number): number => PAD + x * SPAN;
const py = (y: number): number => PAD + (1 - y) * SPAN;

/** The path of the curve, one short step at a time (the same smooth line the brush uses). */
function pathOf(c: Curve): string {
  const steps = 48;
  let d = '';
  for (let i = 0; i <= steps; i++) d += `${i === 0 ? 'M' : 'L'}${px(i / steps).toFixed(1)} ${py(curveAt(c, i / steps)).toFixed(1)}`;
  return d;
}

export function CurveEditor({ curve, onChange, inLabel, outLabel }: { curve: Curve | undefined; onChange: (c: Curve | null) => void; inLabel: string; outLabel: string }) {
  const c = curve ?? STRAIGHT;
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const feel = feelOf(c);

  // Keeps the drag when the pointer leaves the graph (a pointer the page cannot capture just drags without it).
  const capture = (e: PointerEvent): void => {
    try {
      svg.current?.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable: the drag still works while the pointer is over the graph */
    }
  };
  const at = (e: PointerEvent): { x: number; y: number } => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  };
  const toCurve = (p: { x: number; y: number }) => ({ x: (p.x - PAD) / SPAN, y: 1 - (p.y - PAD) / SPAN });
  const emit = (next: Curve): void => onChange(feelOf(next)?.id === 'straight' ? null : next);

  const down = (e: PointerEvent<SVGSVGElement>): void => {
    if ((e.target as Element).getAttribute('data-point') !== null) return;
    const p = toCurve(at(e));
    const added = addPoint(c, p.x);
    if (!added) return;
    e.preventDefault();
    capture(e);
    setDrag(added.index);
    emit(movePoint(added.curve, added.index, p.x, p.y));
  };
  const downPoint = (i: number) => (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    capture(e);
    setDrag(i);
  };
  const move = (e: PointerEvent): void => {
    if (drag === null) return;
    const p = toCurve(at(e));
    emit(movePoint(c, drag, p.x, p.y));
  };
  const up = (): void => setDrag(null);
  const key = (i: number) => (e: KeyboardEvent): void => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const [x, y] = c[i];
    if (e.key === 'ArrowUp') emit(movePoint(c, i, x, y + step));
    else if (e.key === 'ArrowDown') emit(movePoint(c, i, x, y - step));
    else if (e.key === 'ArrowLeft') emit(movePoint(c, i, x - step, y));
    else if (e.key === 'ArrowRight') emit(movePoint(c, i, x + step, y));
    else if (e.key === 'Delete' || e.key === 'Backspace') emit(removePoint(c, i));
    else return;
    e.preventDefault();
  };

  return (
    <div className="dab-curve" data-testid="dab-curve">
      <div className="dab-curve-feels" role="group" aria-label="Ready-made feels">
        {FEELS.map((f) => (
          <ActionButton key={f.id} pressed={feel?.id === f.id} title={f.hint} onClick={() => onChange(f.id === 'straight' ? null : f.curve)}>
            {f.label}
          </ActionButton>
        ))}
      </div>
      <svg
        ref={svg}
        className="dab-curve-graph"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        role="group"
        aria-label={`Response curve: ${inLabel} in, ${outLabel} out. Drag a dot, click the line to add one, double-click a dot to remove it.`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <rect className="dab-curve-box" x={PAD} y={PAD} width={SPAN} height={SPAN} />
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g} className="dab-curve-grid">
            <line x1={px(g)} y1={PAD} x2={px(g)} y2={PAD + SPAN} />
            <line x1={PAD} y1={py(g)} x2={PAD + SPAN} y2={py(g)} />
          </g>
        ))}
        <line className="dab-curve-diag" x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} />
        <path className="dab-curve-line" d={pathOf(c)} />
        {c.map((q, i) => (
          <circle
            key={i}
            data-point={i}
            className={drag === i ? 'dab-curve-dot is-drag' : 'dab-curve-dot'}
            cx={px(q[0])}
            cy={py(q[1])}
            r={5.5}
            tabIndex={0}
            role="slider"
            aria-label={`Curve point ${i + 1} of ${c.length}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(q[1] * 100)}
            aria-valuetext={`in ${Math.round(q[0] * 100)}%, out ${Math.round(q[1] * 100)}%`}
            onPointerDown={downPoint(i)}
            onKeyDown={key(i)}
            onDoubleClick={() => emit(removePoint(c, i))}
          />
        ))}
      </svg>
      <div className="cv-field-hint">{feel ? feel.hint : `Your own shape. ${inLabel} runs left to right; ${outLabel} goes up.`}</div>
    </div>
  );
}
