/**
 * Artboards: several named canvases in one document (see Doc.artboards). Pure functions, no DOM.
 *
 * The open artboard's content lives in the document's own fields, so every tool, the timeline, the renderer and the
 * exporters work on it unchanged. The others keep theirs in `Artboard.content`. Going to another artboard swaps the
 * two. Functions that change a document change the one they are given (an immer draft or a plain object).
 */
import { current, isDraft } from 'immer';
import type { Artboard, ArtboardContent, CameraView, ClipFlow, Doc, Drawing, Id, Layer } from '../core/format';
import { cameraInverse, cameraViewOn } from '../core/camera';
import { newPixelLayer, newVectorLayer, pruneDrawings, uid } from '../core/doc';
import { rootDoc } from '../core/symbols';
import { fileSafe } from '../export/plan';
import { barColorFor, currentFit, fitPlacement, sameSize, type FitMode, type Placement } from './fit';

/** The id of the artboard a document without any has. */
export const FIRST_ID = 'artboard-1';

/** Room left between a new artboard and the one beside it. */
export function gapFor(w: number): number {
  return Math.max(32, Math.round(w * 0.1));
}

// ---------------------------------------------------------------- reading

const implicit = new WeakMap<Doc, Artboard[]>();

/** The artboards, always at least one: a document without any is one artboard the size of its stage. */
export function artboardsOf(doc: Doc): Artboard[] {
  if (doc.artboards?.length) return doc.artboards;
  let list = implicit.get(doc);
  if (!list) {
    list = [{ id: FIRST_ID, name: 'Artboard 1', x: 0, y: 0 }];
    implicit.set(doc, list);
  }
  return list;
}

/** True when the document has more than one artboard. */
export function hasArtboards(doc: Doc): boolean {
  return (doc.artboards?.length ?? 0) > 1;
}

/** The id of the open artboard. */
export function activeId(doc: Doc): Id {
  const list = artboardsOf(doc);
  const a = doc.activeArtboard;
  if (a && list.some((b) => b.id === a && !b.content)) return a;
  return (list.find((b) => !b.content) ?? list[0]).id;
}

export function activeArtboard(doc: Doc): Artboard {
  const id = activeId(doc);
  return artboardsOf(doc).find((a) => a.id === id)!;
}

export function findArtboard(doc: Doc, id: Id): Artboard | undefined {
  return artboardsOf(doc).find((a) => a.id === id);
}

/** The open artboard's content, as it would be stored aside. */
export function takeContent(doc: Doc): ArtboardContent {
  const c: ArtboardContent = { width: doc.width, height: doc.height, background: doc.background, length: doc.length, layers: doc.layers, clips: doc.clips, markers: doc.markers };
  if (doc.flow) c.flow = doc.flow;
  if (doc.audio) c.audio = doc.audio;
  if (doc.guides) c.guides = doc.guides;
  if (doc.inOut) c.inOut = doc.inOut;
  if (doc.perspective) c.perspective = doc.perspective;
  return c;
}

/** Puts content into the document's own fields (the open artboard). */
export function putContent(doc: Doc, c: ArtboardContent): void {
  doc.width = c.width;
  doc.height = c.height;
  doc.background = c.background;
  doc.length = c.length;
  doc.layers = c.layers;
  doc.clips = c.clips;
  doc.markers = c.markers;
  if (c.flow) doc.flow = c.flow;
  else delete doc.flow;
  if (c.audio) doc.audio = c.audio;
  else delete doc.audio;
  if (c.guides) doc.guides = c.guides;
  else delete doc.guides;
  if (c.inOut) doc.inOut = c.inOut;
  else delete doc.inOut;
  if (c.perspective) doc.perspective = c.perspective;
  else delete doc.perspective;
}

/** An artboard's content, whether it is open or not. */
export function contentOf(doc: Doc, id: Id): ArtboardContent | undefined {
  const a = findArtboard(doc, id);
  if (!a) return undefined;
  return a.content ?? takeContent(rootDoc(doc));
}

/** Its size, whether it is open or not. */
export function sizeOf(doc: Doc, a: Artboard): { w: number; h: number } {
  if (a.content) return { w: a.content.width, h: a.content.height };
  const r = rootDoc(doc);
  return { w: r.width, h: r.height };
}

/** Each artboard's box on the pasteboard. */
export function boxes(doc: Doc): { id: Id; x: number; y: number; w: number; h: number }[] {
  return artboardsOf(doc).map((a) => ({ id: a.id, x: a.x, y: a.y, ...sizeOf(doc, a) }));
}

/** The box round every artboard, on the pasteboard. */
export function allBounds(doc: Doc): { x: number; y: number; w: number; h: number } {
  const bs = boxes(doc);
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w));
  const y1 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The artboard under a pasteboard point (the last one listed wins where they overlap). */
export function artboardAt(doc: Doc, x: number, y: number): Id | null {
  const bs = boxes(doc);
  for (let i = bs.length - 1; i >= 0; i--) {
    const b = bs[i];
    if (x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) return b.id;
  }
  return null;
}

/** Screen pixels above an artboard that count as its name label (the name is drawn there). */
export const LABEL_PX = 22;

/** The artboard whose name label is under a pasteboard point (the strip just above its top edge), if any. */
export function artboardLabelAt(doc: Doc, x: number, y: number, zoom: number): Id | null {
  const up = LABEL_PX / Math.max(zoom, 1e-6);
  const bs = boxes(doc);
  for (let i = bs.length - 1; i >= 0; i--) {
    const b = bs[i];
    if (x >= b.x && x < b.x + b.w && y >= b.y - up && y < b.y) return b.id;
  }
  return null;
}

const usedDrawings = (doc: Doc): Set<Id> => {
  const used = new Set<Id>();
  for (const l of doc.layers) for (const c of l.cels) used.add(c.drawingId);
  for (const s of Object.values(doc.symbols ?? {})) for (const l of s.layers) for (const c of l.cels) used.add(c.drawingId);
  for (const t of doc.tileset?.tiles ?? []) for (const f of t.frames) used.add(f.drawingId);
  return used;
};

const views = new WeakMap<Doc, Map<Id, Doc>>();

/**
 * One artboard as a document of its own: its size, layers and timeline, with the shared palette, symbols and tiles,
 * and only the drawings it uses. Named for export (its export name). Used to draw, play and export it.
 */
export function artboardDoc(doc: Doc, id: Id): Doc {
  let m = views.get(doc);
  if (!m) views.set(doc, (m = new Map()));
  const hit = m.get(id);
  if (hit) return hit;
  const root = rootDoc(doc);
  const a = findArtboard(root, id) ?? activeArtboard(root);
  const out: Doc = { ...root };
  delete out.artboards;
  delete out.activeArtboard;
  delete out.editing;
  if (a.content) putContent(out, a.content);
  if (hasArtboards(root)) {
    out.name = exportNameOf(root, a.id);
    const used = usedDrawings(out);
    const drawings: Record<Id, Drawing> = {};
    for (const k of used) if (root.drawings[k]) drawings[k] = root.drawings[k];
    out.drawings = drawings;
  }
  m.set(id, out);
  return out;
}

/** The name an artboard's exports get: its export name or its name, made safe for files and unique in the document. */
export function exportNameOf(doc: Doc, id: Id): string {
  return exportNames(doc).get(id) ?? fileSafe(doc.name);
}

export function exportNames(doc: Doc): Map<Id, string> {
  const out = new Map<Id, string>();
  const seen = new Set<string>();
  for (const a of artboardsOf(doc)) {
    const base = fileSafe(a.exportName?.trim() || a.name, 'Artboard');
    let n = base;
    for (let k = 2; seen.has(n.toLowerCase()); k++) n = `${base}-${k}`;
    seen.add(n.toLowerCase());
    out.set(a.id, n);
  }
  return out;
}

// ---------------------------------------------------------------- changing

/** Makes the artboard list real (a document without one gets its first artboard). */
export function ensureArtboards(d: Doc): Artboard[] {
  if (!d.artboards?.length) {
    d.artboards = [{ id: FIRST_ID, name: 'Artboard 1', x: 0, y: 0 }];
    d.activeArtboard = FIRST_ID;
  }
  if (!d.activeArtboard) d.activeArtboard = activeId(d);
  return d.artboards;
}

/** Opens another artboard. Leave any symbol being edited first. Returns false when there was nothing to do. */
export function switchArtboard(d: Doc, id: Id): boolean {
  if (d.editing?.length) return false;
  const list = ensureArtboards(d);
  const cur = activeId(d);
  if (cur === id) return false;
  const target = list.find((a) => a.id === id);
  const from = list.find((a) => a.id === cur);
  if (!target?.content || !from) return false;
  from.content = takeContent(d);
  putContent(d, target.content);
  delete target.content;
  d.activeArtboard = id;
  return true;
}

/** A name not used yet: "Artboard 3", or "Walk 2" for a copy of "Walk". */
export function freshName(doc: Doc, base = 'Artboard'): string {
  const names = new Set(artboardsOf(doc).map((a) => a.name.toLowerCase()));
  const stem = base.replace(/\s+\d+$/, '');
  // A plain new one counts on from how many there are; a copy of "Walk" is "Walk 2".
  for (let k = stem === 'Artboard' ? artboardsOf(doc).length + 1 : 2; ; k++) {
    const n = `${stem} ${k}`;
    if (!names.has(n.toLowerCase())) return n;
  }
}

/** Where a new artboard of this size goes: to the right of everything, lined up with the top. */
export function nextSpot(doc: Doc, w: number): { x: number; y: number } {
  const b = allBounds(doc);
  return { x: b.x + b.w + gapFor(w), y: b.y };
}

export interface NewArtboard {
  name?: string;
  width?: number;
  height?: number;
  background?: string | null;
  length?: number;
  x?: number;
  y?: number;
}

/**
 * Adds an empty artboard with one layer (a pixel layer at the open artboard's art pixel size when that's pixel art).
 * It sizes and colours itself like the open one unless told otherwise. Returns its id; it isn't opened.
 */
export function addArtboard(d: Doc, o: NewArtboard = {}): Id {
  const list = ensureArtboards(d);
  const root = d;
  const w = Math.max(1, Math.round(o.width ?? root.width));
  const h = Math.max(1, Math.round(o.height ?? root.height));
  const px = root.layers.find((l) => l.kind === 'pixel');
  const layer: Layer = px && px.kind === 'pixel' ? newPixelLayer('Layer 1', px.pixelSize) : newVectorLayer('Layer 1');
  const spot = nextSpot(d, w);
  const id = uid('ab');
  list.push({
    id,
    name: o.name ?? freshName(d),
    x: Math.round(o.x ?? spot.x),
    y: Math.round(o.y ?? spot.y),
    content: { width: w, height: h, background: o.background === undefined ? root.background : o.background, length: Math.max(1, Math.round(o.length ?? root.length)), layers: [layer], clips: [], markers: [] },
  });
  return id;
}

const plain = <T>(x: T): T => structuredClone(isDraft(x) ? (current(x as never) as T) : x);

/** A copy of an artboard's content with new ids for everything, and copies of its drawings (added to `d`). */
function cloneContent(d: Doc, c: ArtboardContent): ArtboardContent {
  const out = plain(c);
  const drawingIds = new Map<Id, Id>();
  const layerIds = new Map<Id, Id>();
  const folderIds = new Map<Id, Id>();
  for (const l of out.layers) layerIds.set(l.id, uid('l'));
  for (const l of out.layers) {
    l.id = layerIds.get(l.id)!;
    if (l.bind) l.bind.rig = layerIds.get(l.bind.rig) ?? l.bind.rig;
    if (l.folder && d.folders?.[l.folder]) {
      let f = folderIds.get(l.folder);
      if (!f) {
        f = uid('f');
        folderIds.set(l.folder, f);
        d.folders[f] = { ...plain(d.folders[l.folder]), id: f };
      }
      l.folder = f;
    }
    for (const cel of l.cels) {
      cel.id = uid('c');
      let nd = drawingIds.get(cel.drawingId);
      if (!nd) {
        const src = d.drawings[cel.drawingId];
        if (!src) continue;
        nd = uid(src.id.charAt(0) || 'v');
        drawingIds.set(cel.drawingId, nd);
        d.drawings[nd] = { ...plain(src), id: nd };
      }
      cel.drawingId = nd;
    }
  }
  const clipIds = new Map<Id, Id>();
  for (const c2 of out.clips) {
    const n = uid('clip');
    clipIds.set(c2.id, n);
    c2.id = n;
  }
  for (const m of out.markers) m.id = uid('m');
  if (out.flow) out.flow = remapFlow(out.flow, clipIds);
  for (const a of out.audio ?? []) a.id = uid('au');
  for (const g of out.guides ?? []) g.id = uid('g');
  return out;
}

function remapFlow(f: ClipFlow, ids: Map<Id, Id>): ClipFlow {
  const out: ClipFlow = { transitions: f.transitions.map((t) => ({ ...t, id: uid('t'), from: ids.get(t.from) ?? t.from, to: ids.get(t.to) ?? t.to })) };
  if (f.start) out.start = ids.get(f.start) ?? f.start;
  if (f.positions) out.positions = Object.fromEntries(Object.entries(f.positions).map(([k, v]) => [ids.get(k) ?? k, v]));
  return out;
}

/** A copy of an artboard (its own drawings, not shared), placed beside it. Returns the copy's id. */
export function duplicateArtboard(d: Doc, id: Id): Id | null {
  if (d.editing?.length) return null;
  const list = ensureArtboards(d);
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return null;
  const src = list[i];
  const content = cloneContent(d, src.content ?? takeContent(d));
  const nid = uid('ab');
  const copy: Artboard = { id: nid, name: freshName(d, src.name), x: 0, y: src.y, content };
  // Beside the original when there's room, else after everything.
  const right = src.x + content.width + gapFor(content.width);
  const clash = boxes(d).some((b) => b.id !== id && right < b.x + b.w && right + content.width > b.x && src.y < b.y + b.h && src.y + content.height > b.y);
  copy.x = clash ? nextSpot(d, content.width).x : right;
  if (clash) copy.y = nextSpot(d, content.width).y;
  list.splice(i + 1, 0, copy);
  return nid;
}

/** Removes an artboard and the drawings only it used. The last one can't go. Opens a neighbour if it was open. */
export function deleteArtboard(d: Doc, id: Id): boolean {
  if (d.editing?.length) return false;
  const list = ensureArtboards(d);
  if (list.length < 2) return false;
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return false;
  if (activeId(d) === id) switchArtboard(d, list[i + 1]?.id ?? list[i - 1].id);
  list.splice(i, 1);
  pruneDrawings(d);
  return true;
}

export function renameArtboard(d: Doc, id: Id, name: string): void {
  const a = ensureArtboards(d).find((b) => b.id === id);
  const n = name.trim();
  if (a && n) a.name = n.slice(0, 120);
}

export function setExportName(d: Doc, id: Id, name: string): void {
  const a = ensureArtboards(d).find((b) => b.id === id);
  if (!a) return;
  const n = name.trim();
  if (n) a.exportName = n.slice(0, 120);
  else delete a.exportName;
}

/** Moves an artboard to a place in the list (the order exports, the panel and "play all" use). */
export function reorderArtboard(d: Doc, id: Id, to: number): void {
  const list = ensureArtboards(d);
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return;
  const [a] = list.splice(i, 1);
  list.splice(Math.max(0, Math.min(list.length, to)), 0, a);
}

/** Puts an artboard somewhere else on the pasteboard (its drawing comes with it). */
export function moveArtboard(d: Doc, id: Id, x: number, y: number): void {
  const a = ensureArtboards(d).find((b) => b.id === id);
  if (!a) return;
  a.x = Math.round(x);
  a.y = Math.round(y);
}

export function setArtboardBackground(d: Doc, id: Id, color: string | null): void {
  const a = ensureArtboards(d).find((b) => b.id === id);
  if (!a) return;
  if (a.content) a.content.background = color;
  else d.background = color;
}

/** Lays the artboards out in a row (or a grid of `columns`), in list order, with a gap between them. */
export function arrangeArtboards(d: Doc, columns = 0): void {
  const list = ensureArtboards(d);
  const sizes = list.map((a) => sizeOf(d, a));
  const cols = columns > 0 ? columns : list.length;
  const gap = gapFor(Math.max(...sizes.map((s) => s.w)));
  const colW: number[] = [];
  const rowH: number[] = [];
  sizes.forEach((s, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    colW[c] = Math.max(colW[c] ?? 0, s.w);
    rowH[r] = Math.max(rowH[r] ?? 0, s.h);
  });
  const x0 = list[0].x;
  const y0 = list[0].y;
  list.forEach((a, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    a.x = x0 + colW.slice(0, c).reduce((t, w) => t + w + gap, 0);
    a.y = y0 + rowH.slice(0, r).reduce((t, h) => t + h + gap, 0);
  });
}

// ---------------------------------------------------------------- shots in order

export interface JoinOptions {
  /** How a shot of another size fits the picture (default: whatever Preferences says, Fit). */
  fit?: FitMode;
  /** The picture's size (default: the first shot's). */
  size?: { width: number; height: number };
  /** The colour of the bars (default: the picture's background, or what Preferences says). */
  barColor?: string | null;
}

/**
 * Several artboards one after another as one document, for playing or exporting them as a single film. The picture
 * is the first shot's size (or `size`); a shot of another size is fitted into it, with bars (the picture's background colour) or
 * cropped to fill (see fit.ts), by a camera key set for each of its frames. Each shot becomes a clip named after it,
 * its markers and sounds move along with it, and the stage colour of a shot that has its own goes in as a filled
 * layer underneath.
 */
export function joinShots(doc: Doc, ids: Id[], opts: JoinOptions = {}): { doc: Doc; starts: number[] } | { problem: string } {
  const root = rootDoc(doc);
  const shots = ids.map((id) => findArtboard(root, id)).filter((a): a is Artboard => !!a);
  if (!shots.length) return { problem: 'Pick at least one artboard.' };
  const views = shots.map((a) => artboardDoc(root, a.id));
  const w = Math.max(1, Math.round(opts.size?.width ?? views[0].width));
  const h = Math.max(1, Math.round(opts.size?.height ?? views[0].height));
  const mode = opts.fit ?? currentFit();
  const bgs = new Set(views.map((v) => v.background));
  const oneBg = bgs.size === 1;
  const out: Doc = { ...views[0], width: w, height: h, name: fileSafe(root.name), layers: [], clips: [], markers: [], drawings: { ...root.drawings } };
  if (root.folders) out.folders = { ...root.folders };
  delete out.flow;
  delete out.audio;
  delete out.guides;
  delete out.inOut;
  delete out.perspective;
  if (!oneBg) out.background = null;
  const starts: number[] = [];
  let at = 0;
  // One camera for the whole film: each shot's own keys, or the plain view where a shot has none. A shot of another
  // size gets one too: it is how it is scaled and centred into the picture.
  const fitted = views.map((v) => !sameSize(v.width, v.height, w, h));
  let camera: Layer | null = null;
  if (fitted.some(Boolean) || views.some((v) => v.layers.some((l) => l.kind === 'camera' && l.visible))) camera = { id: uid('l'), name: 'Camera', kind: 'camera', visible: true, locked: false, opacity: 1, cels: [] };
  views.forEach((v, k) => {
    const shot = shots[k];
    starts.push(at);
    const len = v.length;
    const tag = (s: string) => `${shot.id}:${s}`;
    const place = fitted[k] ? fitPlacement(v.width, v.height, w, h, mode) : null;
    if (!oneBg && v.background) {
      const dId = tag('bg');
      out.drawings[dId] = { id: dId, kind: 'vector', shapes: [{ id: dId, type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: v.width, y: 0 }, { x: v.width, y: v.height }, { x: 0, y: v.height }] }], fill: v.background, stroke: null, opacity: 1 }] };
      out.layers.push({ id: tag('bg'), name: `${shot.name} background`, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: tag('bgc'), start: at, length: len, drawingId: dId }] });
    }
    const cam = v.layers.find((l) => l.kind === 'camera' && l.visible);
    for (const l of v.layers) {
      if (l.kind === 'camera') continue;
      const nl: Layer = { ...l, id: tag(l.id), cels: shiftCels(l, at, len, tag) };
      if (nl.bind) nl.bind = { ...nl.bind, rig: tag(nl.bind.rig) };
      if (nl.folder && out.folders?.[nl.folder]) {
        const f = tag(nl.folder);
        if (!out.folders[f]) out.folders[f] = { ...out.folders[nl.folder], id: f };
        nl.folder = f;
      }
      out.layers.push(nl);
    }
    if (camera) {
      if (cam) {
        const cels = shiftCels(cam, at, len, tag);
        if (place) {
          // The shot's own camera, zoomed by the fit (zoom is a ratio, so it scales every key and in-between alike).
          for (const c of cels) {
            const src = v.drawings[c.drawingId];
            if (src?.kind !== 'camera') continue;
            const nd = `${c.drawingId}:fit${k}`;
            out.drawings[nd] = { id: nd, kind: 'camera', view: { ...src.view, zoom: src.view.zoom * place.k } };
            c.drawingId = nd;
          }
        }
        if (place) {
          // Frames where the shot's camera has no key show its plain view, which still needs the fit.
          const plain = (from: number, to: number, n: number) => {
            const dId = tag(`cam-gap${n}`);
            out.drawings[dId] = { id: dId, kind: 'camera', view: { x: v.width / 2, y: v.height / 2, zoom: place.k, rotation: 0 } };
            return { id: tag(`camc-gap${n}`), start: from, length: to - from, drawingId: dId };
          };
          const filled: typeof cels = [];
          let cursor = at;
          for (const c of [...cels].sort((a, b) => a.start - b.start)) {
            if (c.start > cursor) filled.push(plain(cursor, c.start, filled.length));
            filled.push(c);
            cursor = Math.max(cursor, c.start + c.length);
          }
          if (cursor < at + len) filled.push(plain(cursor, at + len, filled.length));
          cels.splice(0, cels.length, ...filled);
        }
        camera.cels.push(...cels);
      } else {
        const dId = tag('cam');
        out.drawings[dId] = { id: dId, kind: 'camera', view: place ? { x: v.width / 2, y: v.height / 2, zoom: place.k, rotation: 0 } : { x: w / 2, y: h / 2, zoom: 1, rotation: 0 } };
        camera.cels.push({ id: tag('camc'), start: at, length: len, drawingId: dId });
      }
    }
    const barColor = opts.barColor === undefined ? barColorFor(views[0].background) : opts.barColor;
    if (place?.bars.length && barColor) out.layers.push(barsLayer(out, v, cam, place, barColor, { w, h }, at, len, tag, shot.name));
    out.clips.push({ id: tag('clip'), name: shot.name, start: at, end: at + len - 1, loop: false });
    for (const m of v.markers) if (m.frame < len) out.markers.push({ ...m, id: tag(m.id), frame: m.frame + at });
    for (const a of v.audio ?? []) (out.audio ??= []).push({ ...a, id: tag(a.id), start: a.start + at });
    at += len;
  });
  if (camera) out.layers.push(camera);
  // Folders only hold together when their layers sit next to each other, which each shot's already do.
  out.length = Math.max(1, at);
  pruneDrawings(out);
  return { doc: out, starts };
}

/**
 * The bars for a shot fitted with bars: a layer on top of the shot's others, drawn where the camera will put the
 * edges of the picture (so they stay put whatever the shot's own camera does, and hide what hangs off the stage).
 */
function barsLayer(out: Doc, v: Doc, cam: Layer | undefined, place: Placement, color: string, pic: { w: number; h: number }, at: number, len: number, tag: (s: string) => string, name: string): Layer {
  const reach = 2 * Math.max(pic.w, pic.h);
  const cels: Layer['cels'] = [];
  let prev = '';
  for (let f = 0; f < len; f++) {
    const own = cam ? cameraViewOn(v, cam, f) : undefined;
    const view: CameraView = own ? { ...own, zoom: own.zoom * place.k } : { x: v.width / 2, y: v.height / 2, zoom: place.k, rotation: 0 };
    const key = `${view.x},${view.y},${view.zoom},${view.rotation}`;
    if (key === prev) {
      cels[cels.length - 1].length++;
      continue;
    }
    prev = key;
    // The picture's edges are fixed on screen; the stage-space shape that lands there is found by undoing the camera.
    const inv = cameraInverse({ width: pic.w, height: pic.h }, view);
    const at2 = (x: number, y: number) => ({ x: inv[0] * x + inv[2] * y + inv[4], y: inv[1] * x + inv[3] * y + inv[5] });
    const paths = place.bars.map((b) => {
      const x0 = b.x <= 0 ? -reach : b.x;
      const y0 = b.y <= 0 ? -reach : b.y;
      const x1 = b.x + b.w >= pic.w ? pic.w + reach : b.x + b.w;
      const y1 = b.y + b.h >= pic.h ? pic.h + reach : b.y + b.h;
      return { closed: true, points: [at2(x0, y0), at2(x1, y0), at2(x1, y1), at2(x0, y1)] };
    });
    const id = tag(`bars${cels.length}`);
    out.drawings[id] = { id, kind: 'vector', shapes: [{ id, type: 'path', paths, fill: color, stroke: null, opacity: 1 }] };
    cels.push({ id: tag(`barc${cels.length}`), start: at + f, length: 1, drawingId: id });
  }
  return { id: tag('bars'), name: `${name} bars`, kind: 'vector', visible: true, locked: false, opacity: 1, cels };
}

/** A layer's cels moved `by` frames, cut at the shot's end, with no in-betweens running into the next shot. */
function shiftCels(l: Layer, by: number, len: number, tag: (s: string) => string) {
  const cels = l.cels.filter((c) => c.start < len).map((c) => {
    const n = { ...c, id: tag(c.id), start: c.start + by, length: Math.min(c.length, len - c.start) };
    delete n.autoHold;
    return n;
  });
  const last = cels[cels.length - 1];
  if (last && last.start + last.length >= by + len) delete last.tween;
  return cels;
}

/** Which shot (index into the list) and frame inside it a frame of the joined film is. */
export function shotAt(starts: number[], frame: number): { shot: number; frame: number } {
  let k = 0;
  while (k + 1 < starts.length && starts[k + 1] <= frame) k++;
  return { shot: k, frame: frame - (starts[k] ?? 0) };
}
