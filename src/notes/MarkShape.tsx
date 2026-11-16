// One mark drawn as SVG, in screen pixels. Apart from the layer that holds them so the second window can draw marks without
// pulling in the editing code.
import type { ReactElement } from 'react';
import type { CanvasMark } from '../core/format';
import { DEFAULT_COLOR, DEFAULT_W, arrowHead, haloFor, headLength, smoothPath, textSize } from './marks';

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

const sx = (v: View, x: number) => x * v.zoom + v.panX;
const sy = (v: View, y: number) => y * v.zoom + v.panY;

/** One mark, drawn in screen pixels, with a thin halo behind it so it reads on any picture. */
export function MarkShape({ m, v, ghost }: { m: CanvasMark; v: View; ghost?: boolean }) {
  const color = m.color ?? DEFAULT_COLOR;
  const w = m.w ?? DEFAULT_W;
  const halo = haloFor(color);
  const p = m.pts;
  const common = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const both = (draw: (stroke: string, width: number) => ReactElement) => (
    <g className={ghost ? 'mk-ghost' : undefined} data-mark-id={m.id} data-kind={m.kind}>
      {draw(halo, w + 3)}
      {draw(color, w)}
    </g>
  );
  if (m.kind === 'circle') {
    const cx = sx(v, (p[0] + p[2]) / 2);
    const cy = sy(v, (p[1] + p[3]) / 2);
    const rx = Math.max(0.5, (Math.abs(p[2] - p[0]) * v.zoom) / 2);
    const ry = Math.max(0.5, (Math.abs(p[3] - p[1]) * v.zoom) / 2);
    return both((stroke, width) => <ellipse cx={cx} cy={cy} rx={rx} ry={ry} stroke={stroke} strokeWidth={width} {...common} />);
  }
  if (m.kind === 'arrow') {
    const [x1, y1, x2, y2] = [sx(v, p[0]), sy(v, p[1]), sx(v, p[2]), sy(v, p[3])];
    const head = arrowHead(x1, y1, x2, y2, headLength(w));
    const d = `M${x1} ${y1}L${x2} ${y2}` + (head ? `M${head[0]} ${head[1]}L${x2} ${y2}L${head[2]} ${head[3]}` : '');
    return both((stroke, width) => <path d={d} stroke={stroke} strokeWidth={width} {...common} />);
  }
  if (m.kind === 'scribble') {
    const screen = p.map((n, i) => (i % 2 ? sy(v, n) : sx(v, n)));
    const d = smoothPath(screen);
    return both((stroke, width) => <path d={d} stroke={stroke} strokeWidth={width} {...common} />);
  }
  const size = textSize(m) * v.zoom;
  const lines = (m.text ?? '').split('\n');
  return (
    <g className={ghost ? 'mk-ghost' : undefined} data-mark-id={m.id} data-kind="text">
      <text x={sx(v, p[0])} y={sy(v, p[1])} fontSize={size} fill={color} stroke={halo} strokeWidth={Math.max(2, size / 8)} paintOrder="stroke" strokeLinejoin="round" dominantBaseline="hanging" className="mk-text">
        {lines.map((l, i) => (
          <tspan key={i} x={sx(v, p[0])} dy={i === 0 ? 0 : size * 1.25}>
            {l || ' '}
          </tspan>
        ))}
      </text>
    </g>
  );
}
