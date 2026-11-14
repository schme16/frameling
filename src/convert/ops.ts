// The Turn into pixels and Turn into shapes operations: what is selected, what a dialog starts on, the work itself and
// putting it in the document as one undo step. The dialogs and the commands both come through here.
import { currentChoice } from '../core/choices';
import { celAt, findLayer, pixelGrid, uid } from '../core/doc';
import type { Clip, Doc, FillShape, Id, Layer, PixelDrawing } from '../core/format';
import { gridPixels, type Placed } from '../core/pixelBounds';
import { store, type State } from '../core/store';
import { isEditingVariation } from '../artboards/variations';
import { pixelSelection, setPixelSelection } from '../select/pixel-state';
import type { Mask } from '../select/mask';
import { tl } from '../timeline/state';
import { hasArt } from './relevant';
import { applyToPixels, applyToShapes, type Applied, type LandsWhere } from './apply';
import { rasterizeFrame, type PixelEdges } from './rasterize';
import { bakesFor, clipAround, type Bake, type FramesWhere } from './scope';
import { separateColours } from './separate';
import { DEFAULT_TRACE, pixelsToShapes, suggestTrace, type TraceOptions } from './shapes';
import { edgesForPixels, usualPixelSize } from './size';

/** What is being turned into what: shapes into pixels, or pixels into shapes. */
export type Way = 'pixels' | 'shapes';

export interface Source {
  way: Way;
  layer: Layer;
  frame: number;
  /** Shape ids that are selected (shapes into pixels). */
  selection: Id[];
  /** Pixels that are selected (pixels into shapes). */
  mask: Mask | null;
  /** The clip the frame is in, if any. */
  clip: Clip | null;
}

const NAMES: Record<Way, string> = { pixels: 'Turn into pixels', shapes: 'Turn into shapes' };
export const nameOf = (w: Way): string => NAMES[w];

/** What `way` would work on right now, or a plain-words reason it can't. */
export function sourceNow(way: Way, s: State = store().get()): Source | { why: string } {
  const layer = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
  const need = way === 'pixels' ? 'vector' : 'pixel';
  if (!layer || layer.kind !== need) return { why: way === 'pixels' ? 'Pick a layer of shapes (a vector layer) first.' : 'Pick a pixel layer first.' };
  if (isEditingVariation(s.doc)) return { why: 'This is a variation, so layers can’t change kind here. Go to the original.' };
  if (layer.locked) return { why: 'This layer is locked. Unlock it first.' };
  if (!hasArt(s.doc, layer)) return { why: way === 'pixels' ? 'There are no shapes on this layer yet.' : 'There are no pixels on this layer yet.' };
  const mask = way === 'shapes' ? pixelSelection() : null;
  const cel = celAt(layer, s.ui.frame);
  const drawing = cel ? s.doc.drawings[cel.drawingId] : undefined;
  const ids = way === 'pixels' && drawing?.kind === 'vector' ? s.ui.selection.filter((id) => drawing.shapes.some((x) => x.id === id)) : [];
  return { way, layer, frame: s.ui.frame, selection: ids, mask, clip: clipAround(s.doc.clips, s.ui.frame, tl().clipId) };
}

export const isSource = (x: Source | { why: string }): x is Source => !('why' in x);

/** Only part of the drawing is picked (shapes or pixels), so only this drawing can be turned. */
export const hasPick = (src: Source): boolean => src.selection.length > 0 || !!src.mask;

/** Which frame ranges are open to choose, and the count each would reach. */
export function framesOpen(src: Source): Record<FramesWhere, { open: boolean; drawings: number; why?: string }> {
  const count = (w: FramesWhere) => new Set(bakesFor(src.layer, w, src.frame, src.clip).map((b) => b.key)).size;
  const pick = hasPick(src);
  return {
    this: { open: count('this') > 0, drawings: count('this'), ...(count('this') ? {} : { why: 'Nothing on this frame.' }) },
    clip: { open: !pick && !!src.clip && count('clip') > 0, drawings: count('clip'), why: pick ? 'Only this drawing, since part of it is picked.' : !src.clip ? 'This frame is not in a clip.' : undefined },
    all: { open: !pick, drawings: count('all'), why: pick ? 'Only this drawing, since part of it is picked.' : undefined },
  };
}

/** The frames a dialog starts on: what was remembered, unless that cannot be used here. */
export function startFrames(src: Source): FramesWhere {
  const want = currentChoice<FramesWhere>('convert.frames');
  const open = framesOpen(src);
  return open[want].open ? want : open.this.open ? 'this' : 'all';
}

export interface PixelSettings {
  where: LandsWhere;
  frames: FramesWhere;
  pixelSize: number;
  /** Hard or smooth, already worked out from the preference and the drawing. */
  edges: PixelEdges;
}

export interface ShapeSettings {
  where: LandsWhere;
  frames: FramesWhere;
  trace: TraceOptions;
}

export function startPixels(src: Source, doc: Doc): PixelSettings {
  const pixelSize = usualPixelSize(doc);
  return { where: currentChoice<LandsWhere>('convert.where'), frames: startFrames(src), pixelSize, edges: edgesForPixels(doc, pixelSize, currentChoice('convert.edges.pixels')) };
}

/** The picture the trace reads: the layer's drawing laid out on its whole grid. */
export function gridOfDrawing(doc: Doc, layer: Layer, d: PixelDrawing): { px: Uint8ClampedArray; w: number; h: number } {
  const g = pixelGrid(doc, layer as never);
  return { px: gridPixels(d, g.width, g.height), w: g.width, h: g.height };
}

export function startShapes(src: Source, doc: Doc): ShapeSettings {
  const cel = celAt(src.layer, src.frame) ?? src.layer.cels[0];
  const d = cel ? doc.drawings[cel.drawingId] : undefined;
  const base: TraceOptions = {
    ...DEFAULT_TRACE,
    layering: currentChoice('convert.layering'),
    split: currentChoice('convert.split'),
  };
  if (d?.kind === 'pixel' && src.layer.kind === 'pixel') {
    const { px, w, h } = gridOfDrawing(doc, src.layer, d);
    const sep = separateColours(px, w, h, 64, src.mask?.bits);
    const s = suggestTrace({ pixelSize: src.layer.pixelSize, width: w, height: h, distinct: sep.distinct }, { edges: currentChoice('convert.edges.shapes') });
    return { where: currentChoice<LandsWhere>('convert.where'), frames: startFrames(src), trace: { ...base, colours: s.colours, edges: s.edges, speck: s.speck, smooth: s.smooth } };
  }
  return { where: currentChoice<LandsWhere>('convert.where'), frames: startFrames(src), trace: base };
}

/** The pixels for each picture the bakes need. */
export function makePictures(doc: Doc, src: Source, bakes: Bake[], s: Pick<PixelSettings, 'pixelSize' | 'edges'>): Map<string, Placed> {
  const out = new Map<string, Placed>();
  for (const b of bakes) {
    if (out.has(b.key)) continue;
    out.set(b.key, rasterizeFrame(doc, src.layer, b.frame, { pixelSize: s.pixelSize, edges: s.edges, shapeIds: src.selection.length ? src.selection : null }));
  }
  return out;
}

/** The shapes for each picture the bakes need, with how many colours each picture really had. */
export function makeShapes(doc: Doc, src: Source, bakes: Bake[], o: TraceOptions): { traced: Map<string, FillShape[]>; stats: { shapes: number; points: number; distinct: number; exact: boolean; colours: number } } {
  const traced = new Map<string, FillShape[]>();
  const stats = { shapes: 0, points: 0, distinct: 0, exact: true, colours: 0 };
  const layer = src.layer;
  if (layer.kind !== 'pixel') return { traced, stats };
  for (const b of bakes) {
    if (traced.has(b.key)) continue;
    const d = doc.drawings[b.drawingId];
    if (d?.kind !== 'pixel') continue;
    const { px, w, h } = gridOfDrawing(doc, layer, d);
    const r = pixelsToShapes(px, w, h, layer.pixelSize, o, () => uid('sh'), src.mask?.bits);
    traced.set(b.key, r.shapes);
    stats.shapes += r.shapes.length;
    stats.points += r.points;
    stats.distinct = Math.max(stats.distinct, r.distinct);
    stats.exact = stats.exact && r.exact;
    stats.colours = Math.max(stats.colours, r.colours);
  }
  return { traced, stats };
}

/** Turns the shapes into pixels, as one undo step. Returns what happened, or null if there was nothing to do. */
export function turnIntoPixels(src: Source, s: PixelSettings): Applied | null {
  const doc = store().get().doc;
  const bakes = bakesFor(src.layer, s.frames, src.frame, src.clip);
  const pictures = makePictures(doc, src, bakes, s);
  let applied: Applied | null = null;
  store().update(NAMES.pixels, (d) => {
    applied = applyToPixels(d as Doc, { layerId: src.layer.id, bakes, where: s.where, pixelSize: s.pixelSize, pictures, shapeIds: src.selection });
  });
  if (applied) store().setUi({ activeLayerId: (applied as Applied).layerId, selection: [] });
  return applied;
}

/** Turns the pixels into shapes, as one undo step. Returns what happened, or null if there was nothing to do. */
export function turnIntoShapes(src: Source, s: ShapeSettings): Applied | null {
  const doc = store().get().doc;
  const bakes = bakesFor(src.layer, s.frames, src.frame, src.clip);
  const { traced } = makeShapes(doc, src, bakes, s.trace);
  let applied: Applied | null = null;
  store().update(NAMES.shapes, (d) => {
    applied = applyToShapes(d as Doc, { layerId: src.layer.id, bakes, where: s.where, traced, mask: src.mask });
  });
  if (applied) {
    if (src.mask && s.where === 'replace') setPixelSelection(null);
    store().setUi({ activeLayerId: (applied as Applied).layerId, selection: (applied as Applied).shapeIds });
  }
  return applied;
}
