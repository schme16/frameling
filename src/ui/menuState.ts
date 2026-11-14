// The menu changes a person has made, kept in this computer's storage (so a settings backup takes them along) and
// read by the menu bar. The shapes and the laying-over are in menuEdits.ts.
import { createStore, readRaw, writeJson } from './mini';
import { NO_EDITS, sanitizeMenuEdits, type MenuEdits } from './menuEdits';

export const MENUS_KEY = 'frameling.menus.v1';

const store = createStore<MenuEdits>(sanitizeMenuEdits(readRaw(MENUS_KEY, null)));

export const getMenuEdits = (): MenuEdits => store.get();
export const useMenuEdits = <S>(selector: (e: MenuEdits) => S): S => store.use(selector);
export const subscribeMenuEdits = store.subscribe;

/** Saves new edits. Whatever is passed is cleaned first, so a bad change can never leave the menu bar empty or broken. */
export function setMenuEdits(next: MenuEdits): void {
  const clean = sanitizeMenuEdits(next);
  store.set(clean);
  // Nothing changed means nothing saved: the key goes, as if the menus were never touched.
  try {
    if (clean === NO_EDITS || (!clean.bar && !clean.lists && !clean.titles && !clean.custom)) localStorage.removeItem(MENUS_KEY);
    else writeJson(MENUS_KEY, clean);
  } catch {
    // Storage blocked: the changes last for this session.
  }
}

/** For tests. */
export function resetMenuEdits(): void {
  setMenuEdits(NO_EDITS);
}
