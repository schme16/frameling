// The Interactives package (.flplay): the playable form of an animation. A zip holding manifest.json (size, speed,
// clips, markers, layers), atlas.png (every different picture once, packed tight) and, when asked, the editable
// .frameling file. Pure maths and bytes, so it is all tested without a canvas. The format is written up in the
// README (The Interactives package).
import { exportClipNames, flowManifest, type FlowManifest } from '../core/flow';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { bakedPositions, clipDirection, clipPlays } from '../core/clipPlay';
import { clipRows, MAX_BAKED } from './playableClips';
import type { Doc } from '../core/format';
import { encodePng, type RawImage } from '../io/png';
import { buildCells, composeSheet, layoutPacked, type Cell } from './sheet';

export const PLAYABLE_EXTENSION = 'flplay';
export const PLAYABLE_MIME = 'application/vnd.frameling.playable+zip';
import { PLAYABLE_FORMAT } from './types';
export { PLAYABLE_FORMAT };
export const PLAYABLE_VERSION = 1;
export { clipsTooLong, MAX_BAKED } from './playableClips';

export interface PlayableCell {
  /** Where the picture is on the atlas, in atlas pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where its top left corner sits inside the whole frame (trimmed space), in atlas pixels. */
  ox: number;
  oy: number;
}

export interface PlayableRun {
  cell: number;
  /** How many document frames this picture is held for. */
  frames: number;
  ms: number;
}

export interface PlayableClip {
  name: string;
  /** First and last frame, inclusive, counted in the package's own frames (0 is its first). */
  start: number;
  end: number;
  loop: boolean;
  /** The clip as pictures and how long each is held: handy for players that step picture by picture. */
  runs: PlayableRun[];
}

export interface PlayableManifest {
  format: typeof PLAYABLE_FORMAT;
  version: number;
  app: string;
  appVersion: string;
  name: string;
  /** The stage size in document pixels. Layers in Interactives start this size. */
  width: number;
  height: number;
  /** Atlas pixels per document pixel. */
  scale: number;
  fps: number;
  frameCount: number;
  /** Draw with nearest-neighbour scaling, so pixel art stays crisp. */
  pixelArt: boolean;
  /** The background baked into the frames, or null when they are see-through. */
  background: string | null;
  atlas: { image: string; width: number; height: number };
  cells: PlayableCell[];
  /** The picture for each frame (an index into `cells`). Held frames point at the same picture. */
  frames: number[];
  /**
   * Only when a clip plays backward, back and forth or a set number of times: how many frames the document itself has.
   * The frames after those are those clips in the order they play, one stretch each (the clip's start and end point at it),
   * so a player that only plays a clip forward from start to end still shows the right pictures. Older readers ignore this.
   */
  documentFrames?: number;
  clips: PlayableClip[];
  markers: { name: string; frame: number }[];
  layers: { name: string; kind: string; visible: boolean; opacity: number; pixelSize?: number }[];
  /** The editable Frameling file inside the package, when it was included. */
  source: string | null;
  /** How the clips lead to each other (by clip name), when the document has a clip flow. Added in Frameling 0.x; older readers ignore it. */
  flow?: FlowManifest;
}

export interface PlayableJob {
  doc: Doc;
  /** Rendered frames, first to last of the range. */
  frames: RawImage[];
  range: { start: number; end: number };
  scale: number;
  pixelArt: boolean;
  /** The background the frames were drawn on (null = see-through). */
  background: string | null;
  maxSide: number;
  appVersion?: string;
  /** The .frameling file's bytes, to carry the editable drawing along. */
  source?: Uint8Array | null;
}

export class PlayableProblem extends Error {}

/** The document's clips, moved into the range's own frame numbers and cut to fit it. Clips wholly outside are dropped. */
export function playableClips(doc: Pick<Doc, 'clips'>, range: { start: number; end: number }): Omit<PlayableClip, 'runs'>[] {
  return clipsInRange(doc, range).map(({ order: _order, ...c }) => c);
}

/** The same, each with the frames it plays in (positions from its first frame) when that is not once, forward. */
function clipsInRange(doc: Pick<Doc, 'clips'>, range: { start: number; end: number }): (Omit<PlayableClip, 'runs'> & { order?: number[] })[] {
  return clipRows(doc, range).map(({ name, c, a, b, played }) => {
    // Forever for a clip that loops: one trip round the loop, which the player then repeats.
    const len = b - a + 1;
    const order = played !== undefined && played <= MAX_BAKED ? bakedPositions(len, clipDirection(c), clipPlays(c)) : undefined;
    const plain = !order || (order.length === len && order.every((p, i) => p === i));
    return { name, start: a - range.start, end: b - range.start, loop: c.loop, ...(plain ? {} : { order }) };
  });
}

/**
 * Puts each clip that plays another way at the end of the frame list, in the order it plays, and points the clip at it.
 * Frames and markers of the document itself stay where they are (so everything that counts frames still lines up).
 * Markers inside such a clip are repeated where its frames are shown again.
 */
export function bakeClipOrders<C extends { start: number; end: number; order?: number[] }>(frames: number[], clips: C[], markers: { name: string; frame: number }[]): { frames: number[]; clips: Omit<C, 'order'>[]; markers: { name: string; frame: number }[]; baked: Set<number> } {
  const outFrames = [...frames];
  const outMarkers = [...markers];
  const baked = new Set<number>();
  const out = clips.map((c, i) => {
    const { order, ...rest } = c;
    if (!order) return rest;
    const start = outFrames.length;
    for (const p of order) outFrames.push(frames[c.start + p]);
    for (const m of markers) {
      if (m.frame < c.start || m.frame > c.end) continue;
      order.forEach((p, k) => {
        if (c.start + p === m.frame) outMarkers.push({ name: m.name, frame: start + k });
      });
    }
    baked.add(i);
    return { ...rest, start, end: outFrames.length - 1 };
  });
  return { frames: outFrames, clips: out, markers: outMarkers.sort((a, b) => a.frame - b.frame), baked };
}

/** Frames start to end as pictures, runs of the same picture merged. */
export function playableRuns(frames: number[], start: number, end: number, fps: number): PlayableRun[] {
  const out: PlayableRun[] = [];
  for (let f = start; f <= end; f++) {
    const last = out[out.length - 1];
    if (last && last.cell === frames[f]) last.frames++;
    else out.push({ cell: frames[f], frames: 1, ms: 0 });
  }
  for (const r of out) r.ms = Math.round((r.frames * 1000) / fps);
  return out;
}

/** Builds the manifest and the atlas picture. */
export function buildPlayable(job: PlayableJob): { manifest: PlayableManifest; atlas: RawImage } {
  const { doc, range } = job;
  const count = range.end - range.start + 1;
  if (job.frames.length !== count) throw new PlayableProblem('Some frames are missing. Please try again.');
  const clipList = clipsInRange(doc, range);
  const clips = clipList.map(({ order: _order, ...c }) => c);
  // A clip must start on a picture of its own, so playing it never borrows a neighbour's
  const cuts = new Set<number>();
  for (const c of clips) cuts.add(c.start).add(c.end + 1);
  const { cells, cellOfFrame } = buildCells(job.frames, { trim: true, dedupe: true, cuts });
  // A pixel of space and a pixel of edge bleed around every picture, so scaling never pulls in a neighbour's edge
  const layout = layoutPacked(cells, { padding: 1, extrude: 1, maxSide: job.maxSide });
  if (!layout || layout.width > job.maxSide || layout.height > job.maxSide) throw new PlayableProblem(`The pictures would not fit in ${job.maxSide} pixels. Try a smaller size or one clip at a time.`);
  const atlas = composeSheet(cells, layout);
  const toCell = (c: Cell, i: number): PlayableCell => ({ x: layout.positions[i].x, y: layout.positions[i].y, w: c.image.width, h: c.image.height, ox: c.trim.x, oy: c.trim.y });
  const manifest: PlayableManifest = {
    format: PLAYABLE_FORMAT,
    version: PLAYABLE_VERSION,
    app: 'Frameling',
    appVersion: job.appVersion ?? '',
    name: doc.name,
    width: doc.width,
    height: doc.height,
    scale: job.scale,
    fps: doc.fps,
    frameCount: count,
    pixelArt: job.pixelArt,
    background: job.background,
    atlas: { image: 'atlas.png', width: atlas.width, height: atlas.height },
    cells: cells.map(toCell),
    frames: cellOfFrame,
    clips: [],
    markers: doc.markers.filter((m) => m.frame >= range.start && m.frame <= range.end).map((m) => ({ name: m.name, frame: m.frame - range.start })).sort((a, b) => a.frame - b.frame),
    layers: doc.layers
      .filter((l) => !l.reference)
      .map((l) => ({ name: l.name, kind: l.kind, visible: l.visible, opacity: l.opacity, ...(l.kind === 'pixel' ? { pixelSize: l.pixelSize } : {}) })),
    source: job.source ? 'source.frameling' : null,
  };
  const bake = bakeClipOrders(cellOfFrame, clipList, manifest.markers);
  manifest.frames = bake.frames;
  manifest.frameCount = bake.frames.length;
  manifest.markers = bake.markers;
  manifest.clips = bake.clips.map((c) => ({ ...c, runs: playableRuns(bake.frames, c.start, c.end, doc.fps) }));
  if (bake.baked.size) manifest.documentFrames = count;
  const names = exportClipNames(doc.clips, (c) => Math.max(range.start, Math.min(c.start, c.end)) <= Math.min(range.end, Math.max(c.start, c.end)), false);
  const flow = flowManifest(doc, (c) => names.get(c.id));
  if (flow) {
    // A clip that is already in play order needs no direction or repeat from the player: its frames are what plays.
    for (const st of flow.states) {
      const i = clipList.findIndex((c) => c.name === st.name);
      if (i < 0 || !bake.baked.has(i)) continue;
      st.frames = bake.clips[i].end - bake.clips[i].start + 1;
      delete st.direction;
      delete st.repeat;
    }
    manifest.flow = flow;
  }
  return { manifest, atlas };
}

/** The whole .flplay file. */
export function playablePackage(job: PlayableJob): { bytes: Uint8Array; manifest: PlayableManifest } {
  const { manifest, atlas } = buildPlayable(job);
  const files: Zippable = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2) + '\n'),
    // PNG is already squeezed, so the zip only stores it
    'atlas.png': [encodePng(atlas), { level: 0 }],
  };
  if (job.source) files['source.frameling'] = [job.source, { level: 0 }];
  return { bytes: zipSync(files), manifest };
}
