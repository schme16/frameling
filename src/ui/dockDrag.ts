// Dragging in the dock, with the pointer (not the browser's drag and drop) so a tab can be carried out over the canvas
// to become a window, a window can be carried back, and the tool rail can be put on any edge. What is under the pointer
// tells what letting go would do; the views mark those places with data attributes:
//   data-dock-strip + data-dock-zone / data-dock-float   a tab bar (the rail too): drop between its tabs
//   data-dock-tab, data-dock-tabs, data-dock-axis        its tabs, their order, and which way they run
//   data-dock-area + data-dock-zone / data-dock-float    a whole zone or window: drop at the end of its tabs
//   data-dock-group, data-dock-groups, data-dock-stack    which stacked group of a zone it is, how many there are, and
//                                                         which way they stack: the edges of a group make a new one
//   data-dock-edge                                        the drop bands over the canvas edges while dragging
import { dock, flushDock, moveFloatTo, panelTitle, placePanel, placeTools, setFloatWindowBox } from './dock';
import { floatTitle, MAX_GROUPS, type DockZone, type DropTarget, type FloatWin, type ToolsPlace } from './dockModel';
import { dragging } from './dockShared';
import { createStore } from './mini';

export interface DragState {
  kind: 'panel' | 'group' | 'tools';
  /** The panels being carried (the tool rail carries none). */
  panels: string[];
  label: string;
  x: number;
  y: number;
  /** What letting go would do. Null: nothing (a window being moved over open canvas, say). */
  target: DropTarget | null;
  /** For the tool rail: the edge it would dock on, or 'float'. */
  toolsAt?: ToolsPlace;
}

export const dragState = createStore<DragState | null>(null);

const THRESHOLD = 5;

export const ZONE_WORDS: Record<DockZone, string> = { left: 'on the left', right: 'on the right', bottom: 'at the bottom', top: 'at the top' };
export const ZONE_NAMES: Record<DockZone, string> = { left: 'Left side', right: 'Right side', bottom: 'Bottom', top: 'Top' };

type Hit = { edges?: boolean; strips?: boolean; areas?: boolean; exclude?: string };

/** What dropping at a screen point would do: onto an edge band, between a bar's tabs, onto a zone or window, or a new window. */
export function targetAt(x: number, y: number, hit: Hit = { edges: true, strips: true, areas: true }): DropTarget {
  const els = typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(x, y) : [];
  for (const el of els) {
    const h = el as HTMLElement;
    if (hit.exclude && h.closest?.(`[data-float-id="${hit.exclude}"]`)) continue;
    if (hit.edges && h.dataset?.dockEdge) return { zone: h.dataset.dockEdge as DockZone };
    const strip = hit.strips ? (h.closest?.('[data-dock-strip]') as HTMLElement | null) : null;
    if (strip) {
      const t = placeOfEl(strip);
      if (t) return { ...t, index: indexIn(strip, x, y) };
    }
    const area = hit.areas ? (h.closest?.('[data-dock-area]') as HTMLElement | null) : null;
    if (area) {
      const t = placeOfEl(area);
      if (t) return 'zone' in t ? splitHit(area, t, x, y) : t;
    }
  }
  return { newFloat: { x: x - 60, y: y - 14 } };
}

function placeOfEl(el: HTMLElement): { zone: DockZone; group?: number } | { float: string } | null {
  if (el.dataset.dockZone) return { zone: el.dataset.dockZone as DockZone, ...(Number(el.dataset.dockGroup) > 0 ? { group: Number(el.dataset.dockGroup) } : {}) };
  if (el.dataset.dockFloat && dock.get().layout.floats.some((f) => f.id === el.dataset.dockFloat)) return { float: el.dataset.dockFloat };
  return null;
}

/**
 * Over a group's body: the middle joins its tabs, and the edge toward the stack's ends (the top or bottom of a side
 * zone's group, the left or right of a top or bottom zone's) would make a new group there instead.
 */
function splitHit(area: HTMLElement, t: { zone: DockZone; group?: number }, x: number, y: number): DropTarget {
  if (area.dataset.dockGroup === undefined || Number(area.dataset.dockGroups ?? 1) >= MAX_GROUPS) return t;
  const r = area.getBoundingClientRect();
  const across = area.dataset.dockStack === 'x';
  const strip = area.querySelector<HTMLElement>('[data-dock-strip]');
  // A tab bar along the top sits outside the body: the band starts under it.
  const sr = !across && strip && strip.dataset.dockAxis === 'x' ? strip.getBoundingClientRect() : null;
  const from = across ? r.left : sr ? Math.max(r.top, sr.bottom) : r.top;
  const to = across ? r.right : r.bottom;
  const size = to - from;
  if (size < 90) return t;
  const band = Math.max(24, Math.min(56, size * 0.2));
  const at = across ? x : y;
  if (at < from + band) return { ...t, split: 'before' };
  if (at > to - band) return { ...t, split: 'after' };
  return t;
}

/** The place among a bar's tabs a drop at (x, y) would take, counting tabs that don't fit and so aren't drawn. */
function indexIn(strip: HTMLElement, x: number, y: number): number {
  const all = (strip.dataset.dockTabs ?? '').split(',').filter(Boolean);
  const vertical = strip.dataset.dockAxis === 'y';
  for (const t of strip.querySelectorAll<HTMLElement>('[data-dock-tab]')) {
    const r = t.getBoundingClientRect();
    if (vertical ? y < r.top + r.height / 2 : x < r.left + r.width / 2) {
      const i = all.indexOf(t.dataset.dockTab!);
      return i < 0 ? 0 : i;
    }
  }
  return all.length;
}

/**
 * Where in a tab bar the current drop would land: its tab position, or null when the drag isn't headed for this zone or
 * window. A drop on the area rather than the tab bar goes to the end.
 */
export function dropIndexFor(d: DragState | null, at: { zone: DockZone; group?: number } | { float: string }, len: number): number | null {
  const t = d?.target;
  if (!t || 'newFloat' in t) return null;
  if ('zone' in at ? !('zone' in t && t.zone === at.zone && (t.group ?? 0) === (at.group ?? 0) && !t.split) : !('float' in t && t.float === at.float)) return null;
  return t.index ?? len;
}

/** Which edge of a group the current drop would make a new group at, or null. */
export function splitFor(d: DragState | null, at: { zone: DockZone; group?: number }): 'before' | 'after' | null {
  const t = d?.target;
  return t && 'zone' in t && t.split && t.zone === at.zone && (t.group ?? 0) === (at.group ?? 0) ? t.split : null;
}

/** Words for where a split drop puts the new group. */
export const SPLIT_WORDS: Record<DockZone, { before: string; after: string }> = {
  left: { before: 'above', after: 'below' },
  right: { before: 'above', after: 'below' },
  top: { before: 'to the left', after: 'to the right' },
  bottom: { before: 'to the left', after: 'to the right' },
};

/** Stops the click that would follow a drag from also pressing the thing that was dragged. */
function swallowClick(): void {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, true), 0);
}

/** Runs a pointer drag: `move` for each move once it has gone past a few pixels, `end` when it lets go (or Escape: ok false). */
export function run(e: React.PointerEvent, move: (ev: PointerEvent) => void, end: (ev: PointerEvent, ok: boolean) => void, start?: () => void): void {
  if (e.button !== 0) return;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let moving = false;
  const onMove = (ev: PointerEvent) => {
    if (!moving) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < THRESHOLD) return;
      moving = true;
      document.body.classList.add('dock-dragging');
      start?.();
    }
    move(ev);
  };
  const finish = (ev: PointerEvent, ok: boolean) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey, true);
    document.body.classList.remove('dock-dragging');
    if (!moving) return;
    swallowClick();
    end(ev, ok);
  };
  const onUp = (ev: PointerEvent) => finish(ev, true);
  const onCancel = (ev: PointerEvent) => finish(ev, false);
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    ev.preventDefault();
    finish(new PointerEvent('pointercancel'), false);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey, true);
}

/** Pointer down on a panel's tab, rail item or section name: dragging it moves the panel; a plain click still presses it. */
export function startPanelDrag(e: React.PointerEvent, id: string): void {
  const label = panelTitle(id);
  run(
    e,
    (ev) => dragState.set({ kind: 'panel', panels: [id], label, x: ev.clientX, y: ev.clientY, target: targetAt(ev.clientX, ev.clientY) }),
    (_ev, ok) => {
      const d = dragState.get();
      dragState.set(null);
      dragging.set(null);
      if (ok && d?.target) placePanel(id, d.target);
    },
    () => dragging.set(id),
  );
}

/**
 * Pointer down on a window's title bar: dragging moves the window. Over an edge band or a tab bar, letting go docks the
 * whole window's panels there; anywhere else it stays where it was put.
 */
export function startFloatDrag(e: React.PointerEvent, f: FloatWin): void {
  const ox = e.clientX - f.x;
  const oy = e.clientY - f.y;
  const from = { x: f.x, y: f.y };
  run(
    e,
    (ev) => {
      setFloatWindowBox(f.id, clampPos(ev.clientX - ox, ev.clientY - oy, f.w));
      const t = targetAt(ev.clientX, ev.clientY, { edges: true, strips: true, exclude: f.id });
      const l = dock.get().layout;
      dragState.set({ kind: 'group', panels: f.tabs, label: floatTitle(l, f, panelTitle), x: ev.clientX, y: ev.clientY, target: 'newFloat' in t ? null : t });
    },
    (_ev, ok) => {
      const d = dragState.get();
      dragState.set(null);
      if (!ok) {
        setFloatWindowBox(f.id, from);
        return;
      }
      if (d?.target) moveFloatTo(f.id, d.target);
      else flushDock();
    },
  );
}

const clampPos = (x: number, y: number, w: number) => ({ x: Math.max(0, Math.min(Math.round(x), window.innerWidth - Math.min(w, 120))), y: Math.max(0, Math.min(Math.round(y), window.innerHeight - 36)) });

/**
 * Pointer down on the tool rail's grip. The rail leaves its place as soon as it's carried and follows the pointer as a
 * small window; over an edge band, letting go docks it on that side. Escape puts it back where it was.
 */
export function startToolsDrag(e: React.PointerEvent, grab: { x: number; y: number }): void {
  const was = dock.get().layout.tools;
  run(
    e,
    (ev) => {
      const x = Math.max(0, Math.min(ev.clientX - grab.x, window.innerWidth - 60));
      const y = Math.max(0, Math.min(ev.clientY - grab.y, window.innerHeight - 60));
      placeTools('float', { x, y }, false);
      const t = targetAt(ev.clientX, ev.clientY, { edges: true });
      dragState.set({ kind: 'tools', panels: [], label: 'Tools', x: ev.clientX, y: ev.clientY, target: null, toolsAt: 'zone' in t ? t.zone : 'float' });
    },
    (_ev, ok) => {
      const d = dragState.get();
      dragState.set(null);
      if (!ok) placeTools(was.place, { x: was.x, y: was.y });
      else if (d?.toolsAt && d.toolsAt !== 'float') placeTools(d.toolsAt);
      else flushDock();
    },
  );
}

/** Moves the floating tool rail with the arrow keys (the grip is a button). */
export function nudgeTools(dx: number, dy: number): void {
  const t = dock.get().layout.tools;
  placeTools('float', { x: Math.max(0, t.x + dx), y: Math.max(0, t.y + dy) });
}

/** Resizes a window from one of its edges or corners. `edge` says which sides move ('n', 'e', 's', 'w' and pairs). */
export function startFloatResize(e: React.PointerEvent, f: FloatWin, edge: string): void {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const x0 = e.clientX;
  const y0 = e.clientY;
  document.body.classList.add('dock-dragging');
  const MIN = { w: 220, h: 140 };
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    let { x, y, w, h } = f;
    if (edge.includes('e')) w = Math.max(MIN.w, f.w + dx);
    if (edge.includes('s')) h = Math.max(MIN.h, f.h + dy);
    if (edge.includes('w')) {
      w = Math.max(MIN.w, f.w - dx);
      x = f.x + f.w - w;
    }
    if (edge.includes('n')) {
      h = Math.max(MIN.h, f.h - dy);
      y = f.y + f.h - h;
    }
    setFloatWindowBox(f.id, { x: Math.round(x), y: Math.round(Math.max(0, y)), w: Math.round(Math.min(w, window.innerWidth)), h: Math.round(Math.min(h, window.innerHeight)) });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.classList.remove('dock-dragging');
    flushDock();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/** Words for the chip that follows the pointer. */
export function dropNote(d: DragState): string {
  if (d.kind === 'tools') return d.toolsAt && d.toolsAt !== 'float' ? `dock ${ZONE_WORDS[d.toolsAt]}` : 'floating';
  const t = d.target;
  if (!t) return d.kind === 'group' ? 'drop on an edge or a tab bar to dock it' : '';
  if ('newFloat' in t) return 'new window';
  if ('zone' in t) return t.split ? `new group ${SPLIT_WORDS[t.zone][t.split]}` : `dock ${ZONE_WORDS[t.zone]}`;
  const f = dock.get().layout.floats.find((x) => x.id === t.float);
  return f ? `into ${floatTitle(dock.get().layout, f, panelTitle)}` : 'into that window';
}
