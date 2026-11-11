// What "Show me how" does, and how a quest gets the document ready. Everything here goes through the same doors the
// person would use (commands, the edit helper), so undo works and nothing is special-cased.
import { drawingAt, findLayer, pixelGrid, uid } from '../core/doc';
import type { Doc, PathPoint, Shape, StrokePoint } from '../core/format';
import { getCommand, getTool } from '../core/registry';
import { store } from '../core/store';
import { askAboutUnsavedChanges } from '../io/document';
import { editActiveDrawing } from '../tools/edit';
import { setFillOptions, getFillOptions, type GapPreset } from '../tools/fill-options';
import { docFromPreset, PRESETS } from '../ui/presets';
import { closeSheet } from '../ui/overlays';
import { findTemplate } from '../templates';
import { syncDynamicCommands } from '../ui/dynamic';
import { toast } from '../ui/toast';
import { closedShapeCenter, hasInkAt, hasPixelLayer, hasVectorLayer } from './predicates';

/** A loop of stroke points: a hand-drawn-looking ball, ends meeting. */
function circlePoints(cx: number, cy: number, r: number): StrokePoint[] {
  const n = 36;
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    // A very slight wobble so it looks drawn, not stamped.
    const wob = 1 + Math.sin(a * 3) * 0.015;
    return { x: cx + Math.cos(a) * r * wob, y: cy + Math.sin(a) * r * wob, p: 0.5 };
  });
}

/** Draws a ball on the current frame, for "Show me how". `dx` slides it along (for the second picture). */
export function drawDemoBall(dx = 0): boolean {
  const { doc, ui } = store().get();
  const r = Math.min(doc.width, doc.height) * 0.12;
  const cx = doc.width * 0.35 + dx;
  const cy = doc.height * 0.5;
  const res = editActiveDrawing('Draw stroke', 'vector', (d) => {
    d.shapes.push({ id: uid('s'), type: 'stroke', points: circlePoints(cx, cy, r), brush: { ...ui.brush }, color: ui.color, opacity: 1 });
  });
  return res === 'ok';
}

const shift = (p: { x: number; y: number }, dx: number) => {
  p.x += dx;
};
function shiftShape(s: Shape, dx: number): void {
  if (s.type === 'instance' || s.type === 'text' || s.type === 'particles') {
    s.transform.x += dx;
    return;
  }
  if (s.type === 'stroke') {
    for (const p of s.points) shift(p, dx);
    return;
  }
  for (const sub of s.paths) {
    for (const p of sub.points as PathPoint[]) {
      shift(p, dx);
      if (p.c1) shift(p.c1, dx);
      if (p.c2) shift(p.c2, dx);
    }
  }
}

/** Slides everything on the current drawing along a little, for "Show me how" on the "change it a bit" step. */
export function nudgeDrawing(dx = 60): boolean {
  const { doc, ui } = store().get();
  const hasVector = doc.layers.some((l) => l.kind === 'vector' && drawingAt(doc, l, ui.frame)?.kind === 'vector');
  if (!hasVector) return false;
  return editActiveDrawing('Nudge drawing', 'vector', (d) => void d.shapes.forEach((s) => shiftShape(s as Shape, dx))) === 'ok';
}

/** Puts a new document on screen after asking about unsaved work. False when they said no. */
export async function freshPage(make: () => Doc): Promise<boolean> {
  if (!(await askAboutUnsavedChanges())) return false;
  store().load(make());
  return true;
}

/** An empty page to draw on: the open one when it's empty already, otherwise a new doodle page. */
export function ensureBlankVectorPage(): boolean | Promise<boolean> {
  const s = store().get();
  const empty = hasVectorLayer(s) && !s.doc.layers.some((l) => l.cels.length > 0) && !hasInkAt(s.doc, s.ui.frame);
  if (empty) return true;
  return freshPage(() => docFromPreset(PRESETS.find((p) => p.id === 'doodle') ?? PRESETS[0]));
}

/** A Tiny sprite pixel page (the open one if it's an empty pixel page already). */
export function ensureTinySpritePage(): boolean | Promise<boolean> {
  const s = store().get();
  const empty = hasPixelLayer(s) && !s.doc.layers.some((l) => l.cels.length > 0);
  if (empty) return true;
  const p = PRESETS.find((x) => x.id === 'tiny-sprite');
  if (!p) return false;
  return freshPage(() => docFromPreset(p));
}

/** Loads the Bouncing ball example. */
export async function loadBouncingBall(): Promise<void> {
  const t = findTemplate('bouncing-ball');
  if (!t) return;
  if (!(await askAboutUnsavedChanges())) return;
  store().load(t.make());
  closeSheet();
}

/** Moves the bucket's "Close gaps" setting to the next choice. */
export function nextGapSetting(): void {
  const order: GapPreset[] = ['none', 'small', 'medium', 'large'];
  const cur = getFillOptions().gap;
  setFillOptions({ gap: order[(order.indexOf(cur) + 1) % order.length] });
}

/** Clicks the paint bucket in the middle of the first closed shape (or the middle of the page), for "Show me how". */
export function demoFill(): boolean {
  const { doc, ui } = store().get();
  const tool = getTool('fill');
  if (!tool?.down) return false;
  const at = closedShapeCenter(doc, ui.frame) ?? { x: doc.width / 2, y: doc.height / 2 };
  const before = store().get().doc;
  tool.down(
    { x: at.x, y: at.y, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0 },
    { zoom: 1, requestOverlay() {}, hint: (m) => void toast(m) },
  );
  return store().get().doc !== before;
}

/** Paints a little ring of chunky pixels near the middle of a pixel page, for "Show me how". */
export function drawDemoPixelRing(): boolean {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  if (!layer || layer.kind !== 'pixel') return false;
  const g = pixelGrid(doc, layer);
  const m = /^#([0-9a-f]{6})/i.exec(ui.color);
  const rgb = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [29, 27, 38];
  const cx = Math.floor(g.width / 2);
  const cy = Math.floor(g.height / 2);
  const r = Math.max(2, Math.min(6, Math.floor(Math.min(g.width, g.height) / 5)));
  return (
    editActiveDrawing('Draw pixels', 'pixel', (d) => {
      const px = new Uint8ClampedArray(d.pixels);
      for (let a = 0; a < 64; a++) {
        const x = Math.round(cx + Math.cos((a / 64) * Math.PI * 2) * r);
        const y = Math.round(cy + Math.sin((a / 64) * Math.PI * 2) * r);
        if (x < 0 || y < 0 || x >= d.width || y >= d.height) continue;
        const i = (y * d.width + x) * 4;
        px[i] = rgb[0];
        px[i + 1] = rgb[1];
        px[i + 2] = rgb[2];
        px[i + 3] = 255;
      }
      d.pixels = px;
    }) === 'ok'
  );
}

/** Rubs out a few painted pixels on the current pixel drawing, so it differs from its copy. */
export function tweakPixels(): boolean {
  return (
    editActiveDrawing('Erase pixels', 'pixel', (d) => {
      const px = new Uint8ClampedArray(d.pixels);
      let n = 0;
      for (let i = 3; i < px.length && n < 3; i += 4) {
        if (px[i] > 0) {
          px[i] = 0;
          n++;
        }
      }
      d.pixels = px;
    }) === 'ok'
  );
}

/** Steps the playhead along the first few frames, so "scrub it" can be shown instead of described. */
export async function scrubDemo(): Promise<void> {
  const from = store().get().ui.frame;
  const last = Math.max(0, store().get().doc.length - 1);
  for (let i = 1; i <= 5; i++) {
    await new Promise((r) => setTimeout(r, 140));
    store().setUi({ frame: Math.min(last, from + i) });
  }
}

/** Runs a command by id. The per-tool commands (`tools.fill`) are made on demand, so ask for them to exist first. */
export function runCommandById(id: string): void {
  syncDynamicCommands();
  void getCommand(id)?.run();
}
