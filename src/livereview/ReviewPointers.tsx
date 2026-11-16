// Pointers over the picture while a live review is on: each reviewer's, in their colour (with their name unless it is covered),
// and your own going the other way so they can see what you are pointing at. Positions travel in stage pixels, so a pointer
// lands on the same spot whatever each person's zoom or window size. Inside the canvas's turn box, like marks: they follow the view.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useStore } from '../core/store';
import { getTurn, windowToBox } from '../canvas/turn';
import { colourOfSeat, PointerSender } from '../review/pointer';
import { COVERED_POINTER } from './cover';
import { pointers, review, useCovered } from './state';
import './review.css';

export function ReviewPointers() {
  const live = review.use((s) => s.phase === 'live' && s.seats.some((x) => x.linked));
  const names = review.use((s) => s.seats);
  review.use((s) => s.tick);
  const zoom = useStore((s) => s.ui.zoom);
  const panX = useStore((s) => s.ui.panX);
  const panY = useStore((s) => s.ui.panY);
  const layer = useRef<HTMLDivElement>(null);
  // A slow tick while a dot is showing, so it fades out by itself.
  const now = useSyncExternalStore(
    (fn) => {
      const t = setInterval(fn, 120);
      return () => clearInterval(t);
    },
    () => Math.floor(performance.now() / 120),
  );
  void now;

  // Your pointer goes to them: only while somebody is here, and only over the picture.
  useEffect(() => {
    if (!live) return;
    const bridge = window.frameling?.review;
    const el = layer.current;
    const root = el?.closest('.cv-root') as HTMLElement | null;
    if (!bridge || !root) return;
    const sender = new PointerSender();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inside = false;
    const send = (m: { x: number; y: number; off?: true } | null) => {
      if (m) void bridge.pointer(m.x, m.y, m.off === true);
    };
    const toStage = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      const b = windowToBox(getTurn(), r.width, r.height, e.clientX - r.left, e.clientY - r.top);
      return { x: (b.x - panX) / zoom, y: (b.y - panY) / zoom };
    };
    const move = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!over) {
        if (inside) {
          inside = false;
          send(sender.move(performance.now(), 0, 0, true));
        }
        return;
      }
      inside = true;
      const st = toStage(e);
      const m = sender.move(performance.now(), Math.round(st.x * 10) / 10, Math.round(st.y * 10) / 10);
      if (m) send(m);
      else if (!timer) {
        const wait = sender.waitMs(performance.now());
        if (wait !== null) {
          timer = setTimeout(() => {
            timer = null;
            send(sender.due(performance.now()));
          }, wait + 1);
        }
      }
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      if (timer) clearTimeout(timer);
    };
  }, [live, zoom, panX, panY]);

  const hide = useCovered();
  const dots = pointers.visible(performance.now());
  if (!live && !dots.length) return null;
  return (
    <div className="rv-layer" ref={layer} aria-hidden="true" data-testid="review.pointers">
      {dots.map(({ dot, alpha }) => (
        <div key={dot.seat} className="rv-pointer" data-seat={dot.seat} style={{ transform: `translate(${dot.x * zoom + panX}px, ${dot.y * zoom + panY}px)`, opacity: alpha }}>
          <i style={{ background: colourOfSeat(dot.seat) }} title={hide ? COVERED_POINTER : undefined} />
          {!hide && <span>{names.find((n) => n.seat === dot.seat)?.name ?? ''}</span>}
        </div>
      ))}
    </div>
  );
}
