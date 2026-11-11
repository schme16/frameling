/**
 * Paints a frame onto the main canvas. Every layer's drawing is rasterised once into a bitmap and then just blitted
 * while you pan, scrub and play; a bitmap is rebuilt only when the drawing object, the zoom or the pixel size
 * changes (drawings are immutable, so "changed" is a reference check). When zoomed in so far that a whole-stage
 * bitmap would be bigger than the screen, layers are drawn straight to the canvas instead (the GPU only does the
 * visible part, and there's nothing worth caching).
 *
 * The shared renderer (core/render.ts) does all the actual drawing of shapes and pixels, so this view, thumbnails and
 * exports can never disagree about what a frame looks like.
 */
import type { CameraView, Doc, Drawing, Layer } from '../core/format';
import { layerCameraMatrix } from '../core/camera';
import type { Mat } from '../core/symbols';
import { poseAt, poseLive } from '../core/symbols';
import { paintEditBackdrop } from './backdrop';
import { bindMatrixAt } from '../rig/pose';
import { drawDrawing, drawShape, pixelCanvas } from '../core/render';
import type { OnionSettings } from '../core/store';
import type { Live } from './controller';
import type { Rect } from './view';
import { paintComposited } from '../effects/stage';
import { EffectCache } from '../effects/composite';
import { needsCompositor } from '../effects/model';
import { GHOST_ALPHA, type GhostItem } from './ghost';
import { onionFrames } from './onion';

export interface FrameParams {
  doc: Doc;
  frame: number;
  /** The stage on the device-pixel canvas. */
  rect: Rect;
  /** Device-pixel size of the canvas. */
  width: number;
  height: number;
  live: Live | null;
  onion: OnionSettings;
  playing: boolean;
  /** The zoom is changing right now: use slightly stale bitmaps rather than re-rasterising on every wheel tick. */
  zooming: boolean;
  /** Tile mode: also paint a copy of the stage on every side, so seams show. */
  tileMode?: boolean;
  /** How strongly the copies show in tile mode (1 = as strong as the stage). */
  tileCopyAlpha?: number;
  /** Look through this camera view (the canvas is showing what the camera sees). */
  camera?: CameraView;
  /**
   * Also show what's drawn off the stage (there's a camera to pan over it): faded, except inside `frame` (the
   * camera's view, in stage space), which shows as the camera sees it.
   */
  pasteboard?: { frame?: { x: number; y: number }[] };
  /** The layer being worked on (a mask layer being drawn shows faintly on top). */
  activeLayerId?: string | null;
  /** The empty frame ghost: last drawings to show faintly where a layer has nothing (see ghost.ts). */
  ghost?: GhostItem[];
  /** The light table: a pinned frame or drawing shown faintly under everything (see lightTable.ts). */
  lightTable?: { items: GhostItem[]; alpha: number; tint: string | null };
}

const AROUND: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

type Canvas2 = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(w: number, h: number): Canvas2 {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
}
const ctxOf = (c: Canvas2) => c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Total bitmap memory we'll hold (in pixels, 4 bytes each), across all layers and frames.
export const BUDGET_PIXELS = 40_000_000;

interface Entry {
  drawing: Drawing;
  pixelSize: number;
  w: number;
  h: number;
  canvas: Canvas2;
  used: number;
  list: Entry[];
}

export class BitmapCache {
  private map = new WeakMap<Drawing, Entry[]>();
  private all = new Set<Entry>();
  private total = 0;
  private tick = 0;
  /** How many bitmaps were rasterised (for tests and tuning). */
  builds = 0;
  /** How many of those only drew the shapes added to an earlier bitmap. */
  appends = 0;
  /** How many lookups found a ready bitmap. */
  hits = 0;
  /** Bitmaps thrown out to stay inside the budget. */
  evictions = 0;

  find(d: Drawing, pixelSize: number, w: number, h: number): Entry | undefined {
    const e = this.map.get(d)?.find((x) => x.pixelSize === pixelSize && x.w === w && x.h === h);
    if (e) {
      this.bump(e);
      this.hits++;
    }
    return e;
  }

  /** Is there a ready bitmap (without counting a hit or making it the freshest)? */
  has(d: Drawing, pixelSize: number, w: number, h: number): boolean {
    return !!this.map.get(d)?.some((x) => x.pixelSize === pixelSize && x.w === w && x.h === h);
  }

  /** Makes a bitmap the freshest, so it's the last to go when memory runs out. */
  touch(d: Drawing, pixelSize: number, w: number, h: number): void {
    const e = this.map.get(d)?.find((x) => x.pixelSize === pixelSize && x.w === w && x.h === h);
    if (e) this.bump(e);
  }

  /** Moves a bitmap to the fresh end of the eviction order (a Set iterates in insertion order). */
  private bump(e: Entry): void {
    e.used = ++this.tick;
    this.all.delete(e);
    this.all.add(e);
  }

  /** Bitmaps held, and the pixels they take. */
  get size(): { entries: number; pixels: number } {
    return { entries: this.all.size, pixels: this.total };
  }

  /** Any bitmap of this drawing, whatever its scale (the freshest). */
  stale(d: Drawing, pixelSize: number): Entry | undefined {
    const list = this.map.get(d)?.filter((x) => x.pixelSize === pixelSize);
    if (!list?.length) return undefined;
    return list.reduce((a, b) => (b.used > a.used ? b : a));
  }

  /**
   * Rasterises a drawing into a new bitmap. With `from` (the bitmap of an earlier version of this drawing whose
   * shapes are a prefix of this one's) only the shapes added since are drawn on top of a copy, which is the same
   * sequence of paint operations the full draw would do, minus the repeats. That's what a new brush stroke is.
   */
  build(doc: Doc, d: Drawing, pixelSize: number, w: number, h: number, from?: Entry): Entry {
    const canvas = makeCanvas(w, h);
    const g = ctxOf(canvas);
    if (from && from.drawing.kind === 'vector' && d.kind === 'vector') {
      g.drawImage(from.canvas, 0, 0);
      g.setTransform(w / doc.width, 0, 0, h / doc.height, 0, 0);
      for (let i = from.drawing.shapes.length; i < d.shapes.length; i++) drawShape(g, d.shapes[i], { doc, frame: 0 });
      this.appends++;
    } else {
      g.setTransform(w / doc.width, 0, 0, h / doc.height, 0, 0);
      // The frame only matters to tilemaps, and those inside symbols carry their own.
      drawDrawing(g, d, pixelSize, { doc, frame: 0 });
    }
    this.builds++;
    let list = this.map.get(d);
    if (!list) this.map.set(d, (list = []));
    const e: Entry = { drawing: d, pixelSize, w, h, canvas, used: ++this.tick, list };
    list.push(e);
    this.all.add(e);
    this.total += w * h;
    this.trim(e);
    return e;
  }

  /** Drops bitmaps of other scales for a drawing (after a zoom settles). */
  dropOtherScales(d: Drawing, w: number, h: number): void {
    const list = this.map.get(d);
    if (!list) return;
    for (const e of [...list]) if (e.w !== w || e.h !== h) this.remove(e);
  }

  private remove(e: Entry): void {
    this.all.delete(e);
    this.total -= e.w * e.h;
    const i = e.list.indexOf(e);
    if (i >= 0) e.list.splice(i, 1);
  }

  private trim(keep: Entry): void {
    if (this.total <= BUDGET_PIXELS) return;
    // Oldest first. Removing while iterating a Set is fine.
    for (const e of this.all) {
      if (this.total <= BUDGET_PIXELS) break;
      if (e !== keep) {
        this.remove(e);
        this.evictions++;
      }
    }
  }

  clear(): void {
    this.all.clear();
    this.total = 0;
    this.map = new WeakMap();
  }
}

interface OnionItem {
  drawing: Drawing;
  pixelSize: number;
}
interface OnionEntry {
  items: OnionItem[];
  color: string;
  tint: boolean;
  w: number;
  h: number;
  canvas: Canvas2;
}

export class FramePainter {
  readonly cache = new BitmapCache();
  /** Finished effect pictures (glows, blurs) for layers that have effects. */
  readonly effects = new EffectCache();
  private onionCache: OnionEntry[] = [];
  private scratch: Canvas2 | null = null;
  private scratch2: Canvas2 | null = null;
  /** The vector drawing each layer last painted from the cache, to spot a stroke being added. */
  private lastVector = new Map<string, Drawing>();

  /** Whole-stage bitmaps only make sense while they're no bigger than the screen. */
  private isCacheable(rect: Rect, width: number, height: number): boolean {
    return rect.w * rect.h <= Math.max(2_000_000, width * height * 1.25);
  }

  /** How many frames ahead of the playhead fit in about half the bitmap budget (at most 48). */
  warmDepth(doc: Doc, rect: Rect): number {
    const layers = doc.layers.filter((l) => l.visible && l.kind === 'vector').length;
    if (!layers) return 0;
    return Math.max(0, Math.min(48, Math.floor((BUDGET_PIXELS * 0.5) / (layers * rect.w * rect.h))));
  }

  /**
   * Rasterises the bitmaps these frames will need, nearest first, so playback only has to blit them. Stops at the
   * deadline (performance.now() time) and returns true when every frame was ready. Never draws on screen.
   */
  warm(doc: Doc, frames: number[], rect: Rect, width: number, height: number, deadline: number): boolean {
    if (!this.isCacheable(rect, width, height)) return true;
    let done = true;
    outer: for (const f of frames) {
      for (const layer of doc.layers) {
        if (!layer.visible) continue;
        const d = poseAt(doc, layer, f);
        if (!d) continue;
        if (d.kind === 'pixel') {
          pixelCanvas(d);
          continue;
        }
        if (d.kind === 'tilemap') continue;
        if (this.cache.has(d, 1, rect.w, rect.h)) continue;
        if (performance.now() >= deadline) {
          done = false;
          break outer;
        }
        this.cache.build(doc, d, 1, rect.w, rect.h);
      }
    }
    // Furthest first, so the frames about to play are the freshest and the last to be evicted.
    for (let i = frames.length - 1; i >= 0; i--) {
      for (const layer of doc.layers) {
        const d = layer.visible ? poseAt(doc, layer, frames[i]) : undefined;
        if (d?.kind === 'vector') this.cache.touch(d, 1, rect.w, rect.h);
      }
    }
    return done;
  }

  /** Draws the stage content (onion skin and layers). Returns false if it used stale bitmaps and wants another go. */
  paint(g: CanvasRenderingContext2D, p: FrameParams): boolean {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, p.width, p.height);
    if (!p.tileMode) return this.paintStage(g, p, false);
    // Tile mode: the eight copies around the stage first (each the same bitmaps, so it's just more blits).
    let settled = true;
    const r = p.rect;
    for (const [i, j] of AROUND) {
      const rect = { x: r.x + i * r.w, y: r.y + j * r.h, w: r.w, h: r.h };
      if (rect.x >= p.width || rect.y >= p.height || rect.x + rect.w <= 0 || rect.y + rect.h <= 0) continue;
      settled = this.paintStage(g, { ...p, rect, live: p.live, onion: { ...p.onion, enabled: false } }, true) && settled;
    }
    return this.paintStage(g, p, false) && settled;
  }

  private paintStage(g: CanvasRenderingContext2D, p: FrameParams, copy: boolean): boolean {
    const { doc, rect } = p;
    g.save();
    g.beginPath();
    g.rect(rect.x, rect.y, rect.w, rect.h);
    g.clip();
    // The stage's own background is the element behind the canvas; copies paint theirs here. So do frames with blend
    // modes, which need something real to blend with.
    const composited = needsCompositor(doc);
    if ((copy || composited) && doc.background) {
      g.fillStyle = doc.background;
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    // Whole-stage bitmaps only make sense while they're no bigger than the screen.
    const cacheable = this.isCacheable(rect, p.width, p.height);
    let settled = true;

    // Inside a symbol: the scene around it, dimmed, in the symbol's own space.
    if (doc.editing?.length) paintEditBackdrop(g, doc, rect);

    // The light table sits under the onion skin and the ghost: it's the page you trace on.
    if (p.lightTable?.items.length && !p.playing && !p.camera && !copy) this.paintGhost(g, p, p.lightTable.items, cacheable, p.lightTable.alpha, p.lightTable.tint);
    // Through the camera the onion skin would be in the wrong place, so it's left out.
    if (p.onion.enabled && !p.playing && !p.camera) this.paintOnion(g, p, cacheable);
    else if (p.ghost?.length && !p.playing && !p.camera && !copy) this.paintGhost(g, p, p.ghost, cacheable);

    if (composited) settled = paintComposited(this, g, p, cacheable) && settled;
    else for (const layer of doc.layers) {
      if (!layer.visible) continue;
      const lv = p.live && p.live.layerId === layer.id ? p.live : null;
      if (layer.kind === 'camera') continue;
      const pixelSize = layer.kind === 'vector' ? 1 : layer.pixelSize;
      if (lv?.kind === 'pixel') {
        g.save();
        g.globalAlpha = layer.opacity;
        g.imageSmoothingEnabled = false;
        const sx = rect.w / doc.width;
        const sy = rect.h / doc.height;
        g.setTransform(sx, 0, 0, sy, rect.x, rect.y);
        const lc = p.camera ? layerCameraMatrix(doc, layer, p.camera) : undefined;
        if (lc) g.transform(lc[0], lc[1], lc[2], lc[3], lc[4], lc[5]);
        // Pixels being painted on a part attached to a bone show where the part is.
        const bm = bindMatrixAt(doc, layer, p.frame);
        if (bm) g.transform(bm[0], bm[1], bm[2], bm[3], bm[4], bm[5]);
        g.drawImage(lv.canvas, 0, 0, lv.width * pixelSize, lv.height * pixelSize);
        g.restore();
        continue;
      }
      const drawing = lv?.kind === 'vector' ? poseLive(doc, layer, p.frame, lv.drawing) : lv?.kind === 'tilemap' ? lv.drawing : poseAt(doc, layer, p.frame);
      if (!drawing) continue;
      const cam = p.camera ? layerCameraMatrix(doc, layer, p.camera) : undefined;
      if (cam) {
        // Moved by the camera: drawn straight through it (a stage-sized bitmap would cut off what's outside).
        this.paintDirect(g, p, drawing, layer, pixelSize, cam);
        continue;
      }
      if (drawing.kind === 'vector' && cacheable && !lv) {
        let e = this.cache.find(drawing, pixelSize, rect.w, rect.h);
        if (!e && p.zooming) {
          const old = this.cache.stale(drawing, pixelSize);
          if (old) {
            g.globalAlpha = layer.opacity;
            g.drawImage(old.canvas, rect.x, rect.y, rect.w, rect.h);
            g.globalAlpha = 1;
            settled = false;
            continue;
          }
        }
        if (!e) {
          e = this.cache.build(doc, drawing, pixelSize, rect.w, rect.h, this.growthSource(layer.id, drawing, pixelSize, rect.w, rect.h));
          // The old scales of this drawing are dead weight once a crisp one exists.
          this.cache.dropOtherScales(drawing, rect.w, rect.h);
        }
        this.lastVector.set(layer.id, drawing);
        g.globalAlpha = layer.opacity;
        g.drawImage(e.canvas, rect.x, rect.y);
        g.globalAlpha = 1;
      } else {
        this.paintDirect(g, p, drawing, layer, pixelSize);
      }
    }
    if (p.pasteboard && !copy && !p.live) {
      g.restore();
      this.paintPasteboard(g, p);
      g.save();
    }
    if (copy && p.tileCopyAlpha !== undefined && p.tileCopyAlpha < 1) {
      // Fade a copy towards the canvas behind it.
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = 1 - p.tileCopyAlpha;
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    g.restore();
    return settled;
  }

  /**
   * The bitmap this layer showed last, if the new drawing is that one plus more shapes on top (the same shape
   * objects in the same order, which immer's structural sharing keeps for everything untouched).
   */
  private growthSource(layerId: string, d: Drawing, pixelSize: number, w: number, h: number): Entry | undefined {
    const prev = this.lastVector.get(layerId);
    if (!prev || prev === d || prev.kind !== 'vector' || d.kind !== 'vector') return undefined;
    const n = prev.shapes.length;
    if (!n || d.shapes.length <= n) return undefined;
    for (let i = 0; i < n; i++) if (prev.shapes[i] !== d.shapes[i]) return undefined;
    return this.cache.find(prev, pixelSize, w, h);
  }

  private paintDirect(g: CanvasRenderingContext2D, p: FrameParams, drawing: Drawing, layer: Layer, pixelSize: number, cam?: Mat): void {
    const { doc, rect } = p;
    const sx = rect.w / doc.width;
    const sy = rect.h / doc.height;
    if (layer.opacity >= 1) {
      g.save();
      g.setTransform(sx, 0, 0, sy, rect.x, rect.y);
      if (cam) g.transform(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
      drawDrawing(g, drawing, pixelSize, { doc, frame: p.frame });
      g.restore();
      return;
    }
    // Layer opacity applies to the layer as a whole, so it goes through a scratch canvas first.
    const sc = (this.scratch = this.sized(this.scratch, p.width, p.height));
    const sg = ctxOf(sc);
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, p.width, p.height);
    sg.setTransform(sx, 0, 0, sy, rect.x, rect.y);
    if (cam) sg.transform(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    drawDrawing(sg, drawing, pixelSize, { doc, frame: p.frame });
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = layer.opacity;
    g.drawImage(sc, 0, 0);
    g.restore();
  }

  /**
   * What's drawn beyond the stage, faded, so a camera has something to pan over. Drawn straight (no bitmaps: they only
   * cover the stage), and skipped while a stroke is going in.
   */
  private paintPasteboard(g: CanvasRenderingContext2D, p: FrameParams): void {
    const { doc, rect } = p;
    g.save();
    g.beginPath();
    g.rect(0, 0, p.width, p.height);
    g.rect(rect.x, rect.y, rect.w, rect.h);
    g.clip('evenodd');
    g.setTransform(rect.w / doc.width, 0, 0, rect.h / doc.height, rect.x, rect.y);
    const frame = p.pasteboard?.frame;
    const framePath = () => {
      g.beginPath();
      frame!.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
      g.closePath();
    };
    // The camera sees the stage colour beyond the stage too (exports fill the whole picture with it).
    if (frame && doc.background) {
      framePath();
      g.fillStyle = doc.background;
      g.fill();
    }
    for (const layer of doc.layers) {
      if (!layer.visible || layer.kind === 'camera') continue;
      const d = poseAt(doc, layer, p.frame);
      if (!d) continue;
      g.globalAlpha = 1;
      const ps = layer.kind === 'vector' ? 1 : layer.pixelSize;
      if (layer.opacity < 1) {
        // Close enough off stage: shapes fade one by one rather than as a whole layer.
        g.globalAlpha = layer.opacity;
      }
      drawDrawing(g, d, ps, { doc, frame: p.frame });
    }
    // Faded towards the canvas colour, so the stage still reads as the stage.
    g.globalAlpha = 0.55;
    g.fillStyle = getComputedStyleSafe('--canvas-bg', '#121019');
    if (frame) {
      // Faded outside the camera's view only.
      g.beginPath();
      g.rect(-1e6, -1e6, 2e6, 2e6);
      frame.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
      g.closePath();
      g.fill('evenodd');
    } else {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillRect(0, 0, p.width, p.height);
    }
    g.restore();
  }

  private sized(c: Canvas2 | null, w: number, h: number): Canvas2 {
    if (c && c.width === w && c.height === h) return c;
    return makeCanvas(w, h);
  }

  // ---------------------------------------------------------------- onion skin

  private paintOnion(g: CanvasRenderingContext2D, p: FrameParams, cacheable: boolean): void {
    const { doc, frame, onion, rect } = p;
    // Furthest first, so the nearest ghost ends up on top.
    for (const { frame: f, side, dist } of onionFrames(doc, frame, onion)) {
      const items: OnionItem[] = [];
      for (const layer of doc.layers) {
        if (!layer.visible || layer.onion === false) continue;
        const d = poseAt(doc, layer, f);
        // A layer that's the same drawing here as on the current frame (a held background) isn't a ghost of anything.
        if (!d || d === poseAt(doc, layer, frame)) continue;
        // Tilemaps stay out of the onion skin: a level behind the character isn't a ghost of anything.
        if (d.kind === 'tilemap') continue;
        items.push({ drawing: d, pixelSize: layer.kind === 'pixel' ? layer.pixelSize : 1 });
      }
      if (!items.length) continue;
      const color = side === 'before' ? onion.beforeColor : onion.afterColor;
      const alpha = onion.opacity * Math.pow(0.65, dist - 1);
      g.globalAlpha = alpha;
      if (cacheable) {
        const c = this.onionBitmap(doc, items, color, onion.tint, rect.w, rect.h);
        g.drawImage(c, rect.x, rect.y);
      } else {
        const sc = (this.scratch2 = this.sized(this.scratch2, p.width, p.height));
        const sg = ctxOf(sc);
        sg.setTransform(1, 0, 0, 1, 0, 0);
        sg.clearRect(0, 0, p.width, p.height);
        sg.setTransform(rect.w / doc.width, 0, 0, rect.h / doc.height, rect.x, rect.y);
        this.drawOnionItems(sg, items, color, onion.tint, p.width, p.height);
        g.drawImage(sc, 0, 0);
      }
      g.globalAlpha = 1;
    }
  }

  private paintGhost(g: CanvasRenderingContext2D, p: FrameParams, items: GhostItem[], cacheable: boolean, alpha = GHOST_ALPHA, tint: string | null = null): void {
    const { doc, rect } = p;
    g.globalAlpha = alpha;
    if (cacheable) g.drawImage(this.onionBitmap(doc, items, tint ?? '', !!tint, rect.w, rect.h), rect.x, rect.y);
    else {
      const sc = (this.scratch2 = this.sized(this.scratch2, p.width, p.height));
      const sg = ctxOf(sc);
      sg.setTransform(1, 0, 0, 1, 0, 0);
      sg.clearRect(0, 0, p.width, p.height);
      sg.setTransform(rect.w / doc.width, 0, 0, rect.h / doc.height, rect.x, rect.y);
      this.drawOnionItems(sg, items, tint ?? '', !!tint, p.width, p.height);
      g.drawImage(sc, 0, 0);
    }
    g.globalAlpha = 1;
  }

  /**
   * With `doc` (the stage-sized bitmap path) a vector drawing is blitted from its cached layer bitmap, the same one
   * the frame uses when it's the current one, instead of rasterising every stroke again. Without it, drawn directly.
   */
  private drawOnionItems(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, items: OnionItem[], color: string, tint: boolean, w: number, h: number, doc?: Doc): void {
    for (const it of items) {
      if (doc && it.drawing.kind === 'vector') {
        const e = this.cache.find(it.drawing, it.pixelSize, w, h) ?? this.cache.build(doc, it.drawing, it.pixelSize, w, h);
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(e.canvas, 0, 0);
        g.restore();
      } else drawDrawing(g, it.drawing, it.pixelSize);
    }
    if (tint) {
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      g.restore();
    }
  }

  private onionBitmap(doc: Doc, items: OnionItem[], color: string, tint: boolean, w: number, h: number): Canvas2 {
    const same = (e: OnionEntry) =>
      e.w === w && e.h === h && e.color === color && e.tint === tint && e.items.length === items.length && e.items.every((x, i) => x.drawing === items[i].drawing && x.pixelSize === items[i].pixelSize);
    const hit = this.onionCache.find(same);
    if (hit) {
      // Most recent last.
      this.onionCache.splice(this.onionCache.indexOf(hit), 1);
      this.onionCache.push(hit);
      return hit.canvas;
    }
    const canvas = makeCanvas(w, h);
    const g = ctxOf(canvas);
    g.setTransform(w / doc.width, 0, 0, h / doc.height, 0, 0);
    this.drawOnionItems(g, items, color, tint, w, h, doc);
    this.onionCache.push({ items, color, tint, w, h, canvas });
    if (this.onionCache.length > 8) this.onionCache.shift();
    return canvas;
  }

  /** A vector drawing's stage-sized bitmap, built (from the last one this layer showed, if it only grew) when missing. */
  vectorBitmap(doc: Doc, layerId: string, d: Drawing, pixelSize: number, w: number, h: number): Entry {
    let e = this.cache.find(d, pixelSize, w, h);
    if (!e) {
      e = this.cache.build(doc, d, pixelSize, w, h, this.growthSource(layerId, d, pixelSize, w, h));
      this.cache.dropOtherScales(d, w, h);
    }
    this.lastVector.set(layerId, d);
    return e;
  }

  clear(): void {
    this.effects.clear();
    this.cache.clear();
    this.onionCache = [];
    this.scratch = this.scratch2 = null;
    this.lastVector.clear();
  }
}

function getComputedStyleSafe(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
