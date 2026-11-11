// The other artboards, drawn on the pasteboard behind the open one, each with its name above it. Only shows when the
// document has more than one artboard. The open artboard is the ordinary stage on top.
import { useEffect, useRef } from 'react';
import type { Doc } from '../core/format';
import { store } from '../core/store';
import { renderFrame } from '../core/render';
import { getViewport } from '../canvas/controller';
import { lookingThrough } from '../camera/ops';
import { tileModeOn } from '../tiles/state';
import { activeArtboard, artboardDoc, artboardsOf, hasArtboards, sizeOf } from './model';
import { rememberedFrame } from './ops';

/** Bitmaps of artboards that aren't open, by artboard id: they only change when that artboard does. */
const bitmaps = new Map<string, { key: unknown[]; canvas: OffscreenCanvas }>();
const MAX_BITMAP = 4096;

const css = (name: string, fallback: string) => {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

function same(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Draws the pasteboard: every artboard but the open one, and every artboard's name. */
export function paintUnderlay(g: CanvasRenderingContext2D, doc: Doc, view: { zoom: number; panX: number; panY: number }, dpr: number, playing: boolean): void {
  const W = g.canvas.width;
  const H = g.canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!hasArtboards(doc) || doc.editing?.length) return;
  const act = activeArtboard(doc);
  const k = view.zoom * dpr;
  const muted = css('--muted', '#8a8598');
  const accent = css('--chosen-bg', '#ffc94a');
  g.font = `${Math.round(12 * dpr)}px Nunito, Inter, system-ui, sans-serif`;
  g.textBaseline = 'bottom';
  for (const a of artboardsOf(doc)) {
    const { w, h } = sizeOf(doc, a);
    const x = Math.round((view.panX + (a.x - act.x) * view.zoom) * dpr);
    const y = Math.round((view.panY + (a.y - act.y) * view.zoom) * dpr);
    const rw = Math.max(1, Math.round(w * k));
    const rh = Math.max(1, Math.round(h * k));
    const open = a.id === act.id;
    // The name sits above the top-left corner.
    g.fillStyle = open ? accent : muted;
    g.globalAlpha = 1;
    g.fillText(a.name, x, y - 4 * dpr, Math.max(40 * dpr, rw));
    if (open) continue;
    if (x >= W || y >= H || x + rw <= 0 || y + rh <= 0) continue;
    const ad = artboardDoc(doc, a.id);
    const frame = playing ? 0 : rememberedFrame(a.id, ad.length);
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.35)';
    g.shadowBlur = 8 * dpr;
    g.fillStyle = ad.background ?? css('--raised', '#2a2633');
    g.fillRect(x, y, rw, rh);
    g.restore();
    if (!ad.background) paintChecker(g, x, y, rw, rh, dpr);
    const key = [a.content, frame, k, doc.symbols, doc.palette, doc.tileset];
    let hit = bitmaps.get(a.id);
    if (rw <= MAX_BITMAP && rh <= MAX_BITMAP) {
      if (!hit || !same(hit.key, key) || hit.canvas.width !== rw || hit.canvas.height !== rh) {
        const c = hit && hit.canvas.width === rw && hit.canvas.height === rh ? hit.canvas : new OffscreenCanvas(rw, rh);
        const cg = c.getContext('2d')!;
        cg.setTransform(1, 0, 0, 1, 0, 0);
        cg.clearRect(0, 0, rw, rh);
        cg.setTransform(rw / ad.width, 0, 0, rh / ad.height, 0, 0);
        cg.imageSmoothingEnabled = false;
        renderFrame(cg, ad, frame, { background: false, camera: false });
        hit = { key, canvas: c };
        bitmaps.set(a.id, hit);
      }
      g.drawImage(hit.canvas, x, y);
    } else {
      // Too big for one bitmap at this zoom: draw straight, cut to the screen.
      g.save();
      g.beginPath();
      g.rect(x, y, rw, rh);
      g.clip();
      g.setTransform(rw / ad.width, 0, 0, rh / ad.height, x, y);
      g.imageSmoothingEnabled = false;
      renderFrame(g, ad, frame, { background: false, camera: false });
      g.restore();
    }
  }
  g.globalAlpha = 1;
}

function paintChecker(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dpr: number): void {
  const s = 8 * dpr;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = 'rgba(128,128,128,0.18)';
  for (let j = 0; j * s < h; j++) for (let i = j % 2; i * s < w; i += 2) g.fillRect(x + i * s, y + j * s, s, s);
  g.restore();
}

/** The pasteboard canvas: sits behind the stage and redraws when the document or the view changes. */
export function ArtboardsUnderlay() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const s = store();
      const { doc, ui } = s.get();
      const { w, h, dpr } = getViewport();
      const cw = Math.max(1, Math.round(w * dpr));
      const ch = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const g = canvas.getContext('2d')!;
      if (s.nestedTag() || tileModeOn() || lookingThrough()) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, cw, ch);
        return;
      }
      paintUnderlay(g, doc, ui, dpr, ui.playing);
    };
    const ask = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    let last = store().get();
    const off = store().subscribe(() => {
      const s = store().get();
      const p = last;
      last = s;
      if (s.doc === p.doc && s.ui.zoom === p.ui.zoom && s.ui.panX === p.ui.panX && s.ui.panY === p.ui.panY && s.ui.playing === p.ui.playing) return;
      if (!hasArtboards(s.doc) && !hasArtboards(p.doc)) return;
      ask();
    });
    const ro = new ResizeObserver(ask);
    ro.observe(canvas);
    ask();
    return () => {
      off();
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return <canvas className="cv-layer ab-underlay" ref={ref} aria-hidden="true" />;
}
