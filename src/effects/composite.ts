/**
 * The compositor: draws a frame's layers with blend modes, effects, clipping, masks and folders. The single
 * renderer (core/render.ts) and the editor canvas (canvas/pipeline.ts) both call it, each with its own way of
 * painting one layer's content, so the canvas and every export agree.
 *
 * Plain layers (normal blend, no effects, not clipped) are painted straight onto the target as before, so a
 * document that only uses a blend mode on one layer pays for one buffer, not one per layer.
 */
import type { BlendMode, Doc, Layer, LayerEffect } from '../core/format';
import { applyEffect, BufferPool, ctx2, makeCanvas, type Canvas2, type Ctx } from './apply';
import { activeEffects, compositeOp } from './model';
import type { PlanNode, PlanStep } from './plan';

export interface CompositeHooks {
  /** Paints a layer's content at full opacity. `g` already has the document-to-canvas transform. */
  paint(g: Ctx, layer: Layer): void;
  /** What the layer shows right now (its drawing), so effect results can be reused. Undefined = don't reuse. */
  key?(layer: Layer): object | undefined;
}

// ---------------------------------------------------------------- effect results cache

interface CacheEntry {
  key: object;
  sig: string;
  canvas: Canvas2;
}

/**
 * Finished effect pictures, by layer content and settings, so playing or scrubbing over a held drawing with a glow
 * re-blurs nothing. Kept inside a pixel budget, oldest out first.
 */
export class EffectCache {
  private map = new WeakMap<object, CacheEntry[]>();
  private order = new Set<CacheEntry>();
  private pixels = 0;
  hits = 0;
  builds = 0;
  constructor(public budget = 24_000_000) {}

  get(key: object, sig: string): Canvas2 | undefined {
    const e = this.map.get(key)?.find((x) => x.sig === sig);
    if (!e) return undefined;
    this.order.delete(e);
    this.order.add(e);
    this.hits++;
    return e.canvas;
  }

  set(key: object, sig: string, canvas: Canvas2): void {
    let list = this.map.get(key);
    if (!list) this.map.set(key, (list = []));
    const e: CacheEntry = { key, sig, canvas };
    list.push(e);
    this.order.add(e);
    this.pixels += canvas.width * canvas.height;
    this.builds++;
    for (const old of this.order) {
      if (this.pixels <= this.budget || old === e) break;
      this.drop(old);
    }
  }

  private drop(e: CacheEntry): void {
    this.order.delete(e);
    this.pixels -= e.canvas.width * e.canvas.height;
    const list = this.map.get(e.key);
    const i = list?.indexOf(e) ?? -1;
    if (list && i >= 0) list.splice(i, 1);
  }

  get size(): { entries: number; pixels: number } {
    return { entries: this.order.size, pixels: this.pixels };
  }

  clear(): void {
    this.map = new WeakMap();
    this.order.clear();
    this.pixels = 0;
  }
}

// ---------------------------------------------------------------- compositing

// One pool per nesting depth: a symbol with effects inside is composited while its layer is being composited, on a
// canvas of another size, and sharing one pool would hand the outer run buffers of the wrong size.
const pools: BufferPool[] = [];
let depth = 0;

function poolFor(w: number, h: number): BufferPool {
  let p = pools[depth];
  if (!p) p = pools[depth] = new BufferPool(w, h);
  else p.resize(w, h);
  return p;
}

/** Scratch canvases made so far (for tests). */
export function poolStats(): { made: number } {
  return { made: pools.reduce((n, p) => n + p.made, 0) };
}

interface Run {
  doc: Doc;
  frame: number;
  hooks: CompositeHooks;
  cache?: EffectCache;
  pool: BufferPool;
  /** The document-to-canvas transform. */
  m: DOMMatrix;
  scale: number;
  origin: { x: number; y: number };
}

/**
 * Draws the plan onto `g`, whose transform maps document pixels to its canvas. Nothing is left changed on `g`.
 */
export function compositePlan(g: Ctx, doc: Doc, frame: number, steps: PlanStep[], hooks: CompositeHooks, cache?: EffectCache): void {
  const target = g.canvas as { width: number; height: number };
  const w = Math.max(1, target.width);
  const h = Math.max(1, target.height);
  const m = g.getTransform();
  const pool = poolFor(w, h);
  depth++;
  try {
    compositeRun(g, steps, { doc, frame, hooks, cache, pool, m, scale: Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1, origin: { x: m.e, y: m.f } });
  } finally {
    depth--;
  }
}

function compositeRun(g: Ctx, steps: PlanStep[], run: Run): void {
  // A mask at the stage level cuts out the layers under it, not whatever was on the canvas before (the background).
  if (steps.some((s) => s.type === 'mask')) {
    const buf = run.pool.get();
    drawLevel(run, ctx2(buf), steps);
    blit(g, buf, 'normal', 1);
    run.pool.put(buf);
    return;
  }
  drawLevel(run, g, steps);
}

/** Draws a canvas-sized picture onto a target 1:1, whatever the target's transform. */
function blit(g: Ctx, c: Canvas2, blend: BlendMode | undefined, alpha: number): void {
  if (alpha <= 0) return;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = alpha;
  g.globalCompositeOperation = compositeOp(blend);
  g.drawImage(c, 0, 0);
  g.restore();
}

function drawLevel(run: Run, g: Ctx, steps: PlanStep[]): void {
  for (const s of steps) {
    if (s.type === 'mask') {
      const m = layerPicture(run, s.layer);
      if (!m) continue;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = s.layer.mask === 'hide' ? 'destination-out' : 'destination-in';
      g.drawImage(m.canvas, 0, 0);
      g.restore();
      m.done();
      continue;
    }
    drawStep(run, g, s.node, s.clips);
  }
}

function nodeLook(node: PlanNode): { blend?: BlendMode; opacity: number; effects?: LayerEffect[] } {
  return node.type === 'layer' ? node.layer : node.folder;
}

function drawStep(run: Run, g: Ctx, node: PlanNode, clips: Layer[]): void {
  const look = nodeLook(node);
  if (look.opacity <= 0) return;
  const plainBlend = !look.blend || look.blend === 'normal';
  const fx = activeEffects(look.effects, run.frame);
  if (!clips.length) {
    // The cheap paths: a plain layer straight onto the target, a pass-through folder's layers straight onto it.
    if (node.type === 'layer' && plainBlend && !fx.length && look.opacity >= 1) {
      g.save();
      g.setTransform(run.m);
      run.hooks.paint(g, node.layer);
      g.restore();
      return;
    }
    if (node.type === 'folder' && !node.isolate) {
      drawLevel(run, g, node.steps);
      return;
    }
  }
  const pic = node.type === 'layer' ? layerPicture(run, node.layer) : folderPicture(run, node);
  if (!pic) return;
  if (!clips.length) {
    blit(g, pic.canvas, look.blend, look.opacity);
    pic.done();
    return;
  }
  // Clipped layers draw onto a copy of the base, each kept inside the base's own shape.
  const base = run.pool.get();
  const bg = ctx2(base);
  bg.drawImage(pic.canvas, 0, 0);
  for (const cl of clips) {
    if (cl.opacity <= 0) continue;
    const cp = layerPicture(run, cl);
    if (!cp) continue;
    const kept = run.pool.get();
    const kg = ctx2(kept);
    kg.drawImage(cp.canvas, 0, 0);
    kg.globalCompositeOperation = 'destination-in';
    kg.drawImage(pic.canvas, 0, 0);
    kg.globalCompositeOperation = 'source-over';
    cp.done();
    blit(bg, kept, cl.blend, cl.opacity);
    // Blend modes like multiply leave the base's outside alone, but 'add' and friends can't spill out either.
    run.pool.put(kept);
  }
  pic.done();
  blit(g, base, look.blend, look.opacity);
  run.pool.put(base);
}

interface Picture {
  canvas: Canvas2;
  /** Give it back (to the pool, or nothing when it belongs to the cache). */
  done(): void;
}

/** A layer's content at full opacity with its effects applied, as a canvas-sized picture. */
function layerPicture(run: Run, layer: Layer): Picture | null {
  const fx = activeEffects(layer.effects, run.frame);
  const key = fx.length && run.cache ? run.hooks.key?.(layer) : undefined;
  let sig = '';
  if (key) {
    const m = run.m;
    sig = `${run.pool.w}x${run.pool.h}|${m.a},${m.b},${m.c},${m.d},${m.e},${m.f}|${JSON.stringify(fx)}`;
    const hit = run.cache!.get(key, sig);
    if (hit) return { canvas: hit, done: () => {} };
  }
  let c = run.pool.get();
  const g = ctx2(c);
  g.setTransform(run.m);
  run.hooks.paint(g, layer);
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (const e of fx) c = applyEffect(c, e.kind, e.v, run.scale, run.origin, run.pool);
  if (key) {
    // The cache keeps its own copy, so the pool canvas can go back.
    const keep = makeCanvas(c.width, c.height);
    ctx2(keep).drawImage(c, 0, 0);
    run.pool.put(c);
    run.cache!.set(key, sig, keep);
    return { canvas: keep, done: () => {} };
  }
  return { canvas: c, done: () => run.pool.put(c) };
}

function folderPicture(run: Run, node: Extract<PlanNode, { type: 'folder' }>): Picture | null {
  let c = run.pool.get();
  drawLevel(run, ctx2(c), node.steps);
  for (const e of activeEffects(node.folder.effects, run.frame)) c = applyEffect(c, e.kind, e.v, run.scale, run.origin, run.pool);
  return { canvas: c, done: () => run.pool.put(c) };
}
