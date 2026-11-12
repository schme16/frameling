/**
 * Asking the browser to keep Frameling's storage. Safari deletes a site's storage (the autosave copy, recent files,
 * preferences) after about a week without a visit, unless the site has been granted persistence (an installed web app
 * has it). The first autosave asks once per visit. If the answer is no, the person is told once, ever, so they can
 * save files to disk; after that it stays quiet.
 */

export interface PersistApi {
  persisted?(): Promise<boolean>;
  persist?(): Promise<boolean>;
}

export interface KeepDeps {
  /** navigator.storage, or undefined where the browser has none. */
  storage: PersistApi | undefined;
  /** Whether the one-time notice has been shown before, and a way to remember it. */
  seen: { get(): boolean; set(): void };
  /** Shows the notice. */
  tell(): void;
}

export type KeepOutcome = 'unsupported' | 'kept' | 'noticed' | 'quiet' | 'again';

/** Returns the function to call after each save: only the first call per page visit does anything. */
export function createStorageKeeper(deps: KeepDeps): () => Promise<KeepOutcome> {
  let started = false;
  return async () => {
    if (started) return 'again';
    started = true;
    const s = deps.storage;
    if (!s || typeof s.persist !== 'function') return 'unsupported';
    try {
      if ((await s.persisted?.()) || (await s.persist())) return 'kept';
    } catch {
      // A browser that refuses to answer is treated like one that said no.
    }
    if (deps.seen.get()) return 'quiet';
    deps.seen.set();
    deps.tell();
    return 'noticed';
  };
}

export const NOTICE_KEY = 'frameling.web.storageNotice';

export const STORAGE_NOTICE =
  "Your browser may clear Frameling's unsaved work if you don't visit for about a week. Save your drawings as files now and then, or add Frameling to your Dock or Home Screen so the browser keeps it.";

/** The remembered "already told them", kept in localStorage (and just for this visit if that isn't available). */
export function noticeMemory(store: Pick<Storage, 'getItem' | 'setItem'> | undefined): KeepDeps['seen'] {
  let mem = false;
  return {
    get() {
      try {
        return mem || store?.getItem(NOTICE_KEY) === '1';
      } catch {
        return mem;
      }
    },
    set() {
      mem = true;
      try {
        store?.setItem(NOTICE_KEY, '1');
      } catch {
        // Nowhere to keep it: it is remembered until the tab closes.
      }
    },
  };
}
