// Notes on the canvas: a small marker for each note (drag it about, click it to open it) and the card that opens beside
// it, with the words, who and when, the answers, a tick for done and where the note belongs. The markers sit in the
// canvas's turn box so they follow the view; the card sits outside it so it always reads the right way up.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasNote } from '../core/format';
import { useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { getTurn, unturnVector, useTurn } from '../canvas/turn';
import { answerNote, closeNote, moveNote, removeNote, repinNote, tickNote, writeNote } from './ops';
import { byLine, noteTitle, pinOf, visibleNotes, whereText, type NotePin } from './model';
import { openNote, useNotesState } from './state';
import './notes.css';

/** Screen pixels a press must move before it is a drag and not a click. */
const DRAG_PX = 4;

type Drag = { id: string; x0: number; y0: number; nx: number; ny: number; zoom: number; moved: boolean };

/** Every marker on the canvas that should show now (the draft too, so a note you have started has a place to sit). */
function useShownNotes(): CanvasNote[] {
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const { show, hideDone, draft, openId } = useNotesState();
  if (!show) return draft ? [draft] : [];
  const list = visibleNotes(doc, frame, { hideDone });
  // A note you are looking at stays up even if it would be hidden (it was just ticked off, say).
  const open = openId ? doc.notes?.find((n) => n.id === openId) : undefined;
  if (open && !list.includes(open) && !doc.editing?.length) list.push(open);
  return draft && !list.some((n) => n.id === draft.id) ? [...list, draft] : list;
}

export function NoteMarkers() {
  const notes = useShownNotes();
  const zoom = useStore((s) => s.ui.zoom);
  const panX = useStore((s) => s.ui.panX);
  const panY = useStore((s) => s.ui.panY);
  const { openId } = useNotesState();
  const drag = useRef<Drag | null>(null);
  if (!notes.length) return null;

  const down = (n: CanvasNote) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: n.id, x0: e.clientX, y0: e.clientY, nx: n.x, ny: n.y, zoom, moved: false };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    d.moved = true;
    const v = unturnVector(getTurn(), dx, dy);
    moveNote(d.id, d.nx + v.x / d.zoom, d.ny + v.y / d.zoom);
  };
  const up = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // already let go
    }
    if (!d.moved) openNote(openId === d.id ? null : d.id);
  };
  const key = (n: CanvasNote) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      openNote(openId === n.id ? null : n.id);
    }
  };

  return (
    <div className="nt-layer" aria-label="Notes">
      {notes.map((n) => {
        const replies = n.replies?.length ?? 0;
        const pin = pinOf(n);
        return (
          <button
            type="button"
            key={n.id}
            className={`nt-marker nt-${pin}${n.done ? ' is-done' : ''}${openId === n.id ? ' is-open' : ''}`}
            style={{ left: n.x * zoom + panX, top: n.y * zoom + panY }}
            data-note-id={n.id}
            data-canvas-hold=""
            title={`${noteTitle(n, 80)}${n.done ? ' (done)' : ''}. Click to open, drag to move.`}
            aria-label={`Note: ${noteTitle(n, 80)}${n.done ? ', done' : ''}`}
            aria-expanded={openId === n.id}
            onPointerDown={down(n)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={key(n)}
          >
            <Icon name={n.done ? 'check' : 'note'} size={13} />
            {replies > 0 && <span className="nt-count">{replies}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The open note's card. */
export function NoteCard() {
  const { openId, draft } = useNotesState();
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const layerId = useStore((s) => s.ui.activeLayerId);
  const zoom = useStore((s) => s.ui.zoom);
  const panX = useStore((s) => s.ui.panX);
  const panY = useStore((s) => s.ui.panY);
  const turn = useTurn();
  const card = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const [answer, setAnswer] = useState('');
  const note = openId ? (doc.notes?.find((n) => n.id === openId) ?? (draft?.id === openId ? draft : undefined)) : undefined;
  const nx = note?.x;
  const ny = note?.y;

  // The note went away (undo, another file): close the card.
  useEffect(() => {
    if (openId && !note) openNote(null);
  }, [openId, note]);

  // New card: start on the words, and a clear answer box.
  useEffect(() => {
    setAnswer('');
    if (openId) text.current?.focus({ preventScroll: true });
  }, [openId]);

  // Sit beside the marker, on whichever side has room, and stay on the canvas. Set straight on the element, since it
  // moves with every zoom and pan.
  useLayoutEffect(() => {
    const el = card.current;
    if (!el || !openId) return;
    const place = () => {
      const marker = el.parentElement?.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(openId)}"]`);
      const root = el.parentElement;
      if (!marker || !root) return;
      const m = marker.getBoundingClientRect();
      const r = root.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let left = m.right - r.left + 10;
      if (left + w > r.width - 8) left = m.left - r.left - w - 10;
      left = Math.max(8, Math.min(left, r.width - w - 8));
      const top = Math.max(8, Math.min(m.top - r.top - 6, r.height - h - 8));
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    };
    place();
    const watch = new ResizeObserver(place);
    watch.observe(el);
    return () => watch.disconnect();
  }, [openId, nx, ny, zoom, panX, panY, turn, frame]);

  if (!openId || !note) return null;
  const pin = pinOf(note);
  const layer = doc.layers.find((l) => l.id === (pin === 'layer' ? note.layer : layerId));
  const submit = () => {
    if (answerNote(note.id, answer)) setAnswer('');
  };
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      closeNote();
    }
  };
  const pins: { value: NotePin; label: string; off?: boolean }[] = [
    { value: 'page', label: 'The page' },
    { value: 'frame', label: pin === 'frame' ? `Frame ${note.frame! + 1}` : `This frame (${frame + 1})` },
    { value: 'layer', label: pin === 'layer' && layer ? `Layer ${layer.name}` : layer ? `This layer (${layer.name})` : 'This layer', off: pin !== 'layer' && !layer },
  ];
  const who = byLine(note.by, note.at);

  return (
    <div ref={card} className="nt-card" role="dialog" aria-label="Note" data-canvas-hold="" data-testid="note.card" onKeyDown={onKey} onWheel={(e) => e.stopPropagation()}>
      <div className="nt-head">
        <span className="nt-who">{who || 'Your note'}</span>
        <button type="button" className="nt-x" title="Close (Esc)" aria-label="Close note" onClick={closeNote}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <textarea
        ref={text}
        className="nt-text"
        value={note.text}
        rows={3}
        placeholder="Write a note..."
        aria-label="Note"
        onChange={(e) => writeNote(note.id, e.target.value)}
      />
      {!!note.replies?.length && (
        <ul className="nt-replies" aria-label="Answers">
          {note.replies.map((r) => (
            <li key={r.id}>
              <small>{byLine(r.by, r.at) || 'Answer'}</small>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      )}
      {note.text.trim() && (
        <div className="nt-answer">
          <input
            type="text"
            value={answer}
            placeholder="Answer..."
            aria-label="Answer this note"
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button type="button" disabled={!answer.trim()} onClick={submit}>
            Answer
          </button>
        </div>
      )}
      <div className="nt-foot">
        <label className="nt-done" title="Tick it off when it has been dealt with">
          <input type="checkbox" checked={!!note.done} disabled={!note.text.trim()} onChange={(e) => tickNote(note.id, e.target.checked)} />
          <span>Done</span>
        </label>
        <label className="nt-pin" title="Where this note belongs. A frame note shows only on its frame; the page shows it always.">
          <span className="nt-sr">Belongs to</span>
          <select value={pin} aria-label="Belongs to" onChange={(e) => repinNote(note.id, e.target.value as NotePin)}>
            {pins.map((p) => (
              <option key={p.value} value={p.value} disabled={p.off}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="nt-del" title="Remove this note" aria-label="Remove note" onClick={() => removeNote(note.id)}>
          <Icon name="trash" size={14} />
        </button>
      </div>
      <span className="nt-sr" aria-live="polite">{whereText(doc, note)}</span>
    </div>
  );
}
