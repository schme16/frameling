/**
 * Artboard actions on the app's store: each is one undo step. Also keeps the view steady when the open artboard
 * changes (by a click, the panel, undo or redo), and remembers the frame, layer and selection each artboard was left on.
 */
import type { Doc, Id } from '../core/format';
import { store, type Store } from '../core/store';
import { findLayer } from '../core/doc';
import { existingSelection } from '../core/followSelection';
import { leaveSymbol } from '../symbols/ops';
import { leaveTileEdit } from '../tiles/tileEdit';
import { getViewport, setView, zoomToDocRect } from '../canvas/controller';
import { fitView } from '../canvas/view';
import { lookingThrough } from '../camera/ops';
import { resizeCanvas, type Anchor } from '../canvas/resize';
import { toast } from '../ui/toast';
import {
  activeArtboard,
  activeId,
  addArtboard,
  allBounds,
  arrangeArtboards,
  artboardDoc,
  artboardLabelAt,
  artboardAt,
  artboardsOf,
  deleteArtboard,
  hasArtboards,
  duplicateArtboard,
  ensureArtboards,
  findArtboard,
  moveArtboard,
  putContent,
  renameArtboard,
  reorderArtboard,
  setArtboardBackground,
  setExportName,
  sizeOf,
  switchArtboard,
  takeContent,
  type NewArtboard,
} from './model';

/** Out of any symbol or tile being edited, so a change to the artboards lands on the document itself. */
function toTopLevel(): void {
  leaveTileEdit();
  const n = store().get().doc.editing?.length ?? 0;
  if (n) leaveSymbol(n);
}

// ---------------------------------------------------------------- keeping the view steady

const memory = new Map<Id, { frame: number; layer: Id | null; selection: Id[] }>();
let seen: { docId: string; active: Id; x: number; y: number } | null = null;

/** The frame an artboard that isn't open was left on (for drawing it on the pasteboard). */
export function rememberedFrame(id: Id, length: number): number {
  return Math.max(0, Math.min(length - 1, memory.get(id)?.frame ?? 0));
}

function onStore(): void {
  const s = store();
  if (s.nestedTag()) return;
  const { doc, ui } = s.get();
  if (doc.editing?.length) return;
  const a = activeArtboard(doc);
  const prev = seen;
  seen = { docId: doc.id, active: a.id, x: a.x, y: a.y };
  if (!prev || prev.docId !== doc.id) {
    memory.clear();
    return;
  }
  if (prev.active === a.id) return;
  // The stage is now the other artboard: move the view by the distance between them so nothing jumps.
  const old = findArtboard(doc, prev.active);
  const dx = (a.x - (old?.x ?? prev.x)) * ui.zoom;
  const dy = (a.y - (old?.y ?? prev.y)) * ui.zoom;
  const m = memory.get(a.id);
  const layer = m?.layer && findLayer(doc, m.layer) ? m.layer : (doc.layers[doc.layers.length - 1]?.id ?? null);
  const frame = Math.max(0, Math.min(doc.length - 1, m?.frame ?? 0));
  // What was selected here when it was left comes back, for the shapes that are still there (nothing for one never visited).
  const selection = m?.selection.length ? existingSelection(doc, layer, frame, m.selection) : [];
  s.setUi({ frame, activeLayerId: layer, selection, playing: false, panX: ui.panX + dx, panY: ui.panY + dy });
}

let installed: Store | null = null;
/** Hooks the store (once per store). */
export function installArtboards(): void {
  if (installed === store()) return;
  installed = store();
  store().subscribe(onStore);
  // The open artboard's frame, layer and selection, kept up to date so going back finds them.
  store().subscribe(() => {
    const s = store();
    if (s.nestedTag()) return;
    const { doc, ui } = s.get();
    if (doc.editing?.length || seen?.active !== activeId(doc)) return;
    memory.set(seen.active, { frame: ui.frame, layer: ui.activeLayerId, selection: ui.selection });
  });
}

/** For tests: forget what was seen. */
export function resetArtboardView(): void {
  seen = null;
  memory.clear();
}

// ---------------------------------------------------------------- actions

/** Opens an artboard to draw on. With `reveal`, the view moves to show it if it's out of sight. */
export function goToArtboard(id: Id, reveal = false): void {
  toTopLevel();
  installArtboards();
  onStore();
  const doc = store().get().doc;
  if (activeId(doc) === id || !findArtboard(doc, id)) return;
  const name = findArtboard(doc, id)!.name;
  store().update(`Go to "${name}"`, (d) => void switchArtboard(d as Doc, id));
  if (reveal) revealActive();
}

/**
 * The artboard being worked on is the open one, and that is the only thing the timeline, onion skin and every tool
 * read (the open artboard's content is the document's own fields), so following it is just opening the artboard a
 * press lands on: its body, or its name above it. Returns true when it opened another one.
 */
export function openArtboardUnder(p: { x: number; y: number }, tool: string): boolean {
  if (tool === 'artboard' || tool === 'hand' || tool === 'zoom') return false;
  const s = store();
  if (s.nestedTag()) return false;
  const { doc, ui } = s.get();
  if (!hasArtboards(doc) || doc.editing?.length || lookingThrough()) return false;
  if (p.x >= 0 && p.y >= 0 && p.x < doc.width && p.y < doc.height) return false;
  const a = activeArtboard(doc);
  const x = p.x + a.x;
  const y = p.y + a.y;
  const id = artboardAt(doc, x, y) ?? artboardLabelAt(doc, x, y, ui.zoom);
  if (!id || id === a.id) return false;
  goToArtboard(id);
  return activeId(store().get().doc) === id;
}

/** Moves the view to show the open artboard if any of it is out of sight. */
export function revealActive(): void {
  const { doc, ui } = store().get();
  const vp = getViewport();
  const x0 = ui.panX;
  const y0 = ui.panY;
  const x1 = x0 + doc.width * ui.zoom;
  const y1 = y0 + doc.height * ui.zoom;
  if (x0 >= 0 && y0 >= 0 && x1 <= vp.w && y1 <= vp.h) return;
  zoomToArtboard();
}

/** Fills the window with the open artboard. */
export function zoomToArtboard(id?: Id): void {
  if (id && id !== activeId(store().get().doc)) goToArtboard(id);
  const { doc } = store().get();
  const vp = getViewport();
  const px = doc.layers.reduce((m, l) => (l.kind === 'pixel' ? (m ? Math.min(m, l.pixelSize) : l.pixelSize) : m), 0);
  setView(fitView(vp.w, vp.h, doc.width, doc.height, 48, px));
}

/** Shows every artboard at once. */
export function fitAllArtboards(): void {
  const { doc } = store().get();
  const a = activeArtboard(doc);
  const b = allBounds(doc);
  // The view is measured from the open artboard's corner.
  zoomToDocRect({ x: b.x - a.x - 24, y: b.y - a.y - 24, w: b.w + 48, h: b.h + 48 });
}

/** Adds an artboard beside the others and opens it. */
export function newArtboard(o: NewArtboard = {}, open = true): Id | null {
  toTopLevel();
  installArtboards();
  onStore();
  let id: Id | null = null;
  store().update('New artboard', (d) => {
    id = addArtboard(d as Doc, o);
  });
  if (id && open) goToArtboard(id, true);
  return id;
}

export function duplicateArtboardById(id: Id = activeId(store().get().doc)): Id | null {
  toTopLevel();
  let nid: Id | null = null;
  store().update('Duplicate artboard', (d) => {
    nid = duplicateArtboard(d as Doc, id);
  });
  return nid;
}

export function deleteArtboardById(id: Id = activeId(store().get().doc)): boolean {
  toTopLevel();
  installArtboards();
  onStore();
  const doc = store().get().doc;
  if (artboardsOf(doc).length < 2) {
    toast("That's the only artboard, so it stays. Every document has at least one.");
    return false;
  }
  const name = findArtboard(doc, id)?.name ?? 'artboard';
  let ok = false;
  store().update(`Delete "${name}"`, (d) => {
    ok = deleteArtboard(d as Doc, id);
  });
  return ok;
}

export function renameArtboardById(id: Id, name: string): void {
  if (!name.trim() || findArtboard(store().get().doc, id)?.name === name.trim()) return;
  store().update('Rename artboard', (d) => renameArtboard(d as Doc, id, name));
}

export function setExportNameById(id: Id, name: string): void {
  store().update('Artboard export name', (d) => setExportName(d as Doc, id, name), { coalesce: `ab-export-${id}` });
}

export function reorderArtboardById(id: Id, to: number): void {
  store().update('Reorder artboards', (d) => reorderArtboard(d as Doc, id, to));
}

/** Moves an artboard on the pasteboard. Moving the open one moves the view with it, so it slides on screen. */
export function moveArtboardTo(id: Id, x: number, y: number, coalesce?: string): void {
  const s = store();
  const doc = s.get().doc;
  const a = findArtboard(doc, id);
  if (!a || (a.x === Math.round(x) && a.y === Math.round(y))) return;
  const open = activeId(doc) === id;
  const dx = Math.round(x) - a.x;
  const dy = Math.round(y) - a.y;
  s.update('Move artboard', (d) => moveArtboard(d as Doc, id, x, y), coalesce ? { coalesce } : {});
  if (open) {
    const ui = s.get().ui;
    s.setUi({ panX: ui.panX + dx * ui.zoom, panY: ui.panY + dy * ui.zoom });
    if (seen && seen.active === id) seen = { ...seen, x: a.x + dx, y: a.y + dy };
  }
}

export function setArtboardBackgroundById(id: Id, color: string | null): void {
  store().update('Artboard background', (d) => setArtboardBackground(d as Doc, id, color), { coalesce: `ab-bg-${id}` });
}

export function arrangeAll(columns = 0): void {
  store().update('Line up artboards', (d) => arrangeArtboards(d as Doc, columns));
  // The open one may have moved: keep it where it is on screen by moving the view.
  const { doc } = store().get();
  const a = activeArtboard(doc);
  if (seen && seen.active === a.id && (seen.x !== a.x || seen.y !== a.y)) {
    const ui = store().get().ui;
    store().setUi({ panX: ui.panX + (a.x - seen.x) * ui.zoom, panY: ui.panY + (a.y - seen.y) * ui.zoom });
    seen = { ...seen, x: a.x, y: a.y };
  }
}

/**
 * Makes an artboard a new size. The anchor says which side the drawing stays on; `x`, `y` is its new corner on
 * the pasteboard (so dragging the left edge keeps the drawing where it is). Pixel art keeps whole art pixels.
 */
export function resizeArtboard(id: Id, w: number, h: number, anchor: Anchor = 'nw', at?: { x: number; y: number }): void {
  toTopLevel();
  installArtboards();
  onStore();
  const s = store();
  const doc = s.get().doc;
  const a = findArtboard(doc, id);
  if (!a) return;
  const size = sizeOf(doc, a);
  const w2 = Math.max(1, Math.round(w));
  const h2 = Math.max(1, Math.round(h));
  if (w2 === size.w && h2 === size.h && (!at || (at.x === a.x && at.y === a.y))) return;
  const open = activeId(doc) === id;
  const view = artboardDoc(doc, id);
  const out = w2 === size.w && h2 === size.h ? view : resizeCanvas({ ...view, drawings: doc.drawings }, w2, h2, anchor).doc;
  const nx = Math.round(at?.x ?? a.x);
  const ny = Math.round(at?.y ?? a.y);
  s.update('Artboard size', (d) => {
    ensureArtboards(d as Doc);
    const c = takeContent(out);
    const t = (d as Doc).artboards?.find((b) => b.id === id);
    if (open || !t?.content) putContent(d as Doc, c);
    else t.content = c;
    for (const [k, v] of Object.entries(out.drawings)) if (d.drawings[k] !== v) d.drawings[k] = v as (typeof d.drawings)[string];
    if (t) {
      t.x = nx;
      t.y = ny;
    }
  });
  if (open && (nx !== a.x || ny !== a.y)) {
    const ui = s.get().ui;
    s.setUi({ panX: ui.panX + (nx - a.x) * ui.zoom, panY: ui.panY + (ny - a.y) * ui.zoom });
    if (seen && seen.active === id) seen = { ...seen, x: nx, y: ny };
  }
}
