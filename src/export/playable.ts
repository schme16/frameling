// The Interactives package (.flplay): the playable form of an animation. A zip holding manifest.json (size, speed,
// clips, markers, layers), atlas.png (every different picture once, packed tight) and, when asked, the editable
// .frameling file. Pure maths and bytes, so it is all tested without a canvas. The format is written up in the
// README (The Interactives package).
import { exportClipNames, flowManifest, type FlowManifest } from '../core/flow';
import { strToU8, zipSync, type Zippable } from 'fflate';
import type { Doc } from '../core/format';
import { encodePng, type RawImage } from '../io/png';
import { buildCells, composeSheet, layoutPacked, type Cell } from './sheet';

export const PLAYABLE_EXTENSION = 'flplay';
export const PLAYABLE_MIME = 'application/vnd.frameling.playable+zip';
export const PLAYABLE_FORMAT = 'frameling-playable';
export const PLAYABLE_VERSION = 1;

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
  const out: Omit<PlayableClip, 'runs'>[] = [];
  const names = new Set<string>();
  for (const c of doc.clips) {
    const a = Math.max(range.start, Math.min(c.start, c.end));
    const b = Math.min(range.end, Math.max(c.start, c.end));
    if (a > b) continue;
    let name = c.name.trim() || 'clip';
    while (names.has(name)) name += '_';
    names.add(name);
    out.push({ name, start: a - range.start, end: b - range.start, loop: c.loop });
  }
  return out;
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
  const clips = playableClips(doc, range);
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
    clips: clips.map((c) => ({ ...c, runs: playableRuns(cellOfFrame, c.start, c.end, doc.fps) })),
    markers: doc.markers.filter((m) => m.frame >= range.start && m.frame <= range.end).map((m) => ({ name: m.name, frame: m.frame - range.start })).sort((a, b) => a.frame - b.frame),
    layers: doc.layers
      .filter((l) => !l.reference)
      .map((l) => ({ name: l.name, kind: l.kind, visible: l.visible, opacity: l.opacity, ...(l.kind === 'pixel' ? { pixelSize: l.pixelSize } : {}) })),
    source: job.source ? 'source.frameling' : null,
  };
  const names = exportClipNames(doc.clips, (c) => Math.max(range.start, Math.min(c.start, c.end)) <= Math.min(range.end, Math.max(c.start, c.end)), false);
  const flow = flowManifest(doc, (c) => names.get(c.id));
  if (flow) manifest.flow = flow;
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
