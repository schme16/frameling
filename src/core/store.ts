/**
 * The app's single store: the document (with undo and redo) plus UI state (no undo).
 *
 * Every change to the document goes through `update()`, which records immer patches for undo. Pass a `coalesce` key
 * for changes that arrive in a burst (dragging a slider, moving a shape) so they undo as one step.
 *
 * React components read with `useStore(selector)`.
 */
import { applyPatches, enablePatches, produceWithPatches, setAutoFreeze, type Draft, type Patch } from 'immer';
import { useSyncExternalStore } from 'react';
import type { BrushSettings, Color, Doc, Id } from './format';
import { DEFAULT_BRUSH, newDoc } from './doc';
import { existingSelection, followSelection, type FollowMemory } from './followSelection';

enablePatches();
// Pixel drawings hold typed arrays, which immer can't freeze; we never mutate state outside update() anyway.
// Under test and in the harnesses (?debug, unless &nofreeze) it is turned on instead, so a write in place into a
// committed document throws where it happens. The save keeps drawings' text between saves and relies on there being none.
const strict = import.meta.env?.MODE === 'test' || (typeof location !== 'undefined' && /[?&]debug\b/.test(location.search) && !/[?&]nofreeze\b/.test(location.search));
setAutoFreeze(strict);

export type ToolId = string;

/**
 * Something that keeps the document consistent after a change (a variation following its original, say): given the
 * document a change made, it returns a recipe for what else to change, or null. Its changes join the same undo step.
 */
export type Settler = (doc: Doc, ctx?: SettleContext) => ((draft: Draft<Doc>) => void) | null;
/** What a change did, for a settler that only wants to look at what it touched. */
export interface SettleContext {
  /** The patches of the change itself (not of earlier settlers). */
  patches: Patch[];
  /** The document before the change. */
  before: Doc;
}
const settlers: Settler[] = [];
export function registerSettler(fn: Settler): void {
  if (!settlers.includes(fn)) settlers.push(fn);
}

/**
 * Something that refuses a change that would be lost or would reach where it should not (editing what a variation
 * shares with its original): given the document before and after, it returns a plain sentence to say why, or null.
 * A refused change is dropped whole (nothing is recorded) and the sentence goes to the blocked handler.
 */
export type Guard = (before: Doc, next: Doc, patches: Patch[]) => string | null;
const guards: Guard[] = [];
let blockedHandler: (message: string) => void = () => {};
export function registerGuard(fn: Guard): void {
  if (!guards.includes(fn)) guards.push(fn);
}
/** Where a refused change's sentence goes (the app shows it as a note). */
export function onBlocked(fn: (message: string) => void): void {
  blockedHandler = fn;
}
/** Says a refusal's sentence the same way (for a change that is let through as nothing, not as a patch). */
export function reportBlocked(message: string): void {
  blockedHandler(message);
}

export interface OnionSettings {
  enabled: boolean;
  before: number;
  after: number;
  /** 0 to 1, opacity of the nearest onion frame (further ones fade). */
  opacity: number;
  beforeColor: Color;
  afterColor: Color;
  /** Tint the onion frames (true) or show them in their own colours (false). */
  tint: boolean;
  /** Count keys instead of frames, so held frames are skipped (missing = no). */
  keysOnly?: boolean;
  /** Also ghost the artboards either side of the open one, like frames (missing = no). */
  boards?: boolean;
  /**
   * Walk over the end of a clip into the next one (missing = no: ghosts stay inside the clip you are in). The answer to
   * the "Onion skin and clips" choice (src/timeline/choices.ts), kept here so the canvas can read it without asking.
   */
  acrossClips?: boolean;
}

export interface UiState {
  frame: number;
  activeLayerId: Id | null;
  /** Selected shape ids on the active drawing. */
  selection: Id[];
  tool: ToolId;
  /** The stroke colour: brush, pencil and pixel lines, and shape outlines. Never none (see `strokeOn`). */
  color: Color;
  /** The fill colour: shape insides and the paint bucket. null means none. */
  fillColor: Color | null;
  /** False when the stroke is set to none (shapes are drawn without an outline; the brush still uses `color`). */
  strokeOn: boolean;
  /** Which colour box the picker, swatches and eyedropper change, as in Illustrator. */
  activeWell: 'fill' | 'stroke';
  brush: BrushSettings;
  playing: boolean;
  loopPlayback: boolean;
  /** Play forward then backward (ping-pong) instead of jumping back to the start (missing = no). */
  pingPong?: boolean;
  onion: OnionSettings;
  /**
   * The light table: a frame (or one layer's drawing on it) shown faintly on every frame, to trace over. Not the
   * onion skin: it stays put while you move around. Missing or null = off.
   */
  lightTable?: { frame: number; layerId?: Id; opacity: number } | null;
  /** Viewport: zoom (1 = 100%) and pan (screen pixels of the stage's top-left). */
  zoom: number;
  panX: number;
  panY: number;
  /** The file this document was opened from or saved to, if any. */
  filePath: string | null;
  /** True when there are changes since the last save. */
  dirty: boolean;
}

export interface State {
  doc: Doc;
  ui: UiState;
}

/** How the document got from one value to the next, when it was by patches (an edit, Undo, Redo). For anything that mirrors it elsewhere (the second window). */
export interface DocChange {
  from: Doc;
  to: Doc;
  patches: Patch[];
}

interface HistoryEntry {
  /** Stays the same through undo and redo, so other parts can remember things about a step. */
  id: number;
  patches: Patch[];
  inverse: Patch[];
  label: string;
  coalesce?: string;
  at: number;
  /** Roughly how much memory this step holds, in bytes (pixel art makes heavy steps, a moved shape a light one). */
  weight: number;
}

/** One step of the history as the History panel shows it. */
export interface HistoryStep {
  id: number;
  label: string;
  at: number;
}

type Listener = () => void;

/** A document edited inside the open one (a tile), with the open document and its history put aside meanwhile. */
interface Nested {
  tag: string;
  parent: Doc;
  undo: HistoryEntry[];
  redo: HistoryEntry[];
  /** View and selection to go back to. */
  ui: Pick<UiState, 'frame' | 'activeLayerId' | 'selection' | 'zoom' | 'panX' | 'panY'>;
  /** The selection memory of the open document, handed back when the nested one closes. */
  follow: FollowMemory | null;
  /** The open document with the nested one's changes in it (pure: returns a new doc, or `parent` if nothing changed). */
  merge: (parent: Doc, nested: Doc) => Doc;
}

/** How many undo steps to keep when nobody has said otherwise: generous, and changeable in Preferences. */
export const DEFAULT_HISTORY_STEPS = 300;
/** The most and least you can set it to. */
export const HISTORY_STEPS_RANGE = { min: 20, max: 2000 };
/**
 * However many steps you ask for, the history stops growing past this much memory (a few hundred pixel-art steps can
 * each hold a whole layer). The newest steps always stay: at least this many, whatever they weigh.
 */
export const HISTORY_BYTES = 192 * 1024 * 1024;
const ALWAYS_KEEP = 10;

let historySteps = DEFAULT_HISTORY_STEPS;

/** Preferences says how many steps to keep. Lowering it drops the oldest ones straight away. */
export function setHistorySteps(n: number): void {
  historySteps = Math.round(Math.min(HISTORY_STEPS_RANGE.max, Math.max(HISTORY_STEPS_RANGE.min, n)));
  current?.trimHistory();
}

export function historyStepsNow(): number {
  return historySteps;
}

/** Roughly how much memory a patch value holds. Typed arrays and strings are what actually get big. */
export function weighValue(v: unknown, depth = 0): number {
  if (v === null || v === undefined || depth > 6) return 8;
  if (ArrayBuffer.isView(v)) return (v as ArrayBufferView).byteLength;
  if (typeof v === 'string') return v.length * 2;
  if (typeof v !== 'object') return 8;
  if (Array.isArray(v)) {
    let n = 16;
    for (const x of v) n += weighValue(x, depth + 1);
    return n;
  }
  let n = 16;
  for (const x of Object.values(v as Record<string, unknown>)) n += weighValue(x, depth + 1);
  return n;
}

const weighPatches = (list: Patch[]): number => list.reduce((n, p) => n + weighValue(p.value, 1) + 24, 0);
let nextEntryId = 1;
const COALESCE_MS = 1200;

export function initialUi(doc: Doc): UiState {
  return {
    frame: 0,
    activeLayerId: doc.layers[doc.layers.length - 1]?.id ?? null,
    selection: [],
    tool: 'brush',
    color: '#1d1b26',
    fillColor: '#ffc94a',
    strokeOn: true,
    activeWell: 'stroke',
    brush: { ...DEFAULT_BRUSH },
    playing: false,
    loopPlayback: true,
    onion: { enabled: false, before: 2, after: 1, opacity: 0.35, beforeColor: '#ff6f91', afterColor: '#4fd1a5', tint: true },
    zoom: 1,
    panX: 0,
    panY: 0,
    filePath: null,
    dirty: false,
  };
}

export class Store {
  private state: State;
  private listeners = new Set<Listener>();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private nested: Nested | null = null;
  private merged: { parent: Doc; child: Doc; out: Doc } | null = null;
  /** What the selection stands for while it follows across keys (see followSelection). */
  private follow: FollowMemory | null = null;
  private change: DocChange | null = null;
  /** The last change made by patches. It only counts when `from` is the document you hold and `to` is the one now showing; anything else was a whole new document. */
  lastChange(): DocChange | null {
    return this.change;
  }
  /** How many times a whole document has been put in (new or opened), so the canvas can refit even when it is the same file again. */
  loads = 0;

  constructor(doc: Doc = newDoc()) {
    this.state = { doc, ui: initialUi(doc) };
  }

  get(): State {
    return this.state;
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private loadListeners = new Set<() => void>();

  /** Called whenever a whole document is loaded (new, opened, an example), but not for edits. */
  onLoad = (fn: () => void): (() => void) => {
    this.loadListeners.add(fn);
    return () => this.loadListeners.delete(fn);
  };

  private emit() {
    for (const fn of this.listeners) fn();
  }

  /**
   * Changes the document. `label` names the step in Undo/Redo ("Undo Draw stroke"). Changes with the same `coalesce`
   * key within a moment of each other merge into one undo step.
   */
  update(label: string, recipe: (doc: Draft<Doc>) => void, opts: { coalesce?: string } = {}): void {
    let [next, patches, inverse] = produceWithPatches(this.state.doc, recipe);
    if (!patches.length) return;
    const before = this.state.doc;
    for (const guard of guards) {
      const why = guard(before, next, patches);
      if (why) return blockedHandler(why);
    }
    const own = patches;
    for (const settle of settlers) {
      const fix = settle(next, { patches: own, before });
      if (!fix) continue;
      const [n2, p2, i2] = produceWithPatches(next, fix);
      if (!p2.length) continue;
      next = n2;
      patches = [...patches, ...p2];
      inverse = [...i2, ...inverse];
    }
    const now = Date.now();
    const last = this.undoStack[this.undoStack.length - 1];
    if (opts.coalesce && last && last.coalesce === opts.coalesce && now - last.at < COALESCE_MS) {
      last.patches.push(...patches);
      last.inverse.unshift(...inverse);
      last.at = now;
      last.weight += weighPatches(patches) + weighPatches(inverse);
    } else {
      this.undoStack.push({ id: nextEntryId++, patches, inverse, label, coalesce: opts.coalesce, at: now, weight: weighPatches(patches) + weighPatches(inverse) });
    }
    this.trimHistory();
    this.redoStack = [];
    this.change = { from: before, to: next, patches };
    this.state = { doc: next, ui: { ...this.state.ui, dirty: true } };
    this.emit();
  }

  /** Changes UI state (no undo). */
  setUi(patch: Partial<UiState> | ((ui: UiState) => Partial<UiState>)): void {
    const p = typeof patch === 'function' ? patch(this.state.ui) : patch;
    const was = this.state.ui;
    let ui = { ...was, ...p };
    // Moving the playhead (or playing) keeps the selection on the same shapes in the next key.
    if (p.frame !== undefined && p.frame !== was.frame && !('selection' in p) && ui.activeLayerId === was.activeLayerId) {
      const kept = followSelection(this.state.doc, ui.activeLayerId, was.selection, was.frame, p.frame, this.follow);
      if (kept) {
        ui = { ...ui, selection: kept.selection };
        this.follow = kept.memory;
      }
    }
    this.state = { ...this.state, ui };
    this.emit();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  undoLabel(): string | null {
    return this.undoStack[this.undoStack.length - 1]?.label ?? null;
  }

  /** Drops the oldest steps until the history is within the number you asked for, and within its memory budget. */
  trimHistory(): void {
    while (this.undoStack.length > historySteps) this.undoStack.shift();
    let weight = this.undoStack.reduce((n, e) => n + e.weight, 0);
    while (this.undoStack.length > ALWAYS_KEEP && weight > HISTORY_BYTES) weight -= this.undoStack.shift()!.weight;
  }

  /** How much memory the undo history is holding, roughly, in bytes. */
  historyWeight(): number {
    return this.undoStack.reduce((n, e) => n + e.weight, 0);
  }
  redoLabel(): string | null {
    return this.redoStack[this.redoStack.length - 1]?.label ?? null;
  }

  /** Ids of the steps Undo and Redo would take next (they keep their id as they move between the two). */
  historyIds(): { undo: number | null; redo: number | null } {
    return { undo: this.undoStack[this.undoStack.length - 1]?.id ?? null, redo: this.redoStack[this.redoStack.length - 1]?.id ?? null };
  }

  /** The steps you can see: done ones oldest first, then undone ones in the order Redo would put them back. */
  historyList(): { done: HistoryStep[]; undone: HistoryStep[] } {
    const view = (e: HistoryEntry): HistoryStep => ({ id: e.id, label: e.label, at: e.at });
    return { done: this.undoStack.map(view), undone: [...this.redoStack].reverse().map(view) };
  }

  /**
   * Goes to how the drawing stood just after the step `id` (or to before the first step, with `null`), by undoing or
   * redoing as many steps as it takes, in one go. The steps you came back past stay for Redo until you change something.
   * Returns false when there is no such step.
   */
  jumpToStep(id: number | null): boolean {
    const doneAt = id === null ? -1 : this.undoStack.findIndex((e) => e.id === id);
    let doc = this.state.doc;
    if (doneAt >= 0 || id === null) {
      if (this.undoStack.length - 1 === doneAt) return true;
      while (this.undoStack.length - 1 > doneAt) {
        const e = this.undoStack.pop()!;
        this.redoStack.push(e);
        doc = applyPatches(doc, e.inverse);
      }
    } else {
      if (!this.redoStack.some((e) => e.id === id)) return false;
      for (;;) {
        const e = this.redoStack.pop()!;
        this.undoStack.push({ ...e, coalesce: undefined });
        doc = applyPatches(doc, e.patches);
        if (e.id === id) break;
      }
    }
    this.afterHistory(doc);
    return true;
  }

  /** The drawing as it stood just after the step `id` (or before the first one, with `null`), without changing anything. */
  docAtStep(id: number | null): Doc | null {
    let doc = this.state.doc;
    const doneAt = id === null ? -1 : this.undoStack.findIndex((e) => e.id === id);
    if (doneAt >= 0 || id === null) {
      for (let i = this.undoStack.length - 1; i > doneAt; i--) doc = applyPatches(doc, this.undoStack[i].inverse);
      return doc;
    }
    const at = this.redoStack.findIndex((e) => e.id === id);
    if (at < 0) return null;
    for (let i = this.redoStack.length - 1; i >= at; i--) doc = applyPatches(doc, this.redoStack[i].patches);
    return doc;
  }

  undo(): void {
    const e = this.undoStack.pop();
    if (!e) return;
    this.redoStack.push(e);
    this.afterHistory(applyPatches(this.state.doc, e.inverse), e.inverse);
  }

  redo(): void {
    const e = this.redoStack.pop();
    if (!e) return;
    this.undoStack.push({ ...e, coalesce: undefined });
    this.afterHistory(applyPatches(this.state.doc, e.patches), e.patches);
  }

  /** Takes the document Undo or Redo made, keeping the selected shapes that are still there. */
  private afterHistory(doc: Doc, patches?: Patch[]): void {
    const ui = this.state.ui;
    if (patches) this.change = { from: this.state.doc, to: doc, patches };
    const keep = existingSelection(doc, ui.activeLayerId, ui.frame, ui.selection);
    this.state = { doc, ui: { ...ui, dirty: true, selection: keep.length === ui.selection.length ? ui.selection : keep } };
    this.emit();
  }

  /**
   * Edits another document for a while (a tile, say), with its own undo history. The open document and its history
   * wait until `exitNested()`. Meanwhile `rootDoc()` is the open document with the changes merged in, for saving.
   */
  enterNested(doc: Doc, opts: { tag: string; merge: (parent: Doc, nested: Doc) => Doc; ui?: Partial<UiState> }): void {
    if (this.nested) this.exitNested();
    const u = this.state.ui;
    this.nested = {
      tag: opts.tag,
      parent: this.state.doc,
      undo: this.undoStack,
      redo: this.redoStack,
      ui: { frame: u.frame, activeLayerId: u.activeLayerId, selection: u.selection, zoom: u.zoom, panX: u.panX, panY: u.panY },
      follow: this.follow,
      merge: opts.merge,
    };
    this.undoStack = [];
    this.redoStack = [];
    this.follow = null;
    this.state = { doc, ui: { ...u, frame: 0, selection: [], activeLayerId: doc.layers[doc.layers.length - 1]?.id ?? null, playing: false, ...opts.ui } };
    this.emit();
  }

  /** Goes back to the open document. Returns the nested document as it was left (the caller merges it), or null. */
  exitNested(): Doc | null {
    const n = this.nested;
    if (!n) return null;
    const child = this.state.doc;
    this.nested = null;
    this.merged = null;
    this.undoStack = n.undo;
    this.redoStack = n.redo;
    this.follow = n.follow;
    this.state = { doc: n.parent, ui: { ...this.state.ui, ...n.ui, playing: false } };
    this.emit();
    return child;
  }

  /** What is being edited inside the open document ("tile:3"), or null. */
  nestedTag(): string | null {
    return this.nested?.tag ?? null;
  }

  /** The open document as it would be saved: with whatever is being edited inside it (a tile) merged in. */
  rootDoc(): Doc {
    const n = this.nested;
    if (!n) return this.state.doc;
    const m = this.merged;
    if (m && m.parent === n.parent && m.child === this.state.doc) return m.out;
    const out = n.merge(n.parent, this.state.doc);
    this.merged = { parent: n.parent, child: this.state.doc, out };
    return out;
  }

  /** Replaces the whole document (new or opened file). Clears history. */
  load(doc: Doc, filePath: string | null = null): void {
    this.nested = null;
    this.merged = null;
    this.follow = null;
    this.undoStack = [];
    this.redoStack = [];
    this.loads++;
    const u = this.state.ui;
    this.state = { doc, ui: { ...initialUi(doc), filePath, color: u.color, fillColor: u.fillColor, strokeOn: u.strokeOn, activeWell: u.activeWell, brush: u.brush, tool: u.tool, loopPlayback: u.loopPlayback, pingPong: u.pingPong, onion: u.onion } };
    this.emit();
    for (const fn of this.loadListeners) fn();
  }

  /** Gives the open document a new id (no undo step), for a Save as copy that starts its own version history. */
  setDocId(id: string): void {
    if (this.nested) {
      this.nested.parent = { ...this.nested.parent, id };
      this.merged = null;
    } else this.state = { ...this.state, doc: { ...this.state.doc, id } };
    this.emit();
  }

  markSaved(filePath: string): void {
    this.setUi({ filePath, dirty: false });
  }
}

let current = new Store();

/** The app's store. */
export function store(): Store {
  return current;
}

/** For tests: start from a fresh store. */
export function resetStore(doc?: Doc): Store {
  current = new Store(doc);
  return current;
}

/** Reads a slice of state in a React component and re-renders when it changes. Keep selectors cheap and stable. */
export function useStore<T>(selector: (s: State) => T): T {
  const s = store();
  return useSyncExternalStore(s.subscribe, () => selector(s.get()));
}
