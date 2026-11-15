// The desktop side's memory of the stream overlay: its token (kept on disk so the address OBS has saved keeps working
// after a restart), whether it is switched on, and the last thing the page said was going on, cleaned. The rules for a
// request are in overlayHandler.ts; the page that is served is in overlayPage.ts.
//
// Files, in the app's own data folder:
//   stream-overlay-token.txt   the token, readable by this user only. Not the actions door key, and it opens nothing but the overlay.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cleanOverlayState, emptyOverlay, type OverlayState } from '../shared/streamOverlay';
import type { OverlayAsset, OverlayDeps } from './overlayHandler';
import { OVERLAY_CSS, OVERLAY_HTML, OVERLAY_JS } from './overlayPage';

export const TOKEN_FILE = 'stream-overlay-token.txt';

/** A new token: long enough to be unguessable, and safe in an address. */
export const makeOverlayToken = (): string => 'ov_' + randomBytes(18).toString('base64url');

const TOKEN_SHAPE = /^ov_[A-Za-z0-9_-]{20,}$/;

/** Replaces the token kept in `dir`. */
export function writeOverlayToken(dir: string, token: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, TOKEN_FILE);
  fs.writeFileSync(file, token + '\n', { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows has no such modes.
  }
  return token;
}

/** The token kept in `dir`, made (and written) the first time. */
export function readOrMakeOverlayToken(dir: string): string {
  try {
    const t = fs.readFileSync(path.join(dir, TOKEN_FILE), 'utf8').trim();
    if (TOKEN_SHAPE.test(t)) return t;
  } catch {
    // None yet.
  }
  return writeOverlayToken(dir, makeOverlayToken());
}

/** Words that must never appear on the overlay whatever the app says: who is signed in to this computer, and what it is called. */
export function privateWordsOf(user: string, host: string): string[] {
  return [...new Set([user, host.split('.')[0]].map((w) => w.trim()).filter((w) => w.length >= 4))];
}

/** The state with every one of `words` taken out (whole words, any case). */
export function withoutWords(state: OverlayState, words: readonly string[]): OverlayState {
  if (!words.length) return state;
  const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${esc.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  try {
    return JSON.parse(JSON.stringify(state).replace(re, '')) as OverlayState;
  } catch {
    return emptyOverlay();
  }
}

export interface OverlayHubOptions {
  dir: string;
  /** Where Quill's sprite sheet and frame list are (the folder holding mascot.png and mascot.json), or null. */
  mascotDir: string | null;
  privateWords?: string[];
  now?: () => number;
}

export interface OverlayHub extends OverlayDeps {
  setOn(on: boolean): void;
  isOn(): boolean;
  /** Takes what the app says is going on, cleans it, and remembers it. Returns nothing: the app learns nothing back. */
  push(raw: unknown): void;
  /** Makes a new token. The old address stops working at once. */
  roll(): string;
  /** The page loaded the files, once. */
  drop(): void;
}

export function createOverlayHub(o: OverlayHubOptions): OverlayHub {
  const now = o.now ?? Date.now;
  let on = false;
  let token: string | null = null;
  let last: { state: OverlayState; at: number } | null = null;
  const files = new Map<string, OverlayAsset | null>();
  const getToken = () => (token ??= readOrMakeOverlayToken(o.dir));

  const sheet = (name: string, type: string, file: string): OverlayAsset | null => {
    if (!o.mascotDir) return null;
    if (!files.has(name)) {
      try {
        files.set(name, { type, data: fs.readFileSync(path.join(o.mascotDir, file)) });
      } catch {
        files.set(name, null);
      }
    }
    return files.get(name) ?? null;
  };

  return {
    token: getToken,
    enabled: () => on,
    setOn(v) {
      on = v;
      if (!v) last = null;
    },
    isOn: () => on,
    latest: () => last,
    now,
    push(raw) {
      if (!on) return;
      last = { state: withoutWords(cleanOverlayState(raw, now()), o.privateWords ?? []), at: now() };
    },
    roll() {
      token = writeOverlayToken(o.dir, makeOverlayToken());
      return token;
    },
    drop() {
      files.clear();
    },
    asset(name) {
      switch (name) {
        case '':
          return { type: 'text/html; charset=utf-8', data: OVERLAY_HTML };
        case 'overlay.js':
          return { type: 'text/javascript; charset=utf-8', data: OVERLAY_JS };
        case 'overlay.css':
          return { type: 'text/css; charset=utf-8', data: OVERLAY_CSS };
        case 'quill.png':
          return sheet(name, 'image/png', 'mascot.png');
        case 'quill.json':
          return sheet(name, 'application/json; charset=utf-8', 'mascot.json');
        default:
          return null;
      }
    },
  };
}
