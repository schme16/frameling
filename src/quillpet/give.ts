// Giving Quill a drawing. He keeps a small picture of it, not the drawing itself, so his things stay tiny and
// nothing you make depends on him.
import { store } from '../core/store';
import { thumbnailOf } from '../io/thumb';
import { activeArtboardName } from './where';
import type { PetThing } from './model';
import { tellQuill } from './store';
import { noteFuss } from './watch';

/** The picture he keeps is this many pixels on its long side. Small on purpose: his things live in localStorage. */
export const THING_SIZE = 72;

let n = 0;
const nextId = (): string => `t${Date.now().toString(36)}${(n++).toString(36)}`;

/** A small picture of the frame you're on, ready to be given. Undefined when it can't be drawn. */
export async function thingFromNow(at: number = Date.now()): Promise<PetThing | undefined> {
  const s = store().get();
  const picture = await thumbnailOf(s.doc, THING_SIZE, s.ui.frame);
  if (!picture) return undefined;
  return { id: nextId(), name: activeArtboardName(s.doc) ?? s.doc.name ?? 'A drawing', picture, givenAt: at };
}

/** Gives Quill the frame you're on. True when he got it. */
export async function giveToQuill(): Promise<boolean> {
  const thing = await thingFromNow();
  if (!thing) return false;
  tellQuill({ kind: 'gave', thing });
  noteFuss();
  return true;
}
