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

enablePatches();
// Pixel drawings hold typed arrays, which immer can't freeze; we never mutate state outside update() anyway.
setAutoFreeze(false);

export type ToolId = string;

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

interface HistoryEntry {
  /** Stays the same through undo and redo, so other parts can remember things about a step. */
  id: number;
  patches: Patch[];
  inverse: Patch[];
  label: string;
  coalesce?: string;
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
  /** The open document with the nested one's changes in it (pure: returns a new doc, or `parent` if nothing changed). */
  merge: (parent: Doc, nested: Doc) => Doc;
}

const HISTORY_LIMIT = 300;
let nextEntryId = 1;
const COALESCE_MS = 1200;

function initialUi(doc: Doc): UiState {
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

  private emit() {
    for (const fn of this.listeners) fn();
  }

  /**
   * Changes the document. `label` names the step in Undo/Redo ("Undo Draw stroke"). Changes with the same `coalesce`
   * key within a moment of each other merge into one undo step.
   */
  update(label: string, recipe: (doc: Draft<Doc>) => void, opts: { coalesce?: string } = {}): void {
    const [next, patches, inverse] = produceWithPatches(this.state.doc, recipe);
    if (!patches.length) return;
    const now = Date.now();
    const last = this.undoStack[this.undoStack.length - 1];
    if (opts.coalesce && last && last.coalesce === opts.coalesce && now - last.at < COALESCE_MS) {
      last.patches.push(...patches);
      last.inverse.unshift(...inverse);
      last.at = now;
    } else {
      this.undoStack.push({ id: nextEntryId++, patches, inverse, label, coalesce: opts.coalesce, at: now });
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    }
    this.redoStack = [];
    this.state = { doc: next, ui: { ...this.state.ui, dirty: true } };
    this.emit();
  }

  /** Changes UI state (no undo). */
  setUi(patch: Partial<UiState> | ((ui: UiState) => Partial<UiState>)): void {
    const p = typeof patch === 'function' ? patch(this.state.ui) : patch;
    this.state = { ...this.state, ui: { ...this.state.ui, ...p } };
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
  redoLabel(): string | null {
    return this.redoStack[this.redoStack.length - 1]?.label ?? null;
  }

  /** Ids of the steps Undo and Redo would take next (they keep their id as they move between the two). */
  historyIds(): { undo: number | null; redo: number | null } {
    return { undo: this.undoStack[this.undoStack.length - 1]?.id ?? null, redo: this.redoStack[this.redoStack.length - 1]?.id ?? null };
  }

  undo(): void {
    const e = this.undoStack.pop();
    if (!e) return;
    this.redoStack.push(e);
    this.state = { doc: applyPatches(this.state.doc, e.inverse), ui: { ...this.state.ui, dirty: true, selection: [] } };
    this.emit();
  }

  redo(): void {
    const e = this.redoStack.pop();
    if (!e) return;
    this.undoStack.push({ ...e, coalesce: undefined });
    this.state = { doc: applyPatches(this.state.doc, e.patches), ui: { ...this.state.ui, dirty: true, selection: [] } };
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
      merge: opts.merge,
    };
    this.undoStack = [];
    this.redoStack = [];
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
    this.undoStack = [];
    this.redoStack = [];
    const u = this.state.ui;
    this.state = { doc, ui: { ...initialUi(doc), filePath, color: u.color, fillColor: u.fillColor, strokeOn: u.strokeOn, activeWell: u.activeWell, brush: u.brush, tool: u.tool } };
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
