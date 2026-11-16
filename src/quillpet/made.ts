// What you have made, kept so his room can show it. The room only ever shows work you actually made: a drawing you
// drew in and saved. A template, an example or a file you opened and left alone never gets in. It is a small picture
// (a thumbnail drawn once, at the moment you save), never a live render, so having the room open costs a few small
// images and nothing else. Nothing here goes away because time passed or you were out: a very big pile only ever rolls
// the very oldest off once it passes a storage ceiling, and the room never shows more than a few at a time anyway.
// The pure parts (what counts, what is shown, the stand-in names) are tested without a window.
import { createStore } from '../ui/mini';
import type { Doc } from '../core/format';
import { isPixelDoc } from '../pixel/way';
import { displayPath, streamSafe } from '../core/streamSafe';

export type MadeKind = 'drawing' | 'sprite';

/** One thing of yours in his room. */
export interface Made {
  /** The document's own id, so saving the same drawing again updates it rather than adding a second. */
  id: string;
  name: string;
  kind: MadeKind;
  /** A small PNG data: URL. */
  picture: string;
  /** When you last saved it. */
  madeAt: number;
}

export const MADE_KEY = 'frameling.quill.made.v1';
/** How many he keeps at most. A storage ceiling, not a rule about time: each picture is a few KB. */
export const MAX_MADE = 120;
/** How many drawings hang on his wall at once. */
export const WALL_SLOTS = 3;
/** The longest side of the picture he keeps, in pixels. Enough for the wall at a 200% interface size. */
export const MADE_SIZE = 96;
/** A pixel document up to this many pixels on its long side is a sprite (a toy); a bigger one is a picture for the wall. */
export const SPRITE_MAX = 256;
/** The choice that switches this off. */
export const YOURS_CHOICE = 'quill.yours';

/** A sprite is pixel art at sprite size. Everything else you draw goes on the wall. */
export function kindOf(doc: Doc): MadeKind {
  return isPixelDoc(doc) && Math.max(doc.width, doc.height) <= SPRITE_MAX ? 'sprite' : 'drawing';
}

/** Newest first. */
const sortMade = (list: Made[]): Made[] => [...list].sort((a, b) => b.madeAt - a.madeAt);

/** Reads what is saved, throwing away anything that does not look right. Nothing saved means an empty room. */
export function readMade(storage: Pick<Storage, 'getItem'> | null | undefined): Made[] {
  try {
    const raw = storage?.getItem(MADE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const out: Made[] = [];
    for (const m of v as Partial<Made>[]) {
      if (!m || typeof m.id !== 'string' || typeof m.picture !== 'string' || !m.picture.startsWith('data:image/')) continue;
      out.push({
        id: m.id,
        name: typeof m.name === 'string' && m.name ? m.name : 'A drawing',
        kind: m.kind === 'sprite' ? 'sprite' : 'drawing',
        picture: m.picture,
        madeAt: typeof m.madeAt === 'number' && Number.isFinite(m.madeAt) ? m.madeAt : 0,
      });
    }
    return sortMade(out).slice(0, MAX_MADE);
  } catch {
    return [];
  }
}

/** Adds a new thing, or updates the one with the same id (saving a drawing again freshens its picture). Newest first. */
export function addMade(list: readonly Made[], item: Made): Made[] {
  return sortMade([item, ...list.filter((m) => m.id !== item.id)]).slice(0, MAX_MADE);
}

/** The drawings on the wall: your newest few. */
export const wallOf = (list: readonly Made[], slots = WALL_SLOTS): Made[] => list.filter((m) => m.kind === 'drawing').slice(0, slots);

/** The toy on the floor: your newest sprite, or none. */
export const toyOf = (list: readonly Made[]): Made | undefined => list.find((m) => m.kind === 'sprite');

/**
 * What each thing is called in his room, and its picture. Both can give a drawing away, so while stream-safe is on the
 * name becomes a plain stand-in ("My drawing 2") and the picture is left out. Display only: `made` is always the real one.
 */
export function shownMade(list: readonly Made[]): { made: Made; name: string; picture: string | undefined }[] {
  const on = streamSafe();
  return list.map((made, i) => ({
    made,
    // A picture of a past drawing can give it away, as in the lists of recent drawings, so while stream-safe it is left blank.
    picture: on ? undefined : made.picture,
    name: on ? displayPath(made.kind === 'sprite' ? 'sprite.png' : 'drawing.frameling', { n: list.length > 1 ? i + 1 : undefined }) : made.name,
  }));
}

function storageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const madeStore = createStore<{ list: Made[] }>({ list: readMade(storageOrNull()) });

function save(): void {
  try {
    storageOrNull()?.setItem(MADE_KEY, JSON.stringify(madeStore.get().list));
  } catch {
    // Storage full or switched off. The room is a little emptier this session, and everything else carries on.
  }
}

/** Puts one of yours in his room, and keeps it. */
export function keepMade(item: Made): void {
  madeStore.set({ list: addMade(madeStore.get().list, item) });
  save();
}

/** For the tests and the shot scripts: start from a known room. */
export function setMade(list: Made[], { save: write = false } = {}): void {
  madeStore.set({ list });
  if (write) save();
}
