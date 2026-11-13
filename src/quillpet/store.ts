// What Quill remembers, kept between runs. The thinking is all in model.ts; this is the live copy, the saving, and
// one place to tell him something happened.
import { createStore } from '../ui/mini';
import { apply, dayKey, daysBetween, FRESH_PET, letGo, markSeen, type DayCount, type PetEvent, type PetState } from './model';

export const PET_KEY = 'frameling.quill.v1';

/** Reads what's saved, throwing away anything that doesn't look right. A broken or missing entry just means you two
 *  are meeting for the first time, which is a fine thing to be. */
export function readPet(storage: Pick<Storage, 'getItem'> | null | undefined): PetState {
  try {
    const raw = storage?.getItem(PET_KEY);
    if (!raw) return FRESH_PET;
    const v = JSON.parse(raw) as Partial<PetState>;
    const num = (x: unknown, min = 0) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(min, x) : min);
    const strs = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
    return {
      metAt: num(v.metAt),
      closeness: num(v.closeness),
      days: num(v.days),
      lastDay: typeof v.lastDay === 'string' ? v.lastDay : '',
      things: Array.isArray(v.things)
        ? v.things
            .filter((t) => t && typeof t.id === 'string' && typeof t.picture === 'string')
            .map((t) => ({ id: t.id, name: typeof t.name === 'string' ? t.name : 'A drawing', picture: t.picture, givenAt: num(t.givenAt) }))
        : [],
      colours: strs(v.colours),
      seen: strs(v.seen),
    };
  } catch {
    return FRESH_PET;
  }
}

function storageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const petStore = createStore<PetState>(readPet(storageOrNull()));

/** How many of each kind have counted today. Not saved: a new day starts fresh anyway. */
let today: DayCount = {};

function save(): void {
  try {
    storageOrNull()?.setItem(PET_KEY, JSON.stringify(petStore.get()));
  } catch {
    // Storage full or switched off. He forgets this session, and everything else carries on.
  }
}

/** For the tests and the shot scripts: start from a known Quill. */
export function setPet(next: PetState, { save: write = false } = {}): void {
  petStore.set(next);
  today = {};
  if (write) save();
}

/** Tell Quill something happened. Gives back the points it was worth (0 when today's lot is already counted). */
export function tellQuill(ev: PetEvent, at: number = Date.now()): number {
  const { pet, count, gained } = apply(petStore.get(), today, ev, at);
  today = count;
  if (pet === petStore.get()) return gained;
  petStore.set(pet);
  save();
  return gained;
}

/** Give one of his things back, because you asked. */
export function letGoOf(id: string): void {
  petStore.set(letGo(petStore.get(), id));
  save();
}

/** Remember that a moment has been made a fuss of. */
export function noteSeen(id: string): void {
  const next = markSeen(petStore.get(), id);
  if (next === petStore.get()) return;
  petStore.set(next);
  save();
}

/** Days since he last saw you, by the day it fell on. 0 the first time you meet. */
export function daysAway(at: number = Date.now()): number {
  const last = petStore.get().lastDay;
  if (!last) return 0;
  const [y, m, d] = last.split('-').map(Number);
  if (!y || !m || !d) return 0;
  return daysBetween(new Date(y, m - 1, d).getTime(), at);
}

/** True when today hasn't been counted yet, so the "hello again" only happens once a day. */
export function firstVisitToday(at: number = Date.now()): boolean {
  return petStore.get().lastDay !== dayKey(at);
}
