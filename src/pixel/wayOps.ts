// Changing how a sprite is built (as one undo step), and the things that follow a sprite's way: the second-board
// question, the layout that fits it, and Quill's moments. The conversions themselves are plain functions in way.ts.
import { findLayer } from '../core/doc';
import { currentChoice, registerChoice, withChoice } from '../core/choices';
import type { Doc, Id, SpriteWay } from '../core/format';
import { getCommand } from '../core/registry';
import { store } from '../core/store';
import { fitAllArtboards } from '../artboards/ops';
import { shareLayers, unshareLayers, whyNotShare, type SharedChange } from '../artboards/shared';
import { onToolEvent } from '../tools/toolEvents';
import { dock, inPixelWorkspace, stackPanelsIn, toggleCollapsed } from '../ui/dock';
import { locate } from '../ui/dockModel';
import { line } from '../ui/mascot/lines';
import { toast } from '../ui/toast';
import { inHarness } from './harness';
import { moment } from './moments';
import { boardCount, convertWay, isPixelDoc, totalFrames, wayOf, type Change } from './way';
import { isBlankDocQuick } from './blank';

/** Moves the open sprite to another way, as one undo step. Says what happened (or why not) in a toast. */
export function changeWay(to: SpriteWay, say = true): Change {
  const before = store().get().doc;
  if (!isPixelDoc(before)) return { ok: false, problem: 'This is not a pixel sprite.' };
  let result: Change = { ok: false, problem: 'Nothing changed.' };
  store().update('Change how this sprite is built', (d) => {
    result = convertWay(d as Doc, to);
  });
  const r = result as Change;
  if (!r.ok) {
    if (say) toast(r.problem, { kind: 'warn' });
    return r;
  }
  const { doc, ui } = store().get();
  const patch: { frame?: number; activeLayerId?: Id } = {};
  if (ui.frame > doc.length - 1) patch.frame = 0;
  if (!findLayer(doc, ui.activeLayerId) && doc.layers.length) patch.activeLayerId = doc.layers[doc.layers.length - 1].id;
  if (Object.keys(patch).length) store().setUi(patch);
  if (boardCount(doc) > 1) fitAllArtboards();
  else void getCommand('view.fit')?.run();
  if (say) toast(r.note, { kind: 'success' });
  return r;
}

/** "Make it move": a one-picture sprite becomes an animation with a few frames to play with. */
export function makeItMove(): void {
  const r = changeWay('animation', false);
  if (r.ok) {
    if (!moment('make-it-move', () => line('pixel.makeItMove'), 'session')) toast(r.note, { kind: 'success' });
  } else toast(r.problem, { kind: 'warn' });
}

// ---------------------------------------------------------------- a second board

registerChoice<'boards' | 'sheet'>({
  id: 'pixel.twoBoards',
  title: 'A second board in a one-picture sprite',
  question: line('pixel.twoBoards.ask'),
  category: 'Pixel art',
  help: 'pixel-ways',
  default: 'boards',
  quill: true,
  options: [
    { value: 'boards', label: 'Frames of one sprite', detail: 'Each board is a frame, and they play in order as one animation.' },
    { value: 'sheet', label: 'Two different sprites', detail: 'Each board is a sprite of its own, and they pack onto one sheet.' },
  ],
});

interface DocSource {
  get(): { doc: Doc };
  subscribe(fn: () => void): () => void;
}

/**
 * Notices a one-picture or animation sprite getting a second board (asks what the boards are, once, then remembers),
 * and a one-picture sprite getting a second frame (a little cheer). The sprite's way is stored from then on.
 */
export function watchSecondThings(s: DocSource): () => void {
  let prev = { id: s.get().doc.id, boards: boardCount(s.get().doc), length: s.get().doc.length };
  return s.subscribe(() => {
    const { doc } = s.get();
    const was = prev;
    prev = { id: doc.id, boards: boardCount(doc), length: doc.length };
    if (doc.id !== was.id || !isPixelDoc(doc) || doc.editing?.length) return;
    const stored = doc.sprite?.way;
    if (was.boards <= 1 && prev.boards > 1 && (!stored || stored === 'picture' || stored === 'animation')) {
      const say = (v: 'boards' | 'sheet') => {
        if (store().get().doc.id !== doc.id) return;
        store().update('Say how this sprite is built', (d) => {
          d.sprite = { way: v };
          // Frames of one sprite draw on one stack of layers; the board that was just made has nothing on it to lose.
          if (v === 'boards') shareLayers(d as Doc, { fresh: true });
        });
      };
      if (inHarness()) say(currentChoice<'boards' | 'sheet'>('pixel.twoBoards'));
      else withChoice<'boards' | 'sheet'>('pixel.twoBoards', say);
    } else if (was.length <= 1 && prev.length > 1 && prev.boards <= 1 && wayOf(doc) === 'animation' && (!stored || stored === 'picture')) {
      moment('frame2', () => line('pixel.frame2'), { doc: doc.id });
    }
  });
}

// ---------------------------------------------------------------- one stack of layers for the frames

export const SHARE_CHOICE = 'pixel.shareLayers';

registerChoice<'share' | 'leave' | 'later'>({
  id: SHARE_CHOICE,
  title: 'Frames on boards: one stack of layers',
  question: 'Every board of this sprite has layers of its own. Put the frames on one stack, so a layer you add once shows on every frame?',
  category: 'Pixel art',
  help: 'pixel-shared-layers',
  default: 'later',
  dismiss: 'later',
  options: [
    { value: 'share', label: 'One stack for all the frames', detail: 'Layers with the same name and kind join up, and every board keeps its own pixels. One undo step puts it back.' },
    { value: 'leave', label: 'Leave my files as they are', detail: 'Each board keeps layers of its own. You can put them on one stack later, from the Pixel tools menu.' },
    { value: 'later', label: 'Not now', detail: 'Ask again the next time a file like this opens.', once: true },
  ],
});

/** Frames on boards that still have a stack of layers per board, and could share one. */
export function canOfferShared(doc: Doc): boolean {
  return isPixelDoc(doc) && wayOf(doc) === 'boards' && boardCount(doc) > 1 && whyNotShare(doc) === null;
}

/** Puts the boards on one stack of layers, as one undo step. Says what happened (or why not) in a toast. */
export function shareLayersNow(say = true): SharedChange {
  let result: SharedChange = { ok: false, problem: 'Nothing changed.' };
  store().update('Put the frames on one stack of layers', (d) => {
    result = shareLayers(d as Doc);
  });
  const r = result as SharedChange;
  if (say) toast(r.ok ? r.note : r.problem, { kind: r.ok ? 'success' : 'warn' });
  return r;
}

/** Gives every board layers of its own again, as one undo step. */
export function unshareLayersNow(say = true): SharedChange {
  let result: SharedChange = { ok: false, problem: 'Nothing changed.' };
  store().update('Give each board its own layers', (d) => {
    result = unshareLayers(d as Doc);
  });
  const r = result as SharedChange;
  if (say) toast(r.ok ? r.note : r.problem, { kind: r.ok ? 'success' : 'warn' });
  return r;
}

/**
 * A file in the frames on boards way that has layers per board is never rewritten on its own. When one opens (or a sheet
 * becomes frames on boards) Frameling asks once, and remembers: put them on one stack, or leave them.
 */
export function watchSharedOffer(s: DocSource): () => void {
  let last = { id: s.get().doc.id, way: wayOf(s.get().doc) };
  return s.subscribe(() => {
    const { doc } = s.get();
    const was = last;
    last = { id: doc.id, way: wayOf(doc) };
    if (doc.editing?.length || (doc.id === was.id && was.way === last.way)) return;
    if (last.way !== 'boards' || !canOfferShared(doc) || inHarness()) return;
    withChoice<'share' | 'leave' | 'later'>(SHARE_CHOICE, (v) => {
      // Still the same document, and still offering, by the time they answer.
      if (v === 'share' && store().get().doc.id === doc.id && canOfferShared(store().get().doc)) shareLayersNow();
    });
  });
}

// ---------------------------------------------------------------- the layout follows the way

export interface Fit {
  /** Fold the timeline away (nothing to scrub) or open it. */
  timeline: 'fold' | 'open';
  /** Two panels to stack in the right zone, the first over the second (the second with its own tabs kept), if any. */
  stack: [string, string] | null;
  /** How much of the zone the first of the two takes (missing = the dock's usual). A long list of boards asks for more. */
  topShare?: number;
}

/** Past this many boards the Artboards panel takes more of the right side, so more of its rows show. */
const MANY_BOARDS = 6;
const MANY_BOARDS_SHARE = 0.52;

/** What the workspace shows for each way: a picture folds the timeline; the board ways stack the Artboards panel over the Preview, so the Preview and its board strip stay in view. */
export function layoutFor(doc: Doc): Fit {
  const way = wayOf(doc);
  if (way === 'picture') return { timeline: 'fold', stack: null };
  if (way === 'animation') return { timeline: 'open', stack: null };
  const many = boardCount(doc) > MANY_BOARDS;
  return { timeline: totalFrames(doc) <= boardCount(doc) ? 'fold' : 'open', stack: ['artboards', 'preview'], ...(many ? { topShare: MANY_BOARDS_SHARE } : {}) };
}

export interface WayDock {
  inPixelWorkspace(): boolean;
  fold(timeline: boolean): void;
  stack(top: string, bottom: string, topShare?: number): void;
}

const realDock: WayDock = {
  inPixelWorkspace: () => inPixelWorkspace(),
  fold(on) {
    const at = locate(dock.get().layout, 'timeline');
    if (at && 'zone' in at) toggleCollapsed(at.zone, on);
  },
  stack: (top, bottom, share) => stackPanelsIn(top, bottom, 'right', share),
};

/**
 * In the Pixel workspace, the layout fits the sprite's way when a sprite opens and whenever its way changes. Nothing
 * else triggers it, so a panel you move yourself stays where you put it.
 */
export function watchWayLayout(s: DocSource, d: WayDock = realDock): () => void {
  let seen: { id: Id; way: SpriteWay } | null = null;
  const check = () => {
    const { doc } = s.get();
    if (!d.inPixelWorkspace() || !isPixelDoc(doc) || doc.editing?.length) return;
    const way = wayOf(doc);
    if (seen && seen.id === doc.id && seen.way === way) return;
    seen = { id: doc.id, way };
    const fit = layoutFor(doc);
    d.fold(fit.timeline === 'fold');
    if (fit.stack) d.stack(fit.stack[0], fit.stack[1], fit.topShare);
  };
  check();
  return s.subscribe(check);
}

// ---------------------------------------------------------------- Quill moments

/** A brand new empty sprite: a nudge to start. Brand new = made this session, not a file opened from disk. */
export function watchFirstPixel(s: DocSource): () => void {
  let last = s.get().doc.id;
  return s.subscribe(() => {
    const { doc } = s.get();
    if (doc.id === last) return;
    last = doc.id;
    if (isPixelDoc(doc) && isBlankDocQuick(doc)) moment('empty', () => line('pixel.empty'));
  });
}

/** Tool habits worth a cheer the first time: Alt for the eyedropper, and pixel perfect tidying a corner. */
export function watchToolMoments(): () => void {
  return onToolEvent((e) => {
    if (!inPixelWorkspace()) return;
    if (e === 'altPick') moment('altPick', () => line('pixel.altPick'));
    else if (e === 'perfectFix') moment('perfect', () => line('pixel.perfect'));
  });
}

export function installWayWatchers(s: DocSource): void {
  watchSecondThings(s);
  watchSharedOffer(s);
  watchWayLayout(s);
  watchFirstPixel(s);
  watchToolMoments();
}
