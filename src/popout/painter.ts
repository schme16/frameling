// Paints the picture window. It uses the canvas's own FramePainter (which calls the one shared renderer), so the picture is
// drawn exactly the way the drawing window draws it, with its own bitmap cache for this window's size. What it leaves
// out on purpose: onion skin, light table, empty-frame ghost, grid, guides, selection and every handle. It is the picture.
import type { OnionSettings } from '../core/store';
import { drawShape } from '../core/render';
import { FramePainter } from '../canvas/pipeline';
import type { Replica } from './replica';
import { cameraAt, fitPage, inkMatrix, liveOf, pageOf, shownFrame, withoutPictures } from './show';
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

export class PicturePainter {
  private painter = new FramePainter();
  private docId: string | null = null;
  private g: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
  }

  /** The cache is for one drawing at one size: a different file, or a size change, starts it over. */
  forget(): void {
    this.painter.clear();
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
    const frame = shownFrame(r.doc, look.frame);
    const camera = look.camera ? cameraAt(r.doc, frame) : undefined;
    const rect = fitPage(width, height, page, dpr);
    this.painter.paint(g, {
      doc: page,
      frame,
      rect,
      width,
      height,
      live: liveOf(r.live, r.doc),
      onion: NO_ONION,
      playing,
      zooming: false,
      camera,
      activeLayerId: null,
    });
    if (r.ink && !r.doc.editing?.length) this.paintInk(r, page, rect, frame, camera);
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
    drawShape(g, r.ink!);
    g.restore();
  }

  /** While playing: rasterise the next frames in spare time, so each step is a blit. */
  warmAhead(r: Replica, dpr: number, budgetMs: number): void {
    if (!r.doc || !r.look) return;
    const page = withoutPictures(pageOf(r.doc));
    const rect = fitPage(this.canvas.width, this.canvas.height, page, dpr);
    const depth = this.painter.warmDepth(page, rect);
    if (!depth) return;
    const here = shownFrame(r.doc, r.look.frame);
    const frames: number[] = [];
    for (let k = 1; k <= depth; k++) frames.push((here + k) % Math.max(1, page.length));
    this.painter.warm(page, frames, rect, this.canvas.width, this.canvas.height, performance.now() + budgetMs);
  }
}
