// Paints the picture window. It uses the canvas's own FramePainter (which calls the one shared renderer), so the picture is
// drawn exactly the way the drawing window draws it, with its own bitmap cache for this window's size. What it leaves
// out on purpose: onion skin, light table, empty-frame ghost, grid, guides, selection and every handle. It is the picture.
import type { OnionSettings } from '../core/store';
import { drawShape, pixelCanvas } from '../core/render';
import { drawingAt } from '../core/doc';
import type { Shape } from '../core/format';
import type { Live } from '../canvas/controller';
import type { PixelPatch } from './protocol';
import { FramePainter } from '../canvas/pipeline';
import type { Replica } from './replica';
import { cameraAt, fitPage, inkMatrix, liveOf, pageOf, shownFrame, viewRect, withoutPictures } from './show';
import type { Rect } from '../canvas/view';

const NO_ONION: OnionSettings = { enabled: false, before: 0, after: 0, opacity: 0, beforeColor: '#000000', afterColor: '#000000', tint: false };

/** What the last paint worked out, for the page (where the page sits, so marks can follow) and for tests. */
export interface Painted {
  /** The page in CSS pixels inside the window. */
  box: { x: number; y: number; w: number; h: number };
  /** CSS pixels per document pixel. */
  zoom: number;
  frame: number;
  background: string | undefined;
}

/** One canvas the size of the layer's grid, holding the pixels painted so far on the layer being painted on. */
interface PixelCopy {
  layerId: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export class PicturePainter {
  private painter = new FramePainter();
  private pix: PixelCopy | null = null;
  private docId: string | null = null;
  private g: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
  }

  /** The cache is for one drawing at one size: a different file, or a size change, starts it over. */
  forget(): void {
    this.painter.clear();
  }

  /** Puts the pixel pieces that arrived since the last paint on the copy of the layer being painted on. */
  private takePixels(r: Replica, page: ReturnType<typeof pageOf>, frame: number): void {
    const queue = r.pixelQueue;
    if (!queue.length) return;
    r.pixelQueue = [];
    for (const p of queue) {
      if (!p) {
        this.pix = null;
        continue;
      }
      if (p.start || !this.pix || this.pix.layerId !== p.layerId || this.pix.width !== p.width || this.pix.height !== p.height) {
        // A piece that is not a start and has nothing to go on (the start was lost) is skipped; the sender is asked again.
        if (!p.start) continue;
        this.pix = this.startCopy(page, frame, p);
      }
      const c = this.pix;
      if (!c || !p.w || !p.h) continue;
      const g = c.canvas.getContext('2d')!;
      g.putImageData(new ImageData(p.data as Uint8ClampedArray<ArrayBuffer>, p.w, p.h), p.x, p.y);
    }
  }

  private startCopy(page: ReturnType<typeof pageOf>, frame: number, p: PixelPatch): PixelCopy | null {
    // The same layer and size again (a whole picture every frame): the canvas is cleared and reused, not made anew.
    const was = this.pix;
    const same = was && was.layerId === p.layerId && was.width === p.width && was.height === p.height;
    const canvas = same ? was.canvas : document.createElement('canvas');
    if (same) canvas.getContext('2d')!.clearRect(0, 0, p.width, p.height);
    else {
      canvas.width = p.width;
      canvas.height = p.height;
    }
    const layer = page.layers.find((l) => l.id === p.layerId);
    if (!layer || layer.kind !== 'pixel') return null;
    if (p.base) {
      const d = drawingAt(page, layer, frame);
      if (d && d.kind === 'pixel' && d.width > 0) canvas.getContext('2d')!.drawImage(pixelCanvas(d), d.x ?? 0, d.y ?? 0);
    }
    return { layerId: p.layerId, canvas, width: p.width, height: p.height };
  }

  /** The layer being painted on, as the painter takes it. */
  private pixelLive(): Live | null {
    const c = this.pix;
    return c ? { layerId: c.layerId, kind: 'pixel', canvas: c.canvas, x: 0, y: 0, width: c.width, height: c.height } : null;
  }

  paint(r: Replica, dpr: number, playing: boolean): Painted | null {
    if (!r.doc || !r.look) return null;
    const { canvas, g } = this;
    const width = canvas.width;
    const height = canvas.height;
    if (r.doc.id !== this.docId) {
      this.docId = r.doc.id;
      this.painter.clear();
    }
    const look = r.look;
    const page = withoutPictures(pageOf(r.doc));
    const frame = shownFrame(r.doc, r.freeFrame ?? look.frame);
    const camera = look.camera ? cameraAt(r.doc, frame) : undefined;
    this.takePixels(r, page, frame);
    const rect = viewRect(fitPage(width, height, page, dpr), r.userView, width, height, dpr);
    this.painter.paint(g, {
      doc: page,
      frame,
      rect,
      width,
      height,
      // A reviewer looking at a frame of their own is not shown the sharer's stroke in progress: it belongs to another frame.
      live: r.doc.editing?.length || r.freeFrame !== null ? null : (this.pixelLive() ?? liveOf(r.live, r.doc)),
      onion: NO_ONION,
      playing,
      zooming: false,
      camera,
      activeLayerId: null,
    });
    if (r.ink && !r.doc.editing?.length && r.freeFrame === null) this.paintInk(r, page, rect, frame, camera);
    return { box: { x: rect.x / dpr, y: rect.y / dpr, w: rect.w / dpr, h: rect.h / dpr }, zoom: rect.w / dpr / page.width, frame, background: page.background ?? undefined };
  }

  /** The stroke the pen is drawing right now, where it will land. */
  private paintInk(r: Replica, page: ReturnType<typeof pageOf>, rect: Rect, frame: number, camera: ReturnType<typeof cameraAt>): void {
    const { g } = this;
    g.save();
    g.setTransform(rect.w / page.width, 0, 0, rect.h / page.height, rect.x, rect.y);
    g.beginPath();
    g.rect(0, 0, page.width, page.height);
    g.clip();
    for (const m of inkMatrix(page, r.look!.activeLayerId, frame, camera)) g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    for (const s of ([] as readonly Shape[]).concat(r.ink!)) drawShape(g, s);
    g.restore();
  }

  /** While playing: rasterise the next frames in spare time, so each step is a blit. */
  warmAhead(r: Replica, dpr: number, budgetMs: number): void {
    if (!r.doc || !r.look) return;
    const page = withoutPictures(pageOf(r.doc));
    const rect = viewRect(fitPage(this.canvas.width, this.canvas.height, page, dpr), r.userView, this.canvas.width, this.canvas.height, dpr);
    const depth = this.painter.warmDepth(page, rect);
    if (!depth) return;
    const here = shownFrame(r.doc, r.freeFrame ?? r.look.frame);
    const frames: number[] = [];
    for (let k = 1; k <= depth; k++) frames.push((here + k) % Math.max(1, page.length));
    this.painter.warm(page, frames, rect, this.canvas.width, this.canvas.height, performance.now() + budgetMs);
  }
}
