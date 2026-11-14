// What the marks area remembers between launches (whether marks show, the shape, colour and thickness of the pen) and
// what is happening right now (the stroke being drawn, strokes waiting for an answer to "where do marks belong", and
// the words being typed). Nothing is added to the file until a mark is finished.
import { useSyncExternalStore } from 'react';
import type { CanvasMark } from '../core/format';
import { DEFAULT_COLOR, DEFAULT_W, MARK_COLORS, MAX_W, MIN_W, type MarkKind } from './marks';

export type MarkTool = MarkKind | 'erase';
const TOOLS: readonly MarkTool[] = ['arrow', 'circle', 'scribble', 'text', 'erase'];

interface Saved {
  /** One switch for every mark on the canvas. */
  show: boolean;
  /** What the Marks tool does: draws one of the four kinds, or rubs a mark out. */
  shape: MarkTool;
  color: string;
  /** Thickness in screen pixels. */
  w: number;
}

const KEY = 'frameling.marks';
const FRESH: Saved = { show: true, shape: 'arrow', color: DEFAULT_COLOR, w: DEFAULT_W };
let saved: Saved = { ...FRESH };

try {
  if (typeof localStorage !== 'undefined') {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      if (typeof raw.show === 'boolean') saved.show = raw.show;
      if (TOOLS.includes(raw.shape)) saved.shape = raw.shape;
      if (typeof raw.color === 'string' && MARK_COLORS.some((c) => c.value === raw.color)) saved.color = raw.color;
      if (typeof raw.w === 'number' && Number.isFinite(raw.w)) saved.w = Math.max(MIN_W, Math.min(MAX_W, Math.round(raw.w)));
    }
  }
} catch {
  // storage can be unavailable; the defaults are fine
}

interface Live {
  /** The stroke being drawn now, kept out of the file until the pen lifts. */
  draft: CanvasMark | null;
  /** Finished strokes waiting for the person to say where marks belong. They show, but are not in the file yet. */
  pending: readonly CanvasMark[];
  /** The text mark being typed. It joins the file when it has words and you press Enter or click away. */
  typing: CanvasMark | null;
}

let live: Live = { draft: null, pending: [], typing: null };
let snapshot = { ...saved, ...live };
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = { ...saved, ...live };
  listeners.forEach((f) => f());
}

function persist(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // not saved; it still works for now
  }
}

export const getMarksState = () => snapshot;

export function setMarksSaved(patch: Partial<Saved>): void {
  const next = { ...saved, ...patch };
  if (next.show === saved.show && next.shape === saved.shape && next.color === saved.color && next.w === saved.w) return;
  saved = next;
  persist();
  emit();
}

export function setMarksLive(patch: Partial<Live>): void {
  const next = { ...live, ...patch };
  if (next.draft === live.draft && next.pending === live.pending && next.typing === live.typing) return;
  live = next;
  emit();
}

export function useMarksState() {
  return useSyncExternalStore(
    (f) => (listeners.add(f), () => void listeners.delete(f)),
    () => snapshot,
  );
}

export const marksShown = (): boolean => saved.show;

/** Forgets everything (for tests). */
export function _resetMarksState(): void {
  saved = { ...FRESH };
  live = { draft: null, pending: [], typing: null };
  emit();
}
