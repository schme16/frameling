// Your own starters for the New drawing sheet: a set of Custom settings kept under a name, sitting beside Doodle, Square
// and the rest. This is simpler than templates (src/templates) on purpose: a template is a whole drawing with a picture
// and a file, a favourite is only a size, a frame rate and a few ticks, so it is a short list in the app's settings.
// That also means it rides along in the settings backup and follows you from drawing to drawing, which is the point.
//
// The same file keeps the last Custom settings you started a drawing with, so the form can begin from them.
import { currentChoice, registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';
import { cleanSpec, docFromCustom, startingSpec, type CustomSpec } from './presets';
import { createStore, readRaw, writeJson } from './mini';
import { formatSize, type Unit } from '../core/units';
import type { Doc } from '../core/format';

// ---------------------------------------------------------------- the choice

/** Does Custom start from the settings you used last time, or fresh? The usual is last time: it saves typing. */
export const CUSTOM_START_CHOICE = 'newDrawing.customStart';

registerChoice({
  id: CUSTOM_START_CHOICE,
  title: choiceWord('choice.newDrawing.customStart.title'),
  question: choiceWord('choice.newDrawing.customStart.question'),
  category: 'Files',
  help: 'new-document',
  default: 'last',
  // A setting more than a question: the usual is used, and Preferences > Behaviour changes it.
  silent: true,
  options: [
    { value: 'last', label: choiceWord('choice.newDrawing.customStart.last.label'), detail: choiceWord('choice.newDrawing.customStart.last.detail') },
    { value: 'fresh', label: choiceWord('choice.newDrawing.customStart.fresh.label'), detail: choiceWord('choice.newDrawing.customStart.fresh.detail') },
  ],
});

// ---------------------------------------------------------------- the list (pure)

/** A favourite: its name, and the Custom settings it stands for (animation included, so an animation setup stays one). */
export interface Favourite {
  id: string;
  name: string;
  spec: Omit<CustomSpec, 'name' | 'away'>;
}

export const MAX_FAVOURITES = 12;
export const MAX_FAVOURITE_NAME = 28;

/** A name as it is kept: spaces tidied, cut to length. Empty when nothing is in it. */
export function cleanFavouriteName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_FAVOURITE_NAME).trim();
}

/** A name that isn't taken (capitals ignored): "Film", then "Film 2", "Film 3". Never replaces a favourite quietly. */
export function uniqueFavouriteName(name: string, taken: readonly string[], base = 'My starter'): string {
  const root = cleanFavouriteName(name) || base;
  const has = (n: string) => taken.some((t) => t.toLowerCase() === n.toLowerCase());
  if (!has(root)) return root;
  for (let n = 2; ; n++) {
    const tail = ` ${n}`;
    const tryName = root.slice(0, MAX_FAVOURITE_NAME - tail.length).trim() + tail;
    if (!has(tryName)) return tryName;
  }
}

const forKeeping = (spec: Omit<CustomSpec, 'name'>): Favourite['spec'] => {
  const { away: _away, ...rest } = cleanSpec(spec);
  return rest;
};

/** What the name box starts with, from the settings: "1920 x 1080, 24 frames a second", "Pixel 32 x 32", "1920 x 1080 picture". */
export function suggestedName(spec: Omit<CustomSpec, 'name'>): string {
  const c = cleanSpec(spec);
  if (c.pixel) return `Pixel ${c.width} x ${c.height}${c.animate ? ' animation' : ''}`;
  return `${c.width} x ${c.height}${c.animate ? `, ${c.fps} fps` : ''}`;
}

/** The line under a favourite's name on its card, in the person's units. */
export function favouriteSize(f: Favourite, units: Unit): string {
  const s = cleanSpec(f.spec);
  if (s.pixel) return `${s.width} x ${s.height} pixels`;
  return units === 'px' ? `${s.width} x ${s.height}` : formatSize(s.width, s.height, units, s.dpi);
}

/** The words for the second line of a card: what the favourite makes besides the size. */
export function favouriteKind(f: Favourite): string {
  const s = cleanSpec(f.spec);
  const what = s.pixel ? 'Pixel art' : 'Drawing';
  return s.animate ? `${what}, ${s.fps} frames a second` : `${what}, one picture`;
}

/** Reads a saved list. Damaged entries are left out, names are made unique, ids are made unique, and the list keeps to its limit. */
export function sanitizeFavourites(raw: unknown): Favourite[] {
  if (!Array.isArray(raw)) return [];
  const out: Favourite[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_FAVOURITES) break;
    if (!item || typeof item !== 'object') continue;
    const r = item as { id?: unknown; name?: unknown; spec?: unknown };
    if (!r.spec || typeof r.spec !== 'object') continue;
    const idIn = typeof r.id === 'string' ? r.id : '';
    const id = idIn && !ids.has(idIn) ? idIn : `f${out.length}x${ids.size}`;
    const spec = forKeeping(r.spec as Omit<CustomSpec, 'name'>);
    const name = uniqueFavouriteName(cleanFavouriteName(r.name) || suggestedName(spec), out.map((f) => f.name));
    ids.add(id);
    out.push({ id, name, spec });
  }
  return out;
}

/** Adds a favourite at the end. Null when the list is full. The name is made unique rather than replacing one you have. */
export function addFavourite(list: readonly Favourite[], name: string, spec: Omit<CustomSpec, 'name'>, id: string): { list: Favourite[]; favourite: Favourite } | null {
  if (list.length >= MAX_FAVOURITES) return null;
  const kept = forKeeping(spec);
  const favourite: Favourite = { id, name: uniqueFavouriteName(name || suggestedName(kept), list.map((f) => f.name)), spec: kept };
  return { list: [...list, favourite], favourite };
}

export function renameFavourite(list: readonly Favourite[], id: string, name: string): Favourite[] {
  const clean = cleanFavouriteName(name);
  if (!clean) return [...list];
  return list.map((f) => (f.id === id ? { ...f, name: uniqueFavouriteName(clean, list.filter((x) => x.id !== id).map((x) => x.name)) } : f));
}

export const removeFavourite = (list: readonly Favourite[], id: string): Favourite[] => list.filter((f) => f.id !== id);

/** Moves a favourite one place along (-1 earlier, 1 later). At either end it stays put. */
export function moveFavourite(list: readonly Favourite[], id: string, by: -1 | 1): Favourite[] {
  const i = list.findIndex((f) => f.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Puts a removed favourite back where it was (for Undo on the toast). */
export function restoreFavourite(list: readonly Favourite[], fav: Favourite, at: number): Favourite[] {
  if (list.some((f) => f.id === fav.id)) return [...list];
  const out = [...list];
  out.splice(Math.max(0, Math.min(out.length, at)), 0, fav);
  return out.slice(0, MAX_FAVOURITES);
}

/** The Custom settings a favourite stands for, with the name back at Untitled (like Doodle, a drawing named after a card is worse than a blank name). */
export const specOfFavourite = (f: Favourite): CustomSpec => startingSpec(f.spec);

/** A drawing from a favourite. */
export const docFromFavourite = (f: Favourite): Doc => docFromCustom(specOfFavourite(f));

// ---------------------------------------------------------------- the kept state

const KEY = 'frameling.newDrawing.v1';

interface Kept {
  /** The settings you last started a Custom drawing with, without the name. */
  last: Omit<CustomSpec, 'name'> | null;
  favourites: Favourite[];
}

function load(): Kept {
  const raw = readRaw<{ last?: unknown; favourites?: unknown } | null>(KEY, null);
  return { last: raw && raw.last && typeof raw.last === 'object' ? cleanSpec(raw.last) : null, favourites: sanitizeFavourites(raw?.favourites) };
}

export const newDrawingKept = createStore<Kept>(load());

const keep = (next: (k: Kept) => Kept) => {
  newDrawingKept.set((k) => next(k));
  writeJson(KEY, newDrawingKept.get());
};

/** The spec the Custom form should open with: your last settings (name back at Untitled), or the first-time ones if you asked for fresh. */
export function customStart(): CustomSpec {
  return startingSpec(currentChoice<'last' | 'fresh'>(CUSTOM_START_CHOICE) !== 'fresh' ? newDrawingKept.get().last : null);
}

/** Remembers what a Custom drawing was started with. */
export function rememberCustom(spec: CustomSpec): void {
  const { name: _name, ...rest } = spec;
  keep((k) => ({ ...k, last: cleanSpec(rest) }));
}

export const favourites = (): Favourite[] => newDrawingKept.get().favourites;

let counter = 0;
const newId = () => `fav${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Saves the settings as a favourite. Null when the list is full. */
export function saveFavourite(name: string, spec: Omit<CustomSpec, 'name'>): Favourite | null {
  const r = addFavourite(favourites(), name, spec, newId());
  if (!r) return null;
  keep((k) => ({ ...k, favourites: r.list }));
  return r.favourite;
}

export const renameFavouriteKept = (id: string, name: string): void => keep((k) => ({ ...k, favourites: renameFavourite(k.favourites, id, name) }));
export const moveFavouriteKept = (id: string, by: -1 | 1): void => keep((k) => ({ ...k, favourites: moveFavourite(k.favourites, id, by) }));

/** Takes one away; returns a way to put it back, for Undo on the toast. */
export function removeFavouriteKept(id: string): (() => void) | null {
  const list = favourites();
  const at = list.findIndex((f) => f.id === id);
  if (at < 0) return null;
  const fav = list[at];
  keep((k) => ({ ...k, favourites: removeFavourite(k.favourites, id) }));
  return () => keep((k) => ({ ...k, favourites: restoreFavourite(k.favourites, fav, at) }));
}

export const _resetFavouritesForTests = (): void => newDrawingKept.set({ last: null, favourites: [] });
