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
import type { Doc, Drawing, Layer } from '../core/format';
import { drawingAt } from '../core/doc';
import { drawDrawing } from '../core/render';
import type { OnionSettings } from '../core/store';
import type { Live } from './controller';
import type { Rect } from './view';

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
}

type Canvas2 = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(w: number, h: number): Canvas2 {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
}
const ctxOf = (c: Canvas2) => c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Total bitmap memory we'll hold (in pixels, 4 bytes each), across all layers and frames.
const BUDGET_PIXELS = 40_000_000;

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

  find(d: Drawing, pixelSize: number, w: number, h: number): Entry | undefined {
    const e = this.map.get(d)?.find((x) => x.pixelSize === pixelSize && x.w === w && x.h === h);
    if (e) e.used = ++this.tick;
    return e;
  }

  /** Any bitmap of this drawing, whatever its scale (the freshest). */
  stale(d: Drawing, pixelSize: number): Entry | undefined {
    const list = this.map.get(d)?.filter((x) => x.pixelSize === pixelSize);
    if (!list?.length) return undefined;
    return list.reduce((a, b) => (b.used > a.used ? b : a));
  }

  build(doc: Doc, d: Drawing, pixelSize: number, w: number, h: number): Entry {
    const canvas = makeCanvas(w, h);
    const g = ctxOf(canvas);
    g.setTransform(w / doc.width, 0, 0, h / doc.height, 0, 0);
    drawDrawing(g, d, pixelSize);
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
    const byAge = [...this.all].sort((a, b) => a.used - b.used);
    for (const e of byAge) {
      if (this.total <= BUDGET_PIXELS) break;
      if (e !== keep) this.remove(e);
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
  private onionCache: OnionEntry[] = [];
  private scratch: Canvas2 | null = null;
  private scratch2: Canvas2 | null = null;

  /** Draws the stage content (onion skin and layers). Returns false if it used stale bitmaps and wants another go. */
  paint(g: CanvasRenderingContext2D, p: FrameParams): boolean {
    const { doc, rect } = p;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, p.width, p.height);
    g.save();
    g.beginPath();
    g.rect(rect.x, rect.y, rect.w, rect.h);
    g.clip();

    // Whole-stage bitmaps only make sense while they're no bigger than the screen.
    const cacheable = rect.w * rect.h <= Math.max(2_000_000, p.width * p.height * 1.25);
    let settled = true;

    if (p.onion.enabled && !p.playing) this.paintOnion(g, p, cacheable);

    for (const layer of doc.layers) {
      if (!layer.visible) continue;
      const lv = p.live && p.live.layerId === layer.id ? p.live : null;
      const pixelSize = layer.kind === 'pixel' ? layer.pixelSize : 1;
      if (lv?.kind === 'pixel') {
        g.save();
        g.globalAlpha = layer.opacity;
        g.imageSmoothingEnabled = false;
        const sx = rect.w / doc.width;
        const sy = rect.h / doc.height;
        g.setTransform(sx, 0, 0, sy, rect.x, rect.y);
        g.drawImage(lv.canvas, 0, 0, lv.width * pixelSize, lv.height * pixelSize);
        g.restore();
        continue;
      }
      const drawing = lv?.kind === 'vector' ? lv.drawing : drawingAt(doc, layer, p.frame);
      if (!drawing) continue;
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
          e = this.cache.build(doc, drawing, pixelSize, rect.w, rect.h);
          // The old scales of this drawing are dead weight once a crisp one exists.
          this.cache.dropOtherScales(drawing, rect.w, rect.h);
        }
        g.globalAlpha = layer.opacity;
        g.drawImage(e.canvas, rect.x, rect.y);
        g.globalAlpha = 1;
      } else {
        this.paintDirect(g, p, drawing, layer, pixelSize);
      }
    }
    g.restore();
    return settled;
  }

  private paintDirect(g: CanvasRenderingContext2D, p: FrameParams, drawing: Drawing, layer: Layer, pixelSize: number): void {
    const { doc, rect } = p;
    const sx = rect.w / doc.width;
    const sy = rect.h / doc.height;
    if (layer.opacity >= 1) {
      g.save();
      g.setTransform(sx, 0, 0, sy, rect.x, rect.y);
      drawDrawing(g, drawing, pixelSize);
      g.restore();
      return;
    }
    // Layer opacity applies to the layer as a whole, so it goes through a scratch canvas first.
    const sc = (this.scratch = this.sized(this.scratch, p.width, p.height));
    const sg = ctxOf(sc);
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, p.width, p.height);
    sg.setTransform(sx, 0, 0, sy, rect.x, rect.y);
    drawDrawing(sg, drawing, pixelSize);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = layer.opacity;
    g.drawImage(sc, 0, 0);
    g.restore();
  }

  private sized(c: Canvas2 | null, w: number, h: number): Canvas2 {
    if (c && c.width === w && c.height === h) return c;
    return makeCanvas(w, h);
  }

  // ---------------------------------------------------------------- onion skin

  private paintOnion(g: CanvasRenderingContext2D, p: FrameParams, cacheable: boolean): void {
    const { doc, frame, onion, rect } = p;
    const offsets: [number, number][] = [];
    for (let k = 1; k <= onion.before; k++) if (frame - k >= 0) offsets.push([-k, k]);
    for (let k = 1; k <= onion.after; k++) if (frame + k < doc.length) offsets.push([k, k]);
    // Furthest first, so the nearest ghost ends up on top.
    offsets.sort((a, b) => b[1] - a[1]);
    for (const [off, dist] of offsets) {
      const f = frame + off;
      const items: OnionItem[] = [];
      for (const layer of doc.layers) {
        if (!layer.visible) continue;
        const d = drawingAt(doc, layer, f);
        // A layer that's the same drawing here as on the current frame (a held background) isn't a ghost of anything.
        if (!d || d === drawingAt(doc, layer, frame)) continue;
        items.push({ drawing: d, pixelSize: layer.kind === 'pixel' ? layer.pixelSize : 1 });
      }
      if (!items.length) continue;
      const color = off < 0 ? onion.beforeColor : onion.afterColor;
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

  private drawOnionItems(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, items: OnionItem[], color: string, tint: boolean, w: number, h: number): void {
    for (const it of items) drawDrawing(g, it.drawing, it.pixelSize);
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
    this.drawOnionItems(g, items, color, tint, w, h);
    this.onionCache.push({ items, color, tint, w, h, canvas });
    if (this.onionCache.length > 8) this.onionCache.shift();
    return canvas;
  }

  clear(): void {
    this.cache.clear();
    this.onionCache = [];
    this.scratch = this.scratch2 = null;
  }
}
