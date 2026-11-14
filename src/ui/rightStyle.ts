// How the right side is laid out, from the "Right side" preference (Preferences > General). Properties with a labelled
// rail is the default (picked on the board); the other two are options.
//   inspector  Properties: the settings for what you're doing as folding sections, the rest on a labelled rail
//   rail       every panel on the labelled rail, one at a time
//   tabs       tabs across the top as before, plus a Panels list
import { createStore, readJson, writeJson } from './mini';
import { getPrefs, subscribePrefs } from './prefs';

export type RightStyle = 'inspector' | 'rail' | 'tabs';
export const rightStyle = createStore<RightStyle>(getPrefs().rightSide);
subscribePrefs(() => {
  const want = getPrefs().rightSide;
  if (rightStyle.get() !== want) rightStyle.set(want);
});

// ---------------------------------------------------------------- folded sections

const FOLD_KEY = 'frameling.inspector.v1';
export const folded = createStore<string[]>(readJson<{ folded: string[] }>(FOLD_KEY, { folded: [] }).folded.filter((x) => typeof x === 'string'));
folded.subscribe(() => writeJson(FOLD_KEY, { folded: folded.get() }));

export function setFolded(id: string, on: boolean): void {
  folded.set((f) => (on ? (f.includes(id) ? f : [...f, id]) : f.filter((x) => x !== id)));
}
/** Folds every section in `ids` but one. */
export function onlyOpen(id: string, ids: string[]): void {
  folded.set((f) => [...new Set([...f.filter((x) => !ids.includes(x)), ...ids.filter((x) => x !== id)])]);
}
export function foldAll(ids: string[], on: boolean): void {
  folded.set((f) => (on ? [...new Set([...f, ...ids])] : f.filter((x) => !ids.includes(x))));
}

// ---------------------------------------------------------------- the panel list

/** Where the panel list is open (the button it hangs off), or null when it's shut. */
export const panelPicker = createStore<{ x: number; y: number; w: number; h: number } | null>(null);

/** Opens the panel list from its button, or shuts it. */
export function togglePicker(from?: Element | null): void {
  if (panelPicker.get()) return panelPicker.set(null);
  const el = from ?? document.querySelector('[data-panels-button]');
  const r = el?.getBoundingClientRect();
  panelPicker.set(r ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: window.innerWidth - 80, y: 60, w: 0, h: 0 });
}
