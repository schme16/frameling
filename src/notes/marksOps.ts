// Drawing and changing marks: starting a stroke, following the pen, finishing it, typing words, rubbing one out, and
// clearing. Every change to the file is one undo step with a plain name. A stroke is not in the file until the pen
// lifts (and, the first time, until you say where marks belong; see marksChoices.ts).
import { uid } from '../core/doc';
import type { CanvasMark, Id } from '../core/format';
import { withChoice } from '../core/choices';
import { store } from '../core/store';
import { boardOf, type NotePin } from './model';
import { DEFAULT_COLOR, MARK_LABELS, MAX_MARK_TEXT, capPoints, makeMark, markAt, simplify, visibleMarks, worthKeeping, type MarkKind } from './marks';
import { getMarksState, setMarksLive, setMarksSaved } from './marksState';
import type { MarksPinChoice } from './marksChoices';

/** Screen pixels a stroke must grow before it is worth keeping, and the reach of a click on a thin line. */
export const MIN_STROKE_PX = 6;
export const REACH_PX = 8;

/** Where a mark started now belongs: the frame, layer and artboard the person is on. */
function placeNow(): Pick<CanvasMark, 'frame' | 'layer' | 'board'> {
  const { doc, ui } = store().get();
  const at: Pick<CanvasMark, 'frame' | 'layer' | 'board'> = { frame: ui.frame };
  if (ui.activeLayerId) at.layer = ui.activeLayerId;
  const board = boardOf(doc);
  if (board) at.board = board;
  return at;
}

/** Marks never go unseen while you draw them: turning the pen on turns the marks on. */
export function ensureShown(): void {
  if (!getMarksState().show) setMarksSaved({ show: true });
}

// ---------------------------------------------------------------- following the pen

/** Starts a stroke of a kind at a stage point. */
export function beginStroke(kind: Exclude<MarkKind, 'text'>, x: number, y: number): void {
  const s = getMarksState();
  ensureShown();
  const m: CanvasMark = { id: uid('m'), kind, pts: kind === 'scribble' ? [x, y] : [x, y, x, y], ...placeNow() };
  if (s.color !== DEFAULT_COLOR) m.color = s.color;
  m.w = s.w;
  setMarksLive({ draft: m });
}


/** Rounds an arrow's end to the nearest 15 degrees round its start (Shift). */
function steppedEnd(x0: number, y0: number, x: number, y: number): [number, number] {
  const d = Math.hypot(x - x0, y - y0);
  const a = Math.round(Math.atan2(y - y0, x - x0) / (Math.PI / 12)) * (Math.PI / 12);
  return [x0 + Math.cos(a) * d, y0 + Math.sin(a) * d];
}

/** Moves the pen. Shift keeps an arrow to 15 degree steps and a circle round; a scribble just follows. */
export function moveStroke(x: number, y: number, o: { shift?: boolean; zoom: number }): void {
  const m = getMarksState().draft;
  if (!m) return;
  if (m.kind === 'scribble') {
    const n = m.pts.length;
    // Points closer than a screen pixel or two add nothing to a stroke.
    if (Math.hypot(x - m.pts[n - 2], y - m.pts[n - 1]) * o.zoom < 1.5) return;
    setMarksLive({ draft: { ...m, pts: [...m.pts, x, y] } });
    return;
  }
  const [x0, y0] = m.pts;
  let ex = x;
  let ey = y;
  if (o.shift && m.kind === 'arrow') [ex, ey] = steppedEnd(x0, y0, x, y);
  if (o.shift && m.kind === 'circle') {
    const s = Math.max(Math.abs(x - x0), Math.abs(y - y0));
    ex = x0 + Math.sign(x - x0 || 1) * s;
    ey = y0 + Math.sign(y - y0 || 1) * s;
  }
  setMarksLive({ draft: { ...m, pts: [x0, y0, ex, ey] } });
}

/** Lifts the pen: a stroke that went somewhere is kept, a tap is dropped. */
export function finishStroke(zoom: number): void {
  const m = getMarksState().draft;
  setMarksLive({ draft: null });
  if (!m) return;
  const pts = m.kind === 'scribble' ? capPoints(simplify(m.pts, 0.6 / Math.max(zoom, 0.01))) : m.pts;
  if (!worthKeeping(m.kind, pts, MIN_STROKE_PX / Math.max(zoom, 0.01))) return;
  askAndKeep({ ...m, pts });
}

/** Drops the stroke in hand (Esc, or the tool was switched). */
export function cancelStroke(): void {
  setMarksLive({ draft: null });
}

// ---------------------------------------------------------------- keeping one

const doing = (m: CanvasMark) => (m.kind === 'text' ? 'Add words' : `Draw ${/^[aeiou]/i.test(MARK_LABELS[m.kind]) ? 'an' : 'a'} ${MARK_LABELS[m.kind].toLowerCase()}`);

/** Puts a finished mark in the file, belonging where `pin` says. One undo step. */
export function keepMark(m: CanvasMark, pin: NotePin): void {
  const { ui } = store().get();
  const where = pin === 'layer' && !(m.layer ?? ui.activeLayerId) ? 'page' : pin;
  const kept = makeMark({ id: m.id, kind: m.kind, pts: m.pts, color: m.color, w: m.w, text: m.text, pin: where, frame: m.frame ?? ui.frame, layer: m.layer ?? ui.activeLayerId ?? undefined, board: m.board });
  store().update(doing(m), (d) => void (d.marks ??= []).push(kept as never));
}

/** Asks the first time whether marks belong to the frame, the page or the layer; after that it just does it. */
function askAndKeep(m: CanvasMark): void {
  const { doc } = store().get();
  // The stroke shows while the question is open, and is added only when it is answered.
  setMarksLive({ pending: [...getMarksState().pending, m] });
  const settle = () => setMarksLive({ pending: getMarksState().pending.filter((p) => p.id !== m.id) });
  withChoice<MarksPinChoice>(
    'marks.pin',
    (pin) => {
      keepMark(m, pin);
      settle();
    },
    { matters: doc.length > 1 || doc.layers.length > 1, gently: { undo: () => removeMark(m.id) } },
  );
}

export function removeMark(id: Id): void {
  if (!store().get().doc.marks?.some((m) => m.id === id)) return;
  store().update('Rub out a mark', (d) => {
    d.marks = d.marks?.filter((m) => m.id !== id);
    if (!d.marks?.length) delete d.marks;
  });
}

// ---------------------------------------------------------------- words

/** Starts typing words at a stage point. The mark joins the file when it has words (see `finishText`). */
export function beginText(x: number, y: number): void {
  const s = getMarksState();
  ensureShown();
  const m: CanvasMark = { id: uid('m'), kind: 'text', pts: [x, y], text: '', ...placeNow() };
  if (s.color !== DEFAULT_COLOR) m.color = s.color;
  m.w = s.w;
  setMarksLive({ typing: m });
}

export function typeText(text: string): void {
  const m = getMarksState().typing;
  if (m) setMarksLive({ typing: { ...m, text: text.slice(0, MAX_MARK_TEXT) } });
}

/** Done typing: words with something in them are kept, an empty box just goes away. */
export function finishText(): void {
  const m = getMarksState().typing;
  setMarksLive({ typing: null });
  if (m && m.text?.trim()) askAndKeep({ ...m, text: m.text.trim() });
}

export function cancelText(): void {
  setMarksLive({ typing: null });
}

// ---------------------------------------------------------------- rubbing out and clearing

/** Rubs out the top mark under a stage point, if there is one. Returns whether it did. */
export function eraseAt(x: number, y: number, zoom: number): boolean {
  const { doc, ui } = store().get();
  const hit = markAt(visibleMarks(doc, ui.frame), x, y, REACH_PX / Math.max(zoom, 0.01));
  if (!hit) return false;
  store().update(
    'Rub out a mark',
    (d) => {
      d.marks = d.marks?.filter((m) => m.id !== hit.id);
      if (!d.marks?.length) delete d.marks;
    },
    { coalesce: 'marks-erase' },
  );
  return true;
}

/** Takes the marks showing on this frame (or every mark on the open artboard) out of the file. Returns how many went. */
export function clearMarks(scope: 'frame' | 'all'): number {
  const { doc, ui } = store().get();
  const open = doc.editing?.length ? [] : (doc.marks ?? []);
  const gone = new Set((scope === 'frame' ? visibleMarks(doc, ui.frame) : open.filter((m) => !m.board || m.board === boardOf(doc) || !doc.artboards?.some((b) => b.id === m.board))).map((m) => m.id));
  if (!gone.size) return 0;
  store().update(scope === 'frame' ? 'Clear the marks on this frame' : 'Clear every mark', (d) => {
    d.marks = d.marks?.filter((m) => !gone.has(m.id));
    if (!d.marks?.length) delete d.marks;
  });
  return gone.size;
}
