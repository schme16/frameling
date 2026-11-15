// What the reviewer's window adds to the picture window: a small toolbar (Look, Note, Words, Arrow, Circle, Sketch), their own
// zoom and frame, the pointer both ways, a bar that says how the link is doing, and the reviewer's own notes and marks.
//
// There is nothing here that edits a drawing. The window holds a copy it cannot change and a link that carries only the
// closed list in src/review/wire.ts: a pointer, a note, a mark, an answer, a tick. What the reviewer writes is shown here
// from their own list (it is not in the copy of the drawing) and handed over through the desktop side, which keeps it until
// the sharer says it has it.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import type { CanvasMark } from '../core/format';
import { MarkShape } from '../notes/MarkShape';
import { MARK_COLORS, capPoints, makeMark, simplify, visibleMarks, worthKeeping, type MarkKind } from '../notes/marks';
import { structureSig } from '../review/drift';
import { colourOfSeat, PointerSender } from '../review/pointer';
import { newItemId, type ReviewItem } from '../review/wire';
import type { Painted } from './painter';
import { isOver, linkWords, overWords, type ReviewBus } from './reviewBus';
import { SAVE_PICTURE_NOTE, pictureFrame, picturePng } from './picture';
import { NO_VIEW, pageOf, shownFrame, zoomedAbout } from './show';

type Tool = 'look' | 'note' | 'text' | MarkKind;
const TOOLS: { id: Tool; label: string; tip: string }[] = [
  { id: 'look', label: 'Look', tip: 'Move around and point. Drag to move the picture, scroll to zoom.' },
  { id: 'note', label: 'Note', tip: 'Click on the picture, then type a note for them.' },
  { id: 'text', label: 'Words', tip: 'Click and type words right on the picture.' },
  { id: 'arrow', label: 'Arrow', tip: 'Drag to point at something.' },
  { id: 'circle', label: 'Circle', tip: 'Drag to ring something.' },
  { id: 'scribble', label: 'Sketch', tip: 'Draw freehand over the picture.' },
];

interface MyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  frame: number | null;
}

interface Typing {
  kind: 'note' | 'text';
  x: number;
  y: number;
  text: string;
}

const PEN = MARK_COLORS[0].value;

export function ReviewLayer({ bus, shown, rootRef }: { bus: ReviewBus; shown: Painted | null; rootRef: React.RefObject<HTMLDivElement | null> }) {
  const s = useSyncExternalStore(bus.subscribe, bus.snapshot);
  const [tool, setTool] = useState<Tool>('look');
  const [notes, setNotes] = useState<MyNote[]>([]);
  const [marks, setMarks] = useState<CanvasMark[]>([]);
  const [draft, setDraft] = useState<CanvasMark | null>(null);
  const [typing, setTypingState] = useState<Typing | null>(null);
  // The words being typed, read by a ref too: pressing Enter and the box then losing focus must not send them twice.
  const typingRef = useRef<Typing | null>(null);
  const setTyping = (t: Typing | null) => {
    typingRef.current = t;
    setTypingState(t);
  };
  const [color, setColor] = useState(PEN);
  const [local, setLocal] = useState(0);
  const [free, setFree] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pictureFailed, setPictureFailed] = useState(false);
  const sender = useMemo(() => new PointerSender(), []);
  const drag = useRef<{ kind: 'pan' | 'draw'; x: number; y: number; pts: number[]; id: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replica = bus.replica;
  const doc = replica?.doc ?? null;
  const frame = shown?.frame ?? 0;
  const length = doc ? pageOf(doc).length : 1;
  const animated = length > 1;
  const view = shown ? { zoom: shown.zoom, panX: shown.box.x, panY: shown.box.y } : null;

  // The sharer's pointer fades out by itself.
  const now = useSyncExternalStore(
    (fn) => {
      const t = setInterval(fn, 120);
      return () => clearInterval(t);
    },
    () => Math.floor(performance.now() / 120),
  );
  void now;

  // Holding the picture still while words are being written, so what is annotated is what was being looked at.
  const hold = (on: boolean) => {
    if (!replica || replica.held === on) return;
    replica.held = on;
    if (!on) {
      replica.touch();
      bus.repaint();
    }
  };
  useEffect(() => {
    hold(!!typing || !!draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing, draft]);

  // Their own frame: scrubbing or playing leaves the sharer's frame (it says so), and one button comes back.
  const setFrame = (f: number | null) => {
    if (!replica) return;
    replica.freeFrame = f === null ? null : Math.max(0, Math.min(length - 1, f));
    setFree(replica.freeFrame);
    replica.touch();
    bus.repaint();
  };
  useEffect(() => {
    if (!playing || !doc) return;
    const fps = Math.max(1, Math.min(60, doc.fps));
    const t = setInterval(() => setFrame(((replica?.freeFrame ?? frame) + 1) % length), 1000 / fps);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, doc?.fps, length]);

  const fit = () => {
    if (!replica) return;
    replica.userView = NO_VIEW;
    replica.touch();
    bus.repaint();
    setLocal((n) => n + 1);
  };

  const toStage = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r || !shown) return null;
    return { x: (e.clientX - r.left - shown.box.x) / shown.zoom, y: (e.clientY - r.top - shown.box.y) / shown.zoom };
  };

  const sendPointer = (m: { x: number; y: number; off?: true } | null) => {
    if (m && s.link === 'in') bus.say({ t: 'point', ...m });
  };

  const onMove = (e: RPointerEvent) => {
    const st = toStage(e);
    if (!st) return;
    const d = drag.current;
    if (d?.kind === 'pan' && replica) {
      replica.userView = { ...replica.userView, dx: replica.userView.dx + (e.clientX - d.x), dy: replica.userView.dy + (e.clientY - d.y) };
      d.x = e.clientX;
      d.y = e.clientY;
      replica.touch();
      bus.repaint();
      return;
    }
    if (d?.kind === 'draw') {
      const kind = tool as MarkKind;
      d.pts = kind === 'scribble' ? [...d.pts, st.x, st.y] : [d.pts[0], d.pts[1], st.x, st.y];
      setDraft(makeMark({ id: d.id, kind, pts: kind === 'scribble' ? capPoints(d.pts) : d.pts, color, pin: animated ? 'frame' : 'page', frame }));
    }
    // The pointer goes at most 30 times a second, with the newest place, in stage pixels.
    const m = sender.move(performance.now(), Math.round(st.x * 10) / 10, Math.round(st.y * 10) / 10);
    if (m) sendPointer(m);
    else if (!timer.current) {
      const w = sender.waitMs(performance.now());
      if (w !== null)
        timer.current = setTimeout(() => {
          timer.current = null;
          sendPointer(sender.due(performance.now()));
        }, w + 1);
    }
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const onDown = (e: RPointerEvent) => {
    if (e.button !== 0 || !shown) return;
    const st = toStage(e);
    if (!st) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Not every pointer can be captured; the drag still works while it stays over the window.
    }
    if (tool === 'look') {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, pts: [], id: '' };
    } else if (tool === 'note' || tool === 'text') {
      setTyping({ kind: tool, x: st.x, y: st.y, text: '' });
    } else {
      drag.current = { kind: 'draw', x: e.clientX, y: e.clientY, pts: [st.x, st.y, st.x, st.y], id: newItemId('m') };
    }
  };

  const hand = (item: ReviewItem) => bus.say(item);
  const sig = () => (doc ? structureSig(pageOf(doc)) : undefined);

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind !== 'draw') return;
    const kind = tool as MarkKind;
    const pts = kind === 'scribble' ? capPoints(simplify(d.pts, 1.2 / (shown?.zoom || 1))) : d.pts;
    setDraft(null);
    if (!worthKeeping(kind, pts, 6 / (shown?.zoom || 1))) return;
    const m = makeMark({ id: d.id, kind, pts, color, pin: animated ? 'frame' : 'page', frame });
    setMarks((l) => [...l, m]);
    hand({ t: 'mark', mark: m, sig: sig() });
  };

  const finishTyping = () => {
    const t = typingRef.current;
    setTyping(null);
    if (!t || !t.text.trim()) return;
    if (t.kind === 'note') {
      const n: MyNote = { id: newItemId('n'), x: t.x, y: t.y, text: t.text.trim(), frame: animated ? frame : null };
      setNotes((l) => [...l, n]);
      hand({ t: 'note', id: n.id, x: n.x, y: n.y, text: n.text, ...(n.frame !== null ? { frame: n.frame } : {}), sig: sig(), at: Date.now() });
    } else {
      const m = makeMark({ id: newItemId('m'), kind: 'text', pts: [t.x, t.y], text: t.text.trim(), color, pin: animated ? 'frame' : 'page', frame });
      setMarks((l) => [...l, m]);
      hand({ t: 'mark', mark: m, sig: sig() });
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!replica || !rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    replica.userView = zoomedAbout(replica.userView, e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    replica.touch();
    bus.repaint();
    setLocal((n) => n + 1);
  };

  // Saves the picture on screen as a PNG (the desktop side asks for the file name and writes it). Works live and once it is over.
  const savePicture = () => {
    const r = bus.replica;
    if (!r?.doc || !r.look) return;
    const d = r.doc;
    const f = pictureFrame(d, r.look.frame, r.freeFrame);
    const name = r.look.name;
    setPictureFailed(false);
    picturePng(d, f).then(
      (png) => bus.say({ t: 'savePicture', png, name }),
      () => setPictureFailed(true),
    );
  };
  useEffect(() => {
    bus.onSavePicture = savePicture;
  });
  const over = isOver(s.link);
  // Nothing more can be sent, so a note half written or a pen left chosen is put away.
  useEffect(() => {
    if (!over) return;
    setTool('look');
    setTyping(null);
    setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  const onLeave = () => sendPointer(sender.move(performance.now(), 0, 0, true));

  // Keys: Escape drops what is being typed or goes back to Look; arrows step frames; 0 fits the picture.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        savePicture();
      } else if (e.key === 'Escape') setTool('look');
      else if (e.key === '0') fit();
      else if (e.key === 'ArrowRight' && animated) setFrame((free ?? frame) + 1);
      else if (e.key === 'ArrowLeft' && animated) setFrame((free ?? frame) - 1);
      else if (e.key === ' ' && animated) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing, animated, free, frame]);

  const bar = over ? null : linkWords(s);
  const ended = overWords(s.link);
  const shownMarks = doc ? visibleMarks({ ...pageOf(doc), marks, notes: undefined }, frame) : [];
  const dot = bus.sharer.visible(performance.now())[0];
  const sx = (x: number) => (view ? x * view.zoom + view.panX : 0);
  const sy = (y: number) => (view ? y * view.zoom + view.panY : 0);
  const mine = notes.filter((n) => n.frame === null || n.frame === frame);
  const following = free === null;
  const style = { '--rv-pen': color } as CSSProperties;

  return (
    <div className="rv-win" style={style} data-testid="review.win" data-link={s.link} data-over={over ? '' : undefined}>
      {/* The surface that takes the pointer: nothing under it can be touched, and nothing it does reaches the drawing. */}
      <div className="rv-surface" data-tool={tool} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onLeave} onWheel={onWheel} data-testid="review.surface" />
      {over && <div className="rv-veil" aria-hidden="true" data-testid="review.veil" />}
      {view && (
        <svg className="po-marks" aria-hidden="true">
          {shownMarks.map((m) => (
            <MarkShape key={m.id} m={m} v={view} />
          ))}
          {draft && <MarkShape m={draft} v={view} ghost />}
        </svg>
      )}
      {view && mine.map((n, i) => (
        <div key={n.id} className="rv-pin" style={{ left: sx(n.x), top: sy(n.y) }} title={n.text} data-testid="review.pin">
          <b>{notes.indexOf(n) + 1}</b>
          <span className="rv-pin-text">{n.text}{bus.arrived.has(n.id) ? '' : ' (sending)'}</span>
          <i hidden>{i}</i>
        </div>
      ))}
      {view && typing && (
        <textarea
          className="rv-typing"
          ref={(el) => {
            // The press that made this box is still finishing; take focus just after it, or the press takes it back.
            if (el && !el.dataset.born) {
              el.dataset.born = String(Date.now());
              window.setTimeout(() => el.focus(), 40);
            }
          }}
          aria-label={typing.kind === 'note' ? 'Your note' : 'Words for the picture'}
          placeholder="Type, then Enter"
          rows={1}
          value={typing.text}
          style={{ left: sx(typing.x), top: sy(typing.y) }}
          onChange={(e) => setTyping({ ...typing, text: e.target.value })}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') setTyping(null);
            else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              finishTyping();
            }
          }}
          onBlur={(e) => (Date.now() - Number(e.currentTarget.dataset.born ?? 0) > 250 ? finishTyping() : e.currentTarget.focus())}
          data-testid="review.typing"
        />
      )}
      {view && dot && !over && (
        <div className="rv-pointer" style={{ transform: `translate(${sx(dot.dot.x)}px, ${sy(dot.dot.y)}px)`, opacity: dot.alpha }} data-testid="review.sharerPointer">
          <i style={{ background: colourOfSeat(0) }} />
          <span>{s.name ? 'Sharer' : ''}</span>
        </div>
      )}
      {ended && (
        <div className="rv-over" role="status" data-testid="review.over">
          <div className="rv-over-text">
            <b className="rv-over-title">{ended.title}</b>
            <span>{ended.text}</span>
          </div>
          <div className="rv-over-actions">
            <button type="button" className="rv-btn rv-btn-main" onClick={savePicture} title={SAVE_PICTURE_NOTE} data-testid="review.savePicture">
              Save this picture (PNG)
            </button>
            <button type="button" className="rv-btn" onClick={() => bus.say({ t: 'save' })} data-testid="review.save">
              Save my comments
            </button>
          </div>
          <span className="rv-over-note" data-testid="review.over.note">
            {SAVE_PICTURE_NOTE}
            {s.waiting > 0 ? ` ${s.waiting} of your notes did not get through: Save my comments keeps them to send another way.` : ''}
            {s.pictureSaved === true ? ' Picture saved.' : ''}
            {s.saved === true ? ' Comments saved.' : ''}
            {pictureFailed ? ' Could not make the picture.' : ''}
          </span>
        </div>
      )}
      {bar && (
        <div className="rv-bar" data-tone={bar.tone} role="status" data-testid="review.bar">
          <span>{bar.text}</span>
          {(s.waiting > 0 || s.link === 'lost' || s.link === 'ended' || s.link === 'removed') && (
            <button type="button" className="rv-btn" onClick={() => bus.say({ t: 'save' })} data-testid="review.save">
              Save my comments
            </button>
          )}
          {s.saved === true && <span> Saved.</span>}
        </div>
      )}
      <div className="rv-tools" role="toolbar" aria-label="Review tools" data-testid="review.tools">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className="rv-btn" aria-pressed={tool === t.id} disabled={over && t.id !== 'look'} title={over && t.id !== 'look' ? 'The review has ended, so nothing more can be sent.' : t.tip} data-testid={`review.tool.${t.id}`} onClick={() => setTool(t.id)}>
            {t.label}
          </button>
        ))}
        <span className="rv-swatches" role="group" aria-label="Pen colour">
          {MARK_COLORS.slice(0, 6).map((c) => (
            <button key={c.value} type="button" className="rv-swatch" aria-pressed={color === c.value} disabled={over} aria-label={c.name} title={c.name} style={{ background: c.value }} onClick={() => setColor(c.value)} />
          ))}
        </span>
        <button type="button" className="rv-btn" title="Put the picture back to fit the window (0)" onClick={fit} data-testid="review.fit">
          Fit
        </button>
        {!over && (
          <button type="button" className="rv-btn" title={`${SAVE_PICTURE_NOTE} (Ctrl+S)`} onClick={savePicture} data-testid="review.savePictureLive">
            Save picture
          </button>
        )}
        {animated && (
          <>
            <span className="rv-chipmode" data-testid="review.mode" data-following={following ? '' : undefined}>
              {following ? (over ? 'Their last frame' : 'Following them') : `Free: frame ${(free ?? 0) + 1}`}
            </span>
            <input type="range" min={0} max={Math.max(0, length - 1)} value={free ?? frame} aria-label="Frame" onChange={(e) => setFrame(Number(e.target.value))} data-testid="review.scrub" />
            <button type="button" className="rv-btn" aria-pressed={playing} onClick={() => setPlaying((p) => !p)} data-testid="review.play">
              {playing ? 'Pause' : 'Play'}
            </button>
            {!following && (
              <button
                type="button"
                className="rv-btn"
                onClick={() => {
                  setPlaying(false);
                  setFrame(null);
                }}
                data-testid="review.back"
              >
                Back to their frame
              </button>
            )}
          </>
        )}
      </div>
      <i hidden>{local}</i>
    </div>
  );
}

export { shownFrame };
