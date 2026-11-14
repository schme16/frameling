// The mockup's own little state: which layout, how many brushes, what is open. Driven by the shot scripts through
// window.__brushMock, and by clicks in the mockups themselves.
import { useSyncExternalStore } from 'react';
import { store } from '../../core/store';
import { FAVOURITE_IDS, makeLibrary, RECENT_IDS, type MockBrush } from './library';

export type Layout = 'A' | 'B' | 'C' | 'D' | 'P';
/** Round two, the dropdown picker: how a row looks. */
export type Rows = 'tip' | 'sample' | 'two';

export interface MockState {
  layout: Layout;
  n: number;
  activeId: string;
  query: string;
  open: boolean;
  /** The group shown in a drawer or pop-over. */
  group: string;
  /** Folders open in the panel layout. */
  folders: string[];
  recent: string[];
  /** Picker (P): the row style, the row size slider (0.6 to 1.5), and the open groups (null: Recent and the current brush's). */
  rows: Rows;
  rowScale: number;
  opened: string[] | null;
}

let state: MockState = { layout: 'A', n: 4, activeId: 'starter:ink', query: '', open: false, group: 'Recent', folders: [], recent: RECENT_IDS, rows: 'tip', rowScale: 1, opened: null };
const listeners = new Set<() => void>();

export const mockState = (): MockState => state;
export function setMock(patch: Partial<MockState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const useMock = (): MockState =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );

export const libraryOf = (n: number): MockBrush[] => makeLibrary(n);
export const favouritesOf = (lib: MockBrush[]): MockBrush[] => FAVOURITE_IDS.map((id) => lib.find((b) => b.id === id)).filter((b): b is MockBrush => !!b);
export const recentsOf = (lib: MockBrush[], recent: string[]): MockBrush[] => recent.map((id) => lib.find((b) => b.id === id)).filter((b): b is MockBrush => !!b);

/** Search as people expect: every word, anywhere in the name or the group, capitals ignored. */
export function matches(lib: readonly MockBrush[], query: string): MockBrush[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...lib];
  return lib.filter((b) => words.every((w) => `${b.name} ${b.group}`.toLowerCase().includes(w)));
}

export function pick(b: MockBrush): void {
  store().setUi((u) => ({ brush: { ...u.brush, ...b.brush } }));
  setMock({ activeId: b.id, recent: [b.id, ...state.recent.filter((r) => r !== b.id)].slice(0, 8) });
}
