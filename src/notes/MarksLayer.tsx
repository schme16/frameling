// Marks drawn over the picture. They are SVG on top of the canvas, in the canvas's turn box so they follow the view, and
// they are never painted by the renderer that makes exports: that is the whole point of drawing them here.
import { useEffect, useRef, type KeyboardEvent, type ReactElement } from 'react';
import type { CanvasMark } from '../core/format';
import { useStore } from '../core/store';
import { useViewSettings } from '../canvas/viewSettings';
import { lookingThrough } from '../camera/ops';
import { DEFAULT_COLOR, DEFAULT_W, arrowHead, haloFor, headLength, smoothPath, textSize, visibleMarks } from './marks';
import { cancelText, finishText, typeText } from './marksOps';
import { useMarksState } from './marksState';
import './marks.css';

interface View {
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

/** The words box: you type right where the words will sit. Enter keeps them, Shift+Enter starts a new line, Esc drops them. */
function Typing({ m, v }: { m: CanvasMark; v: View }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const born = useRef(Date.now());
  useEffect(() => {
    // The press that made this box is still finishing; take focus just after it so the canvas doesn't pull it back.
    const t = window.setTimeout(() => box.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [m.id]);
  const size = textSize(m) * v.zoom;
  const lines = (m.text ?? '').split('\n');
  const key = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelText();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finishText();
    }
  };
  return (
    <textarea
      ref={box}
      className="mk-typing"
      data-canvas-hold=""
      aria-label="Words for the mark"
      placeholder="Type, then Enter"
      rows={lines.length}
      value={m.text ?? ''}
      spellCheck={false}
      style={{ left: sx(v, m.pts[0]), top: sy(v, m.pts[1]), fontSize: Math.max(11, size), color: m.color ?? DEFAULT_COLOR, width: `${Math.max(14, ...lines.map((l) => l.length + 2))}ch` }}
      onChange={(e) => typeText(e.target.value)}
      onKeyDown={key}
      onKeyUp={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      // Clicking away keeps the words, but not in the first moments, while the press that made the box is still going.
      onBlur={() => (Date.now() - born.current > 200 ? finishText() : box.current?.focus())}
    />
  );
}

export function MarksLayer() {
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const zoom = useStore((s) => s.ui.zoom);
  const panX = useStore((s) => s.ui.panX);
  const panY = useStore((s) => s.ui.panY);
  const playing = useStore((s) => s.ui.playing);
  useViewSettings((v) => v);
  const { show, draft, pending, typing } = useMarksState();
  const v: View = { zoom, panX, panY };
  // What you see is the picture: no marks while it plays or while you look through the camera, where an export would be.
  const quiet = playing || lookingThrough();
  const kept = show && !quiet ? visibleMarks(doc, frame) : [];
  const own = draft || pending.length || typing;
  if (!kept.length && !own) return null;
  const extra = quiet ? [] : [...pending, ...(draft ? [draft] : [])];
  return (
    <div className="mk-layer" aria-label="Marks drawn over the picture" data-testid="marks.layer">
      <svg className="mk-svg" aria-hidden="true">
        {kept.map((m) => (
          <MarkShape key={m.id} m={m} v={v} />
        ))}
        {extra.map((m) => (
          <MarkShape key={m.id} m={m} v={v} />
        ))}
        {typing && typing.text ? <MarkShape m={typing} v={v} /> : null}
      </svg>
      {typing && !quiet ? <Typing key={typing.id} m={typing} v={v} /> : null}
    </div>
  );
}
