// The mascot's source is a Frameling document (brand/mascot/mascot.frameling). These pure functions turn that
// document into the sprite sheet and frame list the app plays, and the icon document into the icon pictures.
// No DOM and no fs here: scripts/build-mascot.mjs does the disk, test/io/mascot-source.test.ts checks the maths.
import { gridPixels } from '../../src/core/pixelBounds';
import { celAt } from '../../src/core/doc';
import { artboardDoc, artboardsOf, arrangeArtboards, contentOf, hasArtboards, nextSpot, putContent } from '../../src/artboards/model';
import type { Artboard, ArtboardContent, Cel, Clip, Doc, Layer, PixelDrawing, PixelLayer, Swatch } from '../../src/core/format';
import { FORMAT_VERSION } from '../../src/core/format';
import type { RawImage } from '../../src/io/png';
import type { Sheet, SheetAnim } from '../../src/ui/mascot/timing';

/** One frame of the document is 10 ms, so every hold in the old frame list maps to whole frames. */
export const MASCOT_FPS = 100;
/** Frames per row in the built sheet. */
export const SHEET_COLUMNS = 8;

export interface BuiltSheet {
  image: RawImage;
  meta: Sheet;
  /** Things that were skipped, in plain words (a vector layer, a hold that did not land on whole ms). */
  warnings: string[];
}

export function blankImage(width: number, height: number): RawImage {
  return { width, height, pixels: new Uint8ClampedArray(width * height * 4) };
}

/** Copies a w x h block out of an image. */
export function crop(img: RawImage, x: number, y: number, w: number, h: number): RawImage {
  const out = blankImage(w, h);
  for (let r = 0; r < h; r++) {
    const from = ((y + r) * img.width + x) * 4;
    out.pixels.set(img.pixels.subarray(from, from + w * 4), r * w * 4);
  }
  return out;
}

/** Pastes `src` into `dst` at x, y, replacing what was there. */
export function paste(dst: RawImage, src: RawImage, x: number, y: number): void {
  for (let r = 0; r < src.height; r++) {
    const from = r * src.width * 4;
    dst.pixels.set(src.pixels.subarray(from, from + src.width * 4), ((y + r) * dst.width + x) * 4);
  }
}

/** Nearest-neighbour scale by a whole number. */
export function scaleNearest(img: RawImage, k: number): RawImage {
  if (k === 1) return { width: img.width, height: img.height, pixels: img.pixels.slice() };
  const out = blankImage(img.width * k, img.height * k);
  const src = new Uint32Array(img.pixels.buffer, img.pixels.byteOffset, img.width * img.height);
  const dst = new Uint32Array(out.pixels.buffer);
  for (let y = 0; y < out.height; y++) {
    const row = Math.floor(y / k) * img.width;
    for (let x = 0; x < out.width; x++) dst[y * out.width + x] = src[row + Math.floor(x / k)];
  }
  return out;
}

export function sameImage(a: RawImage, b: RawImage): boolean {
  if (a.width !== b.width || a.height !== b.height || a.pixels.length !== b.pixels.length) return false;
  for (let i = 0; i < a.pixels.length; i++) if (a.pixels[i] !== b.pixels[i]) return false;
  return true;
}

// Source-over, straight alpha. A fully opaque or fully clear pixel copies exactly, so one layer comes out unchanged.
function over(dst: RawImage, src: RawImage, opacity: number): void {
  const d = dst.pixels;
  const s = src.pixels;
  for (let i = 0; i < d.length; i += 4) {
    const sa = (s[i + 3] / 255) * opacity;
    if (sa <= 0) continue;
    if (sa >= 1) {
      d[i] = s[i];
      d[i + 1] = s[i + 1];
      d[i + 2] = s[i + 2];
      d[i + 3] = 255;
      continue;
    }
    const da = d[i + 3] / 255;
    const a = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) d[i + c] = Math.round((s[i + c] * sa + d[i + c] * da * (1 - sa)) / a);
    d[i + 3] = Math.round(a * 255);
  }
}

/** True when the layer sits in a folder that is switched off (or in a folder inside one). */
function inHiddenFolder(doc: Doc, l: Layer): boolean {
  for (let id = l.folder, depth = 0; id && depth < 10; depth++) {
    const f = doc.folders?.[id];
    if (!f) return false;
    if (!f.visible) return true;
    id = f.parent;
  }
  return false;
}

/** The pixel layers that make up a frame: visible ones, bottom first. Hidden layers and folders are for reference and are left out. */
function sourceLayers(doc: Doc, warnings: string[]): PixelLayer[] {
  const out: PixelLayer[] = [];
  for (const l of doc.layers) {
    if (!l.visible || inHiddenFolder(doc, l)) continue;
    if (l.kind !== 'pixel') {
      warnings.push(`Layer "${l.name}" is a vector layer, so it was left out (the mascot is pixel art).`);
      continue;
    }
    out.push(l);
  }
  return out;
}

/** A pixel drawing as the whole art grid of its layer (drawings hold only their painted part). */
function grid(doc: Doc, l: PixelLayer, d: PixelDrawing): RawImage {
  const width = Math.ceil(doc.width / l.pixelSize);
  const height = Math.ceil(doc.height / l.pixelSize);
  return { width, height, pixels: gridPixels(d, width, height) };
}

/** One frame of the document, all source layers flattened, at the document's size. */
function flatten(doc: Doc, layers: PixelLayer[], cels: (Cel | undefined)[]): RawImage {
  const img = blankImage(doc.width, doc.height);
  layers.forEach((l, i) => {
    const cel = cels[i];
    const d = cel ? (doc.drawings[cel.drawingId] as PixelDrawing | undefined) : undefined;
    if (!d || d.kind !== 'pixel') return;
    let art: RawImage = scaleNearest(grid(doc, l, d), l.pixelSize);
    if (art.width !== doc.width || art.height !== doc.height) {
      const fit = blankImage(doc.width, doc.height);
      paste(fit, crop(art, 0, 0, Math.min(art.width, doc.width), Math.min(art.height, doc.height)), 0, 0);
      art = fit;
    }
    over(img, art, l.opacity);
  });
  return img;
}

/** One animation's worth of timeline: a whole document, or one artboard of one. */
interface Board {
  /** The document as that board sees it: its own timeline over the shared layers. */
  doc: Doc;
  /** Names the animation when the board has no clip of its own. */
  name: string;
}

type PlainClip = Pick<Clip, 'name' | 'start' | 'end' | 'loop'>;

/**
 * The animations on one board. A board with one clip across all of it is one animation named after the artboard, so
 * renaming the artboard or duplicating it (the copy is "wave 2" but its clip is still "wave") does what it looks like.
 * A board with no clip is one looping animation named after it, and a document with neither is "idle".
 */
function clipsOf(board: Board, named: boolean): PlainClip[] {
  const b = board.doc;
  if (!b.clips.length) return [{ name: board.name, start: 0, end: b.length - 1, loop: true }];
  const [only] = b.clips;
  if (named && b.clips.length === 1 && only.start === 0 && only.end === b.length - 1) return [{ ...only, name: board.name }];
  return b.clips;
}

/** The boards the sheet is built from, in order: each artboard, or the document itself when it has none. */
function boardsOf(doc: Doc): Board[] {
  if (!hasArtboards(doc)) return [{ doc, name: 'idle' }];
  return artboardsOf(doc).map((a) => ({ doc: artboardDoc(doc, a.id), name: a.name }));
}

/**
 * Builds the sheet: one animation per clip, walking the artboards in their order and each artboard's clips in theirs
 * (a document without artboards is just one board). An artboard with one clip across all of it is named after the artboard. One sheet frame per unique combination of drawings, laid out left to
 * right in order of first use, across every board. A frame lasts as long as its cels stay the same, so an exposure of 50
 * frames at 100 fps is one 500 ms frame. A board with no clips is one looping animation named after the artboard, and a
 * document with neither is "idle".
 */
export function docToSheet(doc: Doc, columns = SHEET_COLUMNS): BuiltSheet {
  const warnings: string[] = [];
  const boards = boardsOf(doc);
  const { width, height } = boards[0].doc;

  const tiles: RawImage[] = [];
  const tileOf = new Map<string, number>();
  const anims: Record<string, SheetAnim> = {};

  for (const board of boards) {
    const b = board.doc;
    if (b.width !== width || b.height !== height) {
      warnings.push(`The artboard "${board.name}" is ${b.width} x ${b.height}, not ${width} x ${height} like the first one, so it was left out.`);
      continue;
    }
    const layers = sourceLayers(b, warnings);
    const clips = clipsOf(board, hasArtboards(doc));
    const msPerFrame = 1000 / b.fps;

    for (const clip of clips) {
      if (anims[clip.name]) warnings.push(`Two clips are called "${clip.name}". Only the first one was used.`);
      if (anims[clip.name] || clip.end < clip.start) continue;
      const frames: { tile: number; length: number; key: string }[] = [];
      for (let f = clip.start; f <= clip.end; f++) {
        const cels = layers.map((l) => celAt(l, f));
        // A new sheet frame starts wherever any layer moves on to another cel.
        const key = cels.map((c) => c?.id ?? '-').join('|');
        const last = frames[frames.length - 1];
        if (last && last.key === key) {
          last.length++;
          continue;
        }
        const look = cels.map((c) => c?.drawingId ?? '-').join('|');
        let tile = tileOf.get(look);
        if (tile === undefined) {
          tile = tiles.length;
          tiles.push(flatten(b, layers, cels));
          tileOf.set(look, tile);
        }
        frames.push({ tile, length: 1, key });
      }
      anims[clip.name] = {
        loop: !!clip.loop,
        frames: frames.map((fr) => {
          const exact = fr.length * msPerFrame;
          const ms = Math.max(1, Math.round(exact));
          if (Math.abs(ms - exact) > 1e-6) warnings.push(`A frame in "${clip.name}" lasts ${exact.toFixed(2)} ms, which was rounded to ${ms} ms.`);
          return { x: (fr.tile % columns) * width, y: Math.floor(fr.tile / columns) * height, ms };
        }),
      };
    }
  }

  const image = blankImage(columns * width, Math.max(1, Math.ceil(tiles.length / columns)) * height);
  tiles.forEach((t, i) => paste(image, t, (i % columns) * width, Math.floor(i / columns) * height));
  return { image, meta: { frameW: width, frameH: height, anims }, warnings: [...new Set(warnings)] };
}

// ---------------------------------------------------------------- comparing two sheets

/**
 * What differs between two built sheets, in plain words, frame by frame: the animations and their order, each frame's tile
 * and hold, and each frame's pixels. An empty list means the sheets are the same. `frames` counts the frames compared.
 */
export function compareSheets(a: { image: RawImage; meta: Sheet }, b: { image: RawImage; meta: Sheet }): { differences: string[]; frames: number } {
  const out: string[] = [];
  let frames = 0;
  const names = Object.keys(a.meta.anims);
  const others = Object.keys(b.meta.anims);
  if (names.join('|') !== others.join('|')) out.push(`the animations are ${names.join(', ')} against ${others.join(', ')}`);
  if (a.meta.frameW !== b.meta.frameW || a.meta.frameH !== b.meta.frameH) out.push(`the frames are ${a.meta.frameW} x ${a.meta.frameH} against ${b.meta.frameW} x ${b.meta.frameH}`);
  else {
    for (const name of names) {
      const x = a.meta.anims[name];
      const y = b.meta.anims[name];
      if (!y) continue;
      if (!!x.loop !== !!y.loop) out.push(`"${name}" ${x.loop ? 'loops' : 'plays once'} against ${y.loop ? 'loops' : 'plays once'}`);
      if (x.frames.length !== y.frames.length) {
        out.push(`"${name}" has ${x.frames.length} frames against ${y.frames.length}`);
        continue;
      }
      x.frames.forEach((f, i) => {
        frames++;
        const g = y.frames[i];
        if (f.x !== g.x || f.y !== g.y) out.push(`"${name}" frame ${i + 1} is on tile ${f.x},${f.y} against ${g.x},${g.y}`);
        if (f.ms !== g.ms) out.push(`"${name}" frame ${i + 1} lasts ${f.ms} ms against ${g.ms}`);
        const w = a.meta.frameW;
        const h = a.meta.frameH;
        if (!sameImage(crop(a.image, f.x, f.y, w, h), crop(b.image, g.x, g.y, w, h))) out.push(`"${name}" frame ${i + 1} looks different`);
      });
    }
  }
  if (!sameImage(a.image, b.image)) out.push('the sheet pictures are not the same');
  return { differences: out, frames };
}

// ---------------------------------------------------------------- copying a clip

/**
 * Adds a copy of a clip after the last frame, under a new name, to draw over. Every cel is copied on its layer and every
 * drawing in it is cloned (a drawing shown twice inside the clip stays one drawing), so painting on the copy never
 * touches the original. Returns the new clip. Throws, in plain words, if the clip is missing or the name is taken.
 */
export function copyClip(doc: Doc, from: string, to: string): Clip {
  const src = doc.clips.find((c) => c.name === from);
  if (!src) throw new Error(`There is no clip called "${from}". The clips are: ${doc.clips.map((c) => c.name).join(', ')}.`);
  const name = to.trim();
  if (!name) throw new Error('Give the new clip a name.');
  if (doc.clips.some((c) => c.name === name)) throw new Error(`There is already a clip called "${name}".`);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'copy';
  const shift = doc.length - src.start;
  const celIds = new Set(doc.layers.flatMap((l) => l.cels.map((c) => c.id)));
  for (const layer of doc.layers) {
    const clones = new Map<string, string>();
    let n = 0;
    const made: Cel[] = [];
    for (const cel of layer.cels) {
      const a = Math.max(cel.start, src.start);
      const b = Math.min(cel.start + cel.length - 1, src.end);
      if (b < a) continue;
      let did = clones.get(cel.drawingId);
      if (!did) {
        const base = `${layer.id.replace(/^layer-/, '')}-${slug}`;
        did = `${base}-${++n}`;
        while (doc.drawings[did]) did = `${base}-${++n}`;
        const d = doc.drawings[cel.drawingId];
        if (d?.kind === 'pixel') doc.drawings[did] = { ...d, id: did, pixels: d.pixels.slice() };
        else if (d) doc.drawings[did] = { ...d, id: did } as typeof d;
        clones.set(cel.drawingId, did);
      }
      let cid = `${cel.id}-${slug}`;
      while (celIds.has(cid)) cid += '-2';
      celIds.add(cid);
      made.push({ id: cid, start: a + shift, length: b - a + 1, drawingId: did });
    }
    layer.cels.push(...made);
  }
  doc.length += src.end - src.start + 1;
  const clip: Clip = { ...src, id: `clip-${slug}`, name, start: src.start + shift, end: src.end + shift };
  while (doc.clips.some((c) => c.id === clip.id)) clip.id += '-2';
  doc.clips.push(clip);
  return clip;
}

// ---------------------------------------------------------------- one artboard per animation

const slugOf = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'copy';

/** Artboards laid out in this many columns on the pasteboard, so thirteen of them read as a grid and not a long strip. */
export const BOARD_COLUMNS = 5;

/**
 * Turns a document whose clips are end to end on one timeline into one artboard per clip, in clip order, named after the
 * clip. The layers become one shared stack (sharedLayers), so a part is still one layer across every animation, and each
 * artboard keeps only its own cels on it, starting at frame 1. Nothing is redrawn: the drawings stay shared exactly as
 * they were, so the built sheet comes out the same. The first artboard is the open one. Throws, in plain words, when the
 * document already has artboards or no clips.
 */
export function splitIntoArtboards(doc: Doc): void {
  if (hasArtboards(doc) || doc.artboards?.length) throw new Error('This file already has artboards.');
  if (!doc.clips.length) throw new Error('There are no clips to split into artboards.');
  const seen = new Set<string>();
  const used = new Set<string>();
  const boards: Artboard[] = doc.clips.map((clip) => {
    let slug = slugOf(clip.name);
    while (used.has(slug)) slug += '-2';
    used.add(slug);
    const cels: Record<string, Cel[]> = {};
    for (const layer of doc.layers) {
      const mine: Cel[] = [];
      for (const cel of layer.cels) {
        const a = Math.max(cel.start, clip.start);
        const b = Math.min(cel.start + cel.length - 1, clip.end);
        if (b < a) continue;
        // A cel that ran across two clips is one cel on each board, so give the second a name of its own.
        let id = cel.id;
        if (seen.has(id)) id = `${id}-${slug}`;
        seen.add(id);
        mine.push({ ...cel, id, start: a - clip.start, length: b - a + 1 });
      }
      if (mine.length) cels[layer.id] = mine;
    }
    const length = clip.end - clip.start + 1;
    const content: ArtboardContent = { width: doc.width, height: doc.height, background: doc.background, length, layers: [], cels, clips: [{ ...clip, start: 0, end: length - 1 }], markers: [] };
    return { id: `artboard-${slug}`, name: clip.name, x: 0, y: 0, content };
  });
  doc.sharedLayers = true;
  doc.artboards = boards;
  doc.activeArtboard = boards[0].id;
  // The first one is open: its content is the document's own fields.
  putContent(doc, boards[0].content!);
  delete boards[0].content;
  arrangeArtboards(doc, BOARD_COLUMNS);
}

/** One animation of a file, in the order it is built: its name, its length in frames, whether it loops, and where it lives. */
export interface AnimationInfo {
  name: string;
  frames: number;
  loop: boolean;
  /** The artboard it is on, when the file has artboards. */
  board?: string;
}

/** Every animation the sheet will hold, in order: each artboard's clips (or the artboard itself when it has none). */
export function animationsOf(doc: Doc): AnimationInfo[] {
  const out: AnimationInfo[] = [];
  const boards = boardsOf(doc);
  boards.forEach((b, i) => {
    const board = hasArtboards(doc) ? artboardsOf(doc)[i].name : undefined;
    for (const c of clipsOf(b, hasArtboards(doc))) out.push({ name: c.name, frames: c.end - c.start + 1, loop: !!c.loop, ...(board ? { board } : {}) });
  });
  return out;
}

/**
 * Adds a copy of an animation to draw over, under a new name. With artboards that is a new artboard after the last one,
 * with its own clone of every drawing it shows (a drawing shown twice stays one drawing), so painting on the copy never
 * touches the original. Without artboards it is `copyClip`, a copy after the last frame. Returns where it went.
 * Throws, in plain words, if the animation is missing or the name is taken.
 */
export function copyAnimation(doc: Doc, from: string, to: string): { name: string; board?: string; frames: number; layers: number } {
  if (!hasArtboards(doc)) {
    const clip = copyClip(doc, from, to);
    return { name: clip.name, frames: clip.end - clip.start + 1, layers: doc.layers.filter((l) => l.cels.some((c) => c.start >= clip.start)).length };
  }
  if (!doc.sharedLayers) throw new Error('Copying an animation needs one stack of layers shared by every artboard.');
  const list = artboardsOf(doc);
  const src = list.find((a) => a.name === from) ?? list.find((a) => contentOf(doc, a.id)?.clips.some((c) => c.name === from));
  if (!src) throw new Error(`There is no animation called "${from}". The animations are: ${animationsOf(doc).map((a) => a.name).join(', ')}.`);
  const name = to.trim();
  if (!name) throw new Error('Give the new animation a name.');
  if (animationsOf(doc).some((a) => a.name.toLowerCase() === name.toLowerCase()) || list.some((a) => a.name.toLowerCase() === name.toLowerCase())) throw new Error(`There is already an animation called "${name}".`);
  const slug = slugOf(name);
  let boardId = `artboard-${slug}`;
  while (list.some((a) => a.id === boardId)) boardId += '-2';
  const content = contentOf(doc, src.id)!;
  const celIds = new Set<string>();
  const clipIds = new Set<string>();
  for (const a of list) {
    const c = contentOf(doc, a.id)!;
    for (const cels of Object.values(c.cels ?? {})) for (const cel of cels) celIds.add(cel.id);
    for (const clip of c.clips) clipIds.add(clip.id);
  }
  const cels: Record<string, Cel[]> = {};
  let drawn = 0;
  for (const layer of doc.layers) {
    const mine = content.cels?.[layer.id];
    if (!mine?.length) continue;
    drawn++;
    const clones = new Map<string, string>();
    let n = 0;
    cels[layer.id] = mine.map((cel) => {
      let did = clones.get(cel.drawingId);
      if (!did) {
        const base = `${layer.id.replace(/^layer-/, '')}-${slug}`;
        did = `${base}-${++n}`;
        while (doc.drawings[did]) did = `${base}-${++n}`;
        const d = doc.drawings[cel.drawingId];
        if (d?.kind === 'pixel') doc.drawings[did] = { ...d, id: did, pixels: d.pixels.slice() };
        else if (d) doc.drawings[did] = { ...d, id: did } as typeof d;
        clones.set(cel.drawingId, did);
      }
      let cid = `${cel.id}-${slug}`;
      while (celIds.has(cid)) cid += '-2';
      celIds.add(cid);
      return { ...cel, id: cid, drawingId: did };
    });
  }
  const clips = content.clips.map((c) => {
    let id = `clip-${slug}`;
    while (clipIds.has(id)) id += '-2';
    clipIds.add(id);
    return { ...c, id, name: c.name === src.name || c.name === from ? name : `${name}-${c.name}` };
  });
  const spot = nextSpot(doc, content.width);
  const copy: ArtboardContent = { width: content.width, height: content.height, background: content.background, length: content.length, layers: [], cels, clips, markers: content.markers.map((m) => ({ ...m })) };
  list.push({ id: boardId, name, x: spot.x, y: spot.y, content: copy });
  return { name, board: boardId, frames: content.length, layers: drawn };
}

// ---------------------------------------------------------------- the other way (one-time conversion)

let n = 0;
const id = (p: string) => `${p}${(++n).toString(36)}`;

function baseDoc(name: string, width: number, height: number, fps: number, swatches: Swatch[]): Doc {
  n = 0;
  return { format: 'frameling', version: FORMAT_VERSION, lineage: true, id: 'mascot-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, width, height, fps, length: 1, background: null, layers: [], drawings: {}, clips: [], markers: [], swatches };
}

/**
 * Turns a built sheet and its frame list back into a document: one pixel layer, one drawing per sheet frame, one cel
 * per frame of every animation (held for its ms at MASCOT_FPS), and the animations back to back as clips.
 */
export function sheetToDoc(sheet: RawImage, meta: Sheet, swatches: Swatch[] = [], name = 'Mascot'): Doc {
  const doc = baseDoc(name, meta.frameW, meta.frameH, MASCOT_FPS, swatches);
  const layer: PixelLayer = { id: 'layer-mascot', name: 'Mascot', kind: 'pixel', pixelSize: 1, visible: true, locked: false, opacity: 1, cels: [] };
  const drawingAtXY = new Map<string, string>();
  let at = 0;
  for (const [animName, anim] of Object.entries(meta.anims)) {
    const start = at;
    for (const fr of anim.frames) {
      const key = `${fr.x},${fr.y}`;
      let did = drawingAtXY.get(key);
      if (!did) {
        did = `pose-${drawingAtXY.size + 1}`;
        const img = crop(sheet, fr.x, fr.y, meta.frameW, meta.frameH);
        doc.drawings[did] = { id: did, kind: 'pixel', width: img.width, height: img.height, pixels: img.pixels };
        drawingAtXY.set(key, did);
      }
      const length = Math.max(1, Math.round((fr.ms * MASCOT_FPS) / 1000));
      layer.cels.push({ id: id('cel-'), start: at, length, drawingId: did });
      at += length;
    }
    doc.clips.push({ id: `clip-${animName}`, name: animName, start, end: at - 1, loop: anim.loop });
  }
  doc.layers.push(layer);
  doc.length = Math.max(1, at);
  return doc;
}

// ---------------------------------------------------------------- icons

/**
 * The icon document: a 32 x 32 stage with two pixel layers. "32 px" (pixel size 1) holds the big icon on frame 0 and
 * "16 px" (pixel size 2, so a 16 x 16 grid) holds the small one on frame 1. Clips "icon32" and "icon16" mark them.
 */
export function iconsToDoc(icon32: RawImage, icon16: RawImage, swatches: Swatch[] = []): Doc {
  const doc = baseDoc('Mascot icon', icon32.width, icon32.height, 12, swatches);
  const layer = (lid: string, lname: string, pixelSize: number, img: RawImage, frame: number): Layer => {
    const did = `${lid}-art`;
    doc.drawings[did] = { id: did, kind: 'pixel', width: img.width, height: img.height, pixels: img.pixels };
    return { id: lid, name: lname, kind: 'pixel', pixelSize, visible: true, locked: false, opacity: 1, cels: [{ id: `${lid}-cel`, start: frame, length: 1, drawingId: did }] };
  };
  doc.layers.push(layer('icon-32', '32 px', 1, icon32, 0), layer('icon-16', '16 px', icon32.width / icon16.width, icon16, 1));
  doc.clips.push({ id: 'clip-icon32', name: 'icon32', start: 0, end: 0, loop: false }, { id: 'clip-icon16', name: 'icon16', start: 1, end: 1, loop: false });
  doc.length = 2;
  return doc;
}

/** The art at a clip's first frame, at its own grid size (the topmost visible pixel layer with a cel there). */
export function clipArt(doc: Doc, clipName: string): RawImage {
  const clip = doc.clips.find((c) => c.name === clipName);
  if (!clip) throw new Error(`The icon file has no clip called "${clipName}".`);
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (!l.visible || l.kind !== 'pixel') continue;
    const cel = celAt(l, clip.start);
    const d = cel && doc.drawings[cel.drawingId];
    if (d && d.kind === 'pixel') return grid(doc, l, d);
  }
  throw new Error(`Nothing is drawn at the start of the "${clipName}" clip.`);
}

export interface BuiltIcons {
  /** Path (relative to the project) to picture, for every PNG. */
  pngs: Record<string, RawImage>;
  svg: string;
}

const hex2 = (v: number) => v.toString(16).padStart(2, '0');

/** One rect per horizontal run of a colour, like the original generator. Opaque pixels only. */
export function iconSvg(img: RawImage): string {
  let rects = '';
  const p = img.pixels;
  const colour = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    return p[i + 3] === 0 ? null : `#${hex2(p[i])}${hex2(p[i + 1])}${hex2(p[i + 2])}`;
  };
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; ) {
      const c = colour(x, y);
      let e = x;
      while (e + 1 < img.width && colour(e + 1, y) === c) e++;
      if (c) rects += `<rect x="${x}" y="${y}" width="${e - x + 1}" height="1" fill="${c}"/>`;
      x = e + 1;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 ${img.width} ${img.height}" shape-rendering="crispEdges">${rects}</svg>\n`;
}

/** Every icon file the app and the installers use, from the icon document. */
export function docToIcons(doc: Doc): BuiltIcons {
  const big = clipArt(doc, 'icon32');
  const small = clipArt(doc, 'icon16');
  const pngs: Record<string, RawImage> = {
    'build/icon.png': scaleNearest(big, 1024 / big.width),
    'public/mascot/logo.png': scaleNearest(big, 1),
  };
  for (const size of [16, 32, 48, 64, 128, 256, 512]) {
    const g = size === 16 || size === 48 ? small : big;
    pngs[`build/icons/${size}x${size}.png`] = scaleNearest(g, size / g.width);
  }
  return { pngs, svg: iconSvg(big) };
}
