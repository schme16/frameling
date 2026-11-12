// The four ways to build a sprite, and moving between them. Pure functions on a document (an immer draft or a plain
// object), no DOM, so they can be tested.
//
//   picture    One picture: one board, one frame.
//   animation  An animation: one board, frames on the timeline, clips name the moves.
//   boards     Frames on boards: one artboard per frame, they play in order as one animation.
//   sheet      Sprites on a sheet: one artboard per sprite, each may have its own frames and clips.
//
// The way is kept in `doc.sprite.way` (optional). When it is missing, or no longer matches the file, it is worked
// out from the document (`inferWay`), so old files open unchanged.
import { current, isDraft } from 'immer';
import type { Artboard, ArtboardContent, Clip, Doc, Id, Layer, PixelLayer, SpriteWay } from '../core/format';
import { newDoc, newPixelDrawing, pruneDrawings, uid } from '../core/doc';
import { addArtboard, artboardsOf, contentOf, ensureArtboards, gapFor, sizeOf } from '../artboards/model';
import { START_FRAMES } from './units';

export interface WayInfo {
  id: SpriteWay;
  /** Plain name first. */
  name: string;
  /** The industry term, second. */
  term: string;
  /** What it is, in a sentence. */
  blurb: string;
  /** Tag on the chooser card, if any. */
  tag?: string;
}

export const WAYS: WayInfo[] = [
  { id: 'picture', name: 'One picture', term: 'single-image sprite', blurb: 'An icon, an item, a single tile.' },
  { id: 'animation', name: 'An animation', term: 'timeline frames', blurb: 'One sprite that moves. The frames live on the timeline, like in Aseprite.', tag: 'Like Aseprite' },
  { id: 'boards', name: 'Frames on boards', term: 'artboards as frames', blurb: 'Draw each frame on its own board, side by side. They play as one animation.' },
  { id: 'sheet', name: 'Sprites on a sheet', term: 'artboards as sprites', blurb: 'Every board is its own sprite (hero, bat, coin) and they pack onto one sheet.' },
];

export const wayInfo = (way: SpriteWay): WayInfo => WAYS.find((w) => w.id === way) ?? WAYS[1];

/** Pixel art: at least one pixel layer and no vector drawing layers (reference layers and rigs don't count). */
export function isPixelDoc(doc: Doc): boolean {
  let pixel = 0;
  for (const l of doc.layers) {
    if (l.kind === 'pixel') pixel++;
    else if (l.kind === 'vector' && !l.reference && !l.rig) return false;
  }
  return pixel > 0;
}

const GENERIC_NAME = /^(frame|board|artboard)\s*\d+$/i;

/** How many boards the document has (one when it has no artboards list). */
export const boardCount = (doc: Doc): number => Math.max(1, doc.artboards?.length ?? 1);

/** The length of every board, in order. */
function boardLengths(doc: Doc): number[] {
  return artboardsOf(doc).map((a) => (a.content ? a.content.length : doc.length));
}

/** Frames in all: the whole timeline of every board added up. */
export function totalFrames(doc: Doc): number {
  return boardLengths(doc).reduce((n, l) => n + l, 0);
}

/**
 * What a document looks like it is: one board is a picture (one frame) or an animation (more), several boards are
 * frames on boards when every one is a single frame with a plain name (Frame 3, Board 2), else sprites on a sheet.
 */
export function inferWay(doc: Doc): SpriteWay {
  if (boardCount(doc) <= 1) return doc.length > 1 ? 'animation' : 'picture';
  const generic = artboardsOf(doc).every((a) => GENERIC_NAME.test(a.name.trim()));
  return generic && boardLengths(doc).every((l) => l <= 1) ? 'boards' : 'sheet';
}

/** Does what the file says still match what is in it? A picture with a second frame or board is not a picture. */
function holds(doc: Doc, way: SpriteWay): boolean {
  const boards = boardCount(doc);
  if (way === 'picture') return boards <= 1 && doc.length <= 1;
  if (way === 'animation') return boards <= 1;
  return true;
}

/** The way this sprite is built: what the file says while it is true, else worked out from what is in it. */
export function wayOf(doc: Doc): SpriteWay {
  const said = doc.sprite?.way;
  return said && holds(doc, said) ? said : inferWay(doc);
}

/** What the mode chip says: "One picture", "Animation, 23 frames", "Frames on boards", "Sprites on a sheet". */
export function chipLabel(doc: Doc): string {
  const way = wayOf(doc);
  if (way === 'animation') return `Animation, ${doc.length} frame${doc.length === 1 ? '' : 's'}`;
  return wayInfo(way).name;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Quill's one sentence about how a sprite sheet is built. `mode` is what the Export dialog will do with the boards:
 * only the open one, each on its own, all in order as frames, or all packed as sprites.
 */
export function sheetSentence(doc: Doc, mode: 'one' | 'each' | 'joined' | 'atlas', ids: Id[] | null = null): string {
  const way = wayOf(doc);
  const list = artboardsOf(doc).filter((a) => !ids || ids.includes(a.id));
  const lengths = new Map(artboardsOf(doc).map((a, i) => [a.id, boardLengths(doc)[i]]));
  const frames = list.reduce((n, a) => n + (lengths.get(a.id) ?? 1), 0);
  if (boardCount(doc) <= 1 || mode === 'one') {
    const own = boardCount(doc) <= 1 ? doc.length : (lengths.get(artboardsOf(doc).find((a) => !a.content)?.id ?? '') ?? doc.length);
    if (way === 'picture' && own <= 1) return 'This is one picture, so the sheet has a single frame.';
    return `This sheet has 1 sprite${boardCount(doc) > 1 ? `, just the board you have open,` : ''} with ${plural(own, 'frame')}.`;
  }
  if (mode === 'each') return `This makes ${plural(list.length, 'sheet')}, one per board, named after each board.`;
  if (mode === 'joined') return `This sheet is ${plural(list.length, 'board')} played as frames of one sprite, ${plural(frames, 'frame')} in all.`;
  return `This sheet has ${plural(list.length, 'sprite')}, one per board, ${plural(frames, 'frame')} in all.`;
}

// ---------------------------------------------------------------- starting a sprite

export interface NewSprite {
  way: SpriteWay;
  /** The art size, in art pixels. */
  width: number;
  height: number;
  name?: string;
  fps?: number;
}

/** Document pixels in one art pixel, so a sprite fills about 512 document pixels whatever its size. */
export function pixelSizeFor(width: number, height: number): number {
  return Math.max(1, Math.floor(512 / Math.max(1, width, height)));
}

export const SIZE_CHOICES: { w: number; h: number }[] = [
  { w: 16, h: 16 },
  { w: 24, h: 24 },
  { w: 32, h: 32 },
  { w: 48, h: 48 },
  { w: 64, h: 64 },
];

/** The boards a sprite of each board way starts with. */
export const SHEET_BOARDS = ['Hero', 'Enemy', 'Item'];
export const FRAME_BOARDS = START_FRAMES.animation;

const blankCels = (doc: Doc, layer: PixelLayer, w: number, h: number, n: number): void => {
  for (let i = 0; i < n; i++) {
    const d = newPixelDrawing(w, h);
    doc.drawings[d.id] = d;
    layer.cels.push({ id: uid('c'), start: i, length: 1, drawingId: d.id });
  }
};

const idleClip = (end: number): Clip => ({ id: uid('q'), name: 'idle', start: 0, end, loop: true });

/** A ready document for one of the four ways. */
export function newSpriteDoc(o: NewSprite): Doc {
  const w = Math.max(1, Math.round(o.width));
  const h = Math.max(1, Math.round(o.height));
  const ps = pixelSizeFor(w, h);
  const way = o.way;
  const frames = way === 'picture' || way === 'boards' ? 1 : START_FRAMES.animation;
  const doc = newDoc({ name: o.name ?? 'Untitled pixel art', width: w * ps, height: h * ps, fps: o.fps ?? 12, length: frames, background: null, pixel: { pixelSize: ps } });
  blankCels(doc, doc.layers[0] as PixelLayer, w, h, frames);
  doc.layers[0].name = 'Sprite';
  if (way === 'animation') doc.clips.push(idleClip(frames - 1));
  if (way === 'boards' || way === 'sheet') {
    const names = way === 'boards' ? Array.from({ length: FRAME_BOARDS }, (_, i) => `Frame ${i + 1}`) : SHEET_BOARDS;
    const list = ensureArtboards(doc);
    list[0].name = names[0];
    for (const name of names.slice(1)) {
      const id = addArtboard(doc, { name, width: doc.width, height: doc.height, length: frames });
      const a = artboardsOf(doc).find((b) => b.id === id)!;
      const layer = a.content!.layers[0] as PixelLayer;
      layer.name = 'Sprite';
      blankCels(doc, layer, w, h, frames);
      if (way === 'sheet') a.content!.clips.push(idleClip(frames - 1));
    }
    if (way === 'sheet') doc.clips.push(idleClip(frames - 1));
  }
  doc.sprite = { way };
  return doc;
}

// ---------------------------------------------------------------- moving between the ways

export type Change = { ok: true; note: string } | { ok: false; problem: string };

const fail = (problem: string): Change => ({ ok: false, problem });
const plain = <T>(x: T): T => structuredClone(isDraft(x) ? (current(x as never) as T) : x);

/** Pixel layers only: tilemaps, drawn layers and cameras have no frame-by-frame copy to make. */
function onlyPixelLayers(layers: Layer[]): boolean {
  return layers.every((l) => l.kind === 'pixel');
}

/** The cel that covers a frame. */
const celAt = (l: Layer, f: number) => l.cels.find((c) => f >= c.start && f < c.start + c.length);

/** Timeline frames to boards: each frame becomes a board, side by side, named Frame 1, Frame 2 and so on. */
export function framesToBoards(d: Doc): Change {
  if (d.editing?.length) return fail('Leave the symbol you are editing first.');
  if (boardCount(d) > 1) return fail('This sprite already has boards.');
  if (!onlyPixelLayers(d.layers)) return fail('Only pixel layers can be split into boards. This sprite has other kinds of layer.');
  const n = Math.max(1, d.length);
  d.sprite = { way: 'boards' };
  if (n < 2) {
    ensureArtboards(d)[0].name = 'Frame 1';
    return { ok: true, note: 'It has one frame, so it is one board for now. Add boards for more frames.' };
  }
  const list = ensureArtboards(d);
  const first = list[0];
  const w = d.width;
  const gap = gapFor(w);
  const copyOf = (f: number): ArtboardContent => {
    const folders = new Map<Id, Id>();
    const folderCopy = (old: Id): Id => {
      let nf = folders.get(old);
      if (nf) return nf;
      nf = uid('f');
      folders.set(old, nf);
      const src = d.folders![old];
      d.folders![nf] = { ...plain(src), id: nf };
      if (src.parent && d.folders![src.parent]) d.folders![nf].parent = folderCopy(src.parent);
      return nf;
    };
    const layers: Layer[] = d.layers.map((l) => {
      const c = celAt(l, f);
      const copy: Layer = { ...plain({ ...l, cels: [] }), id: uid('l') };
      if (copy.folder) {
        if (d.folders?.[copy.folder]) copy.folder = folderCopy(copy.folder);
        else delete copy.folder;
      }
      const src = c ? d.drawings[c.drawingId] : undefined;
      if (c && src) {
        const nid = uid(src.id.charAt(0) || 'p');
        d.drawings[nid] = { ...plain(src), id: nid };
        copy.cels = [{ id: uid('c'), start: 0, length: 1, drawingId: nid }];
      }
      return copy;
    });
    return { width: d.width, height: d.height, background: d.background, length: 1, layers, clips: [], markers: [] };
  };
  const made: ArtboardContent[] = [];
  for (let f = 1; f < n; f++) made.push(copyOf(f));
  // The open board keeps frame 1: its cels are cut down to the one that shows then.
  for (const l of d.layers) {
    const c = celAt(l, 0);
    l.cels = c ? [{ id: c.id, start: 0, length: 1, drawingId: c.drawingId }] : [];
  }
  d.length = 1;
  d.clips = [];
  d.markers = [];
  delete d.inOut;
  delete d.flow;
  first.name = 'Frame 1';
  made.forEach((content, i) => {
    list.push({ id: uid('ab'), name: `Frame ${i + 2}`, x: first.x + (i + 1) * (w + gap), y: first.y, content });
  });
  pruneDrawings(d);
  return { ok: true, note: `${plural(n, 'frame')} became ${plural(n, 'board')}.` };
}

/** Boards to timeline frames: each board becomes frames on one timeline, in order. Layers are matched by name. */
export function boardsToFrames(d: Doc): Change {
  if (d.editing?.length) return fail('Leave the symbol you are editing first.');
  const list = artboardsOf(d);
  const fromSheet = wayOf(d) === 'sheet';
  if (list.length < 2) {
    delete d.artboards;
    delete d.activeArtboard;
    d.sprite = { way: 'animation' };
    return { ok: true, note: 'It is one board, so it is one animation already.' };
  }
  if (list.some((a) => a.variationOf)) return fail('Some boards are variations (linked copies). Detach them first, then try again.');
  const items = list.map((a) => ({ a, c: contentOf(d, a.id)! }));
  const base = items[0];
  for (const { a, c } of items) {
    if (!onlyPixelLayers(c.layers)) return fail(`${a.name} has layers that are not pixel layers, so its frames cannot go on a timeline.`);
    if (c.width !== base.c.width || c.height !== base.c.height) {
      const bw = sizeOf(d, base.a);
      return fail(`${a.name} is a different size (${c.width} x ${c.height}) from ${base.a.name} (${bw.w} x ${bw.h}). Frames on one timeline must all be the same size.`);
    }
  }
  const merged: Layer[] = [];
  const byName = new Map<string, PixelLayer>();
  const clips: Clip[] = [];
  const markers: ArtboardContent['markers'] = [];
  let offset = 0;
  for (const { a, c } of items) {
    const used = new Map<string, number>();
    for (const l of c.layers as PixelLayer[]) {
      const k0 = l.name.trim().toLowerCase();
      const nth = (used.get(k0) ?? 0) + 1;
      used.set(k0, nth);
      const key = `${k0}#${nth}`;
      let target = byName.get(key);
      if (target && target.pixelSize !== l.pixelSize) return fail(`The layer "${l.name}" has a different pixel size on ${a.name}, so the frames would not line up.`);
      if (!target) {
        target = { ...plain({ ...l, cels: [] }) } as PixelLayer;
        byName.set(key, target);
        merged.push(target);
      }
      for (const cel of l.cels) target.cels.push({ ...plain(cel), start: cel.start + offset });
    }
    // Clips and markers come along; a board of several frames with no clip of its own gets one named after it.
    for (const cl of c.clips) clips.push({ ...plain(cl), start: cl.start + offset, end: cl.end + offset });
    if (!c.clips.length && (fromSheet || c.length > 1)) clips.push({ id: uid('q'), name: a.name, start: offset, end: offset + c.length - 1, loop: true });
    for (const m of c.markers) markers.push({ ...plain(m), frame: m.frame + offset });
    offset += c.length;
  }
  for (const l of merged) l.cels.sort((x, y) => x.start - y.start);
  d.width = base.c.width;
  d.height = base.c.height;
  d.background = base.c.background;
  d.layers = merged;
  d.length = Math.max(1, offset);
  d.clips = clips;
  d.markers = markers;
  delete d.flow;
  delete d.audio;
  delete d.inOut;
  if (base.c.guides) d.guides = plain(base.c.guides);
  else delete d.guides;
  if (base.c.perspective) d.perspective = plain(base.c.perspective);
  else delete d.perspective;
  delete d.artboards;
  delete d.activeArtboard;
  d.sprite = { way: 'animation' };
  pruneDrawings(d);
  return { ok: true, note: `${plural(list.length, 'board')} became ${plural(d.length, 'frame')} on the timeline.` };
}

/** Moves a sprite to another way. Changes the document it is given; says what happened or why it cannot. */
export function convertWay(d: Doc, to: SpriteWay): Change {
  const from = wayOf(d);
  if (from === to) {
    d.sprite = { way: to };
    return { ok: true, note: 'It was already built that way.' };
  }
  const boards = boardCount(d);
  if (to === 'picture') {
    if (boards > 1) return fail(`This sprite has ${boards} boards. A single picture is one board with one frame, so take the boards away first, or pick Frames on boards or Sprites on a sheet.`);
    if (d.length > 1) return fail(`This sprite has ${d.length} frames. A single picture has just one, so pick An animation, or delete the extra frames first.`);
    d.sprite = { way: 'picture' };
    return { ok: true, note: 'One picture.' };
  }
  if (to === 'animation') {
    if (boards > 1) return boardsToFrames(d);
    if (d.length < START_FRAMES.animation && from === 'picture') {
      // Make it move: room for a few frames, and the first move named.
      d.length = START_FRAMES.animation;
      if (!d.clips.length) d.clips.push(idleClip(d.length - 1));
    }
    d.sprite = { way: 'animation' };
    return { ok: true, note: `Now it has ${plural(d.length, 'frame')} on the timeline.` };
  }
  if (to === 'boards') {
    if (boards === 1 && d.length > 1) return framesToBoards(d);
    d.sprite = { way: 'boards' };
    if (boards === 1) return { ok: true, note: 'Add a board for each frame.' };
    // Sprites on a sheet to frames on boards: the boards stay as they are and now play in order.
    return { ok: true, note: 'The boards now play in order as frames of one sprite.' };
  }
  d.sprite = { way: 'sheet' };
  return { ok: true, note: boards === 1 ? 'Add a board for each sprite.' : 'Each board is now a sprite of its own.' };
}

export interface WayChoice {
  way: SpriteWay;
  name: string;
  term: string;
  /** What choosing it will do, in plain words. */
  detail: string;
  /** Why it cannot be chosen now, when it cannot. */
  off?: string;
  /** This is how the sprite is built now. */
  current: boolean;
}

/** What each way would do to this sprite, for the "Change how this sprite is built" dialog. */
export function wayChoices(doc: Doc): WayChoice[] {
  const from = wayOf(doc);
  const boards = boardCount(doc);
  return WAYS.map((w) => {
    let detail: string;
    if (w.id === from) detail = 'How it is built now.';
    else if (w.id === 'picture') detail = 'One board, one frame. Nothing else changes.';
    else if (w.id === 'animation') detail = boards > 1 ? `The ${boards} boards become frames on one timeline, in order. Layers are matched by name.` : 'Frames live on the timeline. A picture gets room for four frames.';
    else if (w.id === 'boards') detail = boards === 1 && doc.length > 1 ? `Each of the ${doc.length} frames becomes its own board, side by side. Clips are not kept.` : 'Each frame has its own board. They play in order.';
    else detail = 'Each board is a sprite of its own, and they pack onto one sheet.';
    let off: string | undefined;
    if (w.id !== from) {
      // A dry run on a copy that shares everything it does not change.
      const draft: Doc = { ...doc };
      const r = convertWay(structuredCloneLite(draft), w.id);
      if (!r.ok) off = r.problem;
    }
    return { way: w.id, name: w.name, term: w.term, detail, off, current: w.id === from };
  });
}

/** A copy cheap enough for a dry run: the parts a conversion changes are copied, the drawings are shared. */
function structuredCloneLite(doc: Doc): Doc {
  const copy: Doc = { ...doc, layers: doc.layers.map((l) => ({ ...l, cels: [...l.cels] })), clips: [...doc.clips], markers: [...doc.markers], drawings: { ...doc.drawings } };
  if (doc.artboards) copy.artboards = doc.artboards.map((a) => ({ ...a } as Artboard));
  if (doc.folders) copy.folders = { ...doc.folders };
  return copy;
}
