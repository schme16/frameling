/**
 * Copy, cut and paste for drawing keys on the timeline, on the store: the commands, the toasts, and the one question
 * (what a paste does to drawings it lands on). The maths is in frameClip.ts.
 *
 * Ctrl+C, Ctrl+X and Ctrl+V do this while the frames have focus (Grid.tsx), and copy shapes on the canvas otherwise.
 */
import { registerChoice, withChoice } from '../core/choices';
import type { Doc, Id } from '../core/format';
import { findLayer } from '../core/doc';
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { keyConverter, sayConverted, type ConvertNotes } from '../clipboard/frames';
import { MAX_LENGTH, type Clash } from './edit-core';
import {
  clipFromFrame,
  clipFromRefs,
  framesWords,
  keysWords,
  landsOnKeys,
  pasteClip,
  sourceLayers,
  targetLayers,
  whyNotKind,
  type FrameClip,
} from './frameClip';
import { deleteKeys } from './keys';
import { currentLayerId } from './ops';
import { clearKeys, pickKeys, tl } from './state';
import { celRef, type KeyRef } from './tracks';

export type PasteOverChoice = 'insert' | 'cover';

registerChoice<PasteOverChoice>({
  id: 'timeline.pasteOver',
  title: 'Pasting keys onto other keys',
  question: 'This paste lands on frames that already have drawings. Should they make room, or should the paste cover them?',
  options: [
    { value: 'insert', label: 'Make room', did: 'Moved the drawings in the way later.', detail: 'Nothing is lost. The drawings in the way move later, and the animation gets longer if it needs to.' },
    { value: 'cover', label: 'Paste over them', did: 'Covered the drawings in the way.', detail: 'The animation stays the same length. The drawings in the way are shortened or covered (Undo brings them back).' },
  ],
  default: 'insert',
  category: 'Timeline',
  help: 'timeline-copy-keys',
});

const clashFor = (c: PasteOverChoice): Clash => (c === 'cover' ? 'trim' : 'push');

let clip: FrameClip | null = null;

export const hasFrameClip = (): boolean => !!clip;
export const frameClipForTests = (): FrameClip | null => clip;
export function clearFrameClip(): void {
  clip = null;
}

const say = (msg: string, kind: 'info' | 'warn' = 'info'): void => void toast(msg, { kind, duration: 8000 });

interface Where {
  layerId?: Id;
  frame?: number;
}

/** Copies the keys (the picked ones, or the drawing at the playhead when none are picked). */
export function copyKeys(opts: Where & { refs?: KeyRef[] } = {}): FrameClip | null {
  const doc = store().get().doc;
  const refs = opts.refs ?? [...tl().keys];
  let made: FrameClip | null = null;
  let skipped = 0;
  if (refs.length) {
    const r = clipFromRefs(doc, refs);
    made = r.clip;
    skipped = r.skipped;
    if (!made) {
      say('Only drawing keys can be copied. Pick a drawing key (the diamond on the layer\'s own row), or click a frame that has a drawing.', 'warn');
      return null;
    }
  } else {
    const id = opts.layerId ?? currentLayerId();
    made = id ? clipFromFrame(doc, id, opts.frame ?? store().get().ui.frame) : null;
    if (!made) {
      say('There is no drawing on this frame to copy. Click a frame that has one, or pick some keys.', 'warn');
      return null;
    }
  }
  clip = made;
  const n = made.items.length;
  const lay = made.layers.length;
  say(`Copied ${keysWords(n)}${lay > 1 ? ` from ${lay} layers` : ''} (${framesWords(made.first, made.span)}). Click a frame and paste with Ctrl+V.${skipped ? ` ${skipped === 1 ? 'One picked key was' : `${skipped} picked keys were`} left out: only drawing keys are copied.` : ''}`);
  return made;
}

/** Copies, then takes the keys away. */
export function cutKeys(opts: Where & { refs?: KeyRef[] } = {}): void {
  const doc = store().get().doc;
  const made = copyKeys(opts);
  if (!made) return;
  const refs: KeyRef[] = [];
  for (const it of made.items) {
    const layer = findLayer(doc, made.layers[it.layer].id);
    const cel = layer?.cels.find((c) => c.start === made.first + it.offset);
    if (layer && cel) refs.push(celRef(layer.id, cel.id));
  }
  const o = deleteKeys(refs);
  if (o.ok) clearKeys();
  else if (o.why) say(o.why, 'warn');
}

/** Pastes with the first key on `frame` (the playhead) of the active layer, or, in place, where the keys were. */
export function pasteKeys(opts: Where & { inPlace?: boolean; atEnd?: boolean } = {}): void {
  const c = clip;
  if (!c) return say('There are no keys to paste yet. Copy some first: pick them and press Ctrl+C.', 'warn');
  const doc: Doc = store().get().doc;
  // After the last drawing on the layer: the playhead can't go past the end of the animation, so this is how to add on to it.
  const last = findLayer(doc, opts.layerId ?? currentLayerId())?.cels.at(-1);
  const at = opts.inPlace ? c.first : opts.atEnd ? (last ? last.start + last.length : 0) : (opts.frame ?? store().get().ui.frame);
  const t = opts.inPlace ? sourceLayers(doc, c) : targetLayers(doc, c, opts.layerId ?? currentLayerId());
  if (!t.ok) return say(t.why, 'warn');
  if (at + c.span > MAX_LENGTH) return say(`That would run past the longest an animation can be (${MAX_LENGTH} frames).`, 'warn');
  const locked = t.layers.find((l) => l.locked);
  if (locked) return say(`${locked.name} is locked. Unlock it (the padlock) to paste on it.`, 'warn');
  for (let i = 0; i < c.layers.length; i++) {
    const why = whyNotKind(c.layers[i], t.layers[i]);
    if (why) return say(why, 'warn');
  }
  const layers = t.layers;
  const go = (clash: Clash): void => {
    const notes: ConvertNotes = { softened: 0, offPage: 0 };
    let result: ReturnType<typeof pasteClip> | null = null;
    store().update(c.items.length === 1 ? 'Paste a key' : 'Paste keys', (d) => {
      const live = (d as Doc).layers.filter((l) => layers.some((x) => x.id === l.id));
      const ordered = layers.map((x) => live.find((l) => l.id === x.id)!);
      result = pasteClip(d as Doc, c, ordered, at, clash, keyConverter(doc, notes));
    });
    if (!result) return;
    const r: ReturnType<typeof pasteClip> = result;
    if (!r.made.length) return say('Nothing could be pasted there.', 'warn');
    store().setUi({ frame: at, activeLayerId: layers[0].id });
    pickKeys(r.made.map((m) => celRef(m.layerId, m.celId)));
    const converted = sayConverted(r.converted, notes);
    const left = r.left ? ` ${r.left === 1 ? 'One key' : `${r.left} keys`} couldn't be converted and was left out.` : '';
    say(`Pasted ${keysWords(r.made.length)} on ${framesWords(at, c.span)}.${converted ? ` ${converted}` : ''}${left}`, left ? 'warn' : 'info');
  };
  // In place means exactly there, over whatever is there now, so it never asks. After the last drawing there is nothing to land on.
  if (opts.inPlace || opts.atEnd) return go('trim');
  withChoice<PasteOverChoice>('timeline.pasteOver', (v) => go(clashFor(v)), { matters: landsOnKeys(c, layers, at), gently: true });
}

const picked = (): boolean => tl().keys.size > 0;
const canCopy = (): boolean => picked() || !!findLayer(store().get().doc, currentLayerId())?.cels.some((x) => store().get().ui.frame >= x.start && store().get().ui.frame < x.start + x.length);

registerCommands([
  {
    id: 'timeline.copyKeys',
    label: 'Copy the picked keys (or this drawing)',
    category: 'Timeline',
    description: 'Copy the keys you picked on the timeline, with how long each is held, or the drawing on this frame when none are picked. (Ctrl+C does this while the timeline has focus.)',
    help: 'timeline-copy-keys',
    keywords: ['copy frames', 'copy keyframes', 'clipboard', 'duplicate frames', 'repeat'],
    enabled: canCopy,
    run: () => void copyKeys(),
  },
  {
    id: 'timeline.cutKeys',
    label: 'Cut the picked keys (or this drawing)',
    category: 'Timeline',
    description: 'Copy the picked keys and take them off the timeline. A drawing that ran right up to them holds on over their frames. (Ctrl+X does this while the timeline has focus.)',
    help: 'timeline-copy-keys',
    keywords: ['cut frames', 'move frames', 'cut keyframes'],
    enabled: canCopy,
    run: () => cutKeys(),
  },
  {
    id: 'timeline.pasteKeys',
    label: 'Paste keys at the playhead',
    category: 'Timeline',
    description: 'Paste the copied keys with the first one on this frame of the active layer. Several layers land on this one and the ones below it. (Ctrl+V does this while the timeline has focus.)',
    help: 'timeline-copy-keys',
    keywords: ['paste frames', 'paste keyframes', 'repeat', 'later in time', 'another layer'],
    enabled: hasFrameClip,
    run: () => pasteKeys(),
  },
  {
    id: 'timeline.pasteKeysAtEnd',
    label: 'Paste keys after the last drawing',
    category: 'Timeline',
    description: 'Paste the copied keys on the active layer, right after its last drawing, so the animation gets longer. (The playhead can\'t go past the end, so this is the way to add on.)',
    help: 'timeline-copy-keys',
    keywords: ['paste at end', 'repeat cycle', 'add on', 'append', 'extend'],
    enabled: hasFrameClip,
    run: () => pasteKeys({ atEnd: true }),
  },
  {
    id: 'timeline.pasteKeysInPlace',
    label: 'Paste keys where they were',
    category: 'Timeline',
    description: 'Paste the copied keys on the layers and frames they came from, as new drawings, covering what is there now. Handy for putting a drawing back after changing it, or for copying across artboards.',
    help: 'timeline-copy-keys',
    keywords: ['paste in place', 'same frame', 'same layer'],
    enabled: hasFrameClip,
    run: () => pasteKeys({ inPlace: true }),
  },
]);

// These sit in Frames and motion > Copy, move and stretch keys (named in src/ui/menus.ts).
