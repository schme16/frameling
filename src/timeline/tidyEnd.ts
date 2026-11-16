// Where the animation really ends: the furthest thing that points at a frame. Plain maths on the document, so the
// timeline, the command and the tests all read it the same way.
import type { Doc } from '../core/format';
import { inOutRange } from './inout';

/**
 * The furthest frame anything reaches, stopping as soon as it reaches `stopAt`, because every caller here only cares
 * about the answer up to some line. A tidy document (the usual case, and every document with a key on its last
 * frame) answers from the first key it looks at, and keys are read newest first since a layer's keys run in order and
 * the furthest one is last. Structural edits ask this question two to four times, once of them on a draft where
 * every key it touches costs a proxy, so stopping early is the difference between reading one key and reading all of
 * them: on a 40 layer by 240 key animation that is 9600 keys a press.
 */
function furthest(doc: Doc, stopAt: number): number {
  let n = 1;
  if (n >= stopAt) return n;
  for (const layer of doc.layers) {
    const cels = layer.cels;
    for (let i = cels.length - 1; i >= 0; i--) {
      const c = cels[i], e = c.start + c.length;
      if (e > n) { n = e; if (n >= stopAt) return n; }
    }
    for (const fx of layer.effects ?? []) for (const k of fx.keys ?? []) {
      if (k.frame + 1 > n) { n = k.frame + 1; if (n >= stopAt) return n; }
    }
  }
  for (const m of doc.markers) if (m.frame + 1 > n) { n = m.frame + 1; if (n >= stopAt) return n; }
  for (const c of doc.clips) {
    const e = Math.max(c.start, c.end) + 1;
    if (e > n) { n = e; if (n >= stopAt) return n; }
  }
  for (const a of doc.audio ?? []) if (a.start + 1 > n) { n = a.start + 1; if (n >= stopAt) return n; }
  const io = inOutRange(doc);
  if (io && io.end + 1 > n) n = io.end + 1;
  return n;
}

/**
 * The shortest the animation can be without losing or moving anything: the end of the furthest drawing (and its
 * hold), marker, clip, effect key, sound start and play range, and at least 1. Never longer than the animation is now.
 */
export function fitLength(doc: Doc): number {
  return Math.min(furthest(doc, doc.length), doc.length);
}

/**
 * Did the end of the animation come in past `was`? The same question as `fitLength(doc) < was` and the same answer,
 * but it stops looking the moment one thing still reaches that far, which is what an edit that only adds something
 * finds immediately.
 */
export function endCameIn(doc: Doc, was: number): boolean {
  return doc.length < was || furthest(doc, was) < was;
}

/** How many empty frames hang off the end (0 when the animation already ends where its content does). */
export function emptyTail(doc: Doc): number {
  return Math.max(0, doc.length - fitLength(doc));
}

/** Takes the empty frames off the end. Returns false when there were none. */
export function tidyEnd(doc: Doc): boolean {
  const n = fitLength(doc);
  if (n >= doc.length) return false;
  doc.length = n;
  return true;
}
