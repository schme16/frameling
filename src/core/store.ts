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
}

export interface UiState {
  frame: number;
  activeLayerId: Id | null;
  /** Selected shape ids on the active drawing. */
  selection: Id[];
  tool: ToolId;
  color: Color;
  brush: BrushSettings;
  playing: boolean;
  loopPlayback: boolean;
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
  patches: Patch[];
  inverse: Patch[];
  label: string;
  coalesce?: string;
  at: number;
}

type Listener = () => void;

const HISTORY_LIMIT = 300;
const COALESCE_MS = 1200;

function initialUi(doc: Doc): UiState {
  return {
    frame: 0,
    activeLayerId: doc.layers[doc.layers.length - 1]?.id ?? null,
    selection: [],
    tool: 'brush',
    color: '#1d1b26',
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
      this.undoStack.push({ patches, inverse, label, coalesce: opts.coalesce, at: now });
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

  /** Replaces the whole document (new or opened file). Clears history. */
  load(doc: Doc, filePath: string | null = null): void {
    this.undoStack = [];
    this.redoStack = [];
    this.state = { doc, ui: { ...initialUi(doc), filePath, color: this.state.ui.color, brush: this.state.ui.brush, tool: this.state.ui.tool } };
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
