/**
 * Animated SVG: the whole animation in one SVG file that plays by itself in a browser, also inside an <img> tag.
 *
 * It's written with CSS @keyframes, not SMIL. Both play in Chrome, Edge, Firefox and Safari, including in an <img>,
 * but CSS can animate `transform: matrix(...)` (SMIL's animateTransform has no matrix, so a symbol copy's turn, slant
 * and size would need four stacked animations that blend in the wrong order), CSS animations can be paused and moved
 * to any frame through the standard Web Animations API (handy for players and for our own checks), and SMIL has had
 * a deprecation scare in Chrome before.
 *
 * - Every different picture a layer shows is written once and shown only on its frames (visibility keyframes that
 *   switch exactly on frame boundaries).
 * - Symbol copies moved by classic tweens are written once and moved with transform keyframes, one per frame, blending
 *   between frames. Their own animation is the same picture switching inside them.
 * - Shape tweens are a picture per frame.
 * - The camera is a transform on each layer, again a key per frame when it moves.
 * - Blend modes, opacity, effects, clipping, masks and tint come from svg-look.ts, as in the still SVG.
 */
import type { Cel, Doc, Drawing, InstanceShape, Layer } from '../core/format';
import { isInstance, isPosed, poseAt, symbolContent, symbolFrame, type Mat, type PosedInstance } from '../core/symbols';
import { cameraViewAt, layerCameraMatrix } from '../core/camera';
import { defsBlock, drawingToSvg, esc, layerId, n2, n4, paint, posedLayerSvg, shapeToSvg } from './svg';
import { withSprites } from './svg-extra';
import { composeSvg, composeSymbol, tintAttr } from './svg-look';

export interface AnimatedSvgOptions {
  range?: { start: number; end: number };
  /** The order the range plays in: for each moment of the animation, which frame of the range (counted from its first) shows. Missing = in order. */
  order?: number[];
  scale?: number;
  transparent?: boolean;
  /** Play round and round (default) or once and stop on the last frame. */
  loop?: boolean;
}

const op = (v: number) => String(Math.round(v * 1000) / 1000);
const pct = (f: number, count: number) => `${Math.round((f / count) * 1e6) / 1e4}%`;

/** Frame runs [start, end) to visibility keyframes over `count` frames. */
export function visibilityKeyframes(runs: [number, number][], count: number): string {
  const at = new Map<number, 'visible' | 'hidden'>();
  at.set(0, 'hidden');
  for (const [a, b] of runs) {
    at.set(a, 'visible');
    if (b < count && !runs.some(([c]) => c === b)) at.set(b, 'hidden');
  }
  const keys = [...at.entries()].sort((x, y) => x[0] - y[0]);
  // A run that starts on frame 0 wins over the default hidden.
  return keys.map(([f, v]) => `${pct(f, count)}{visibility:${v}}`).join('') + `100%{visibility:${keys[keys.length - 1][1]}}`;
}

function runsOf(frames: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const f of frames.slice().sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && last[1] === f) last[1] = f + 1;
    else out.push([f, f + 1]);
  }
  return out;
}

const matStr = (m: readonly number[]) => `matrix(${m.map((v) => n4(v)).join(',')})`;

class Writer {
  styles: string[] = [];
  private n = 0;
  constructor(
    readonly count: number,
    readonly duration: number,
    readonly loop: boolean,
  ) {}

  private anim(name: string, timing: string): string {
    return `animation:${name} ${n4(this.duration)}s ${timing} ${this.loop ? 'infinite' : '1 forwards'}`;
  }

  /** A class that shows an element only on these frames (0-based, within the export). */
  shownOn(frames: number[]): string {
    if (frames.length >= this.count) return '';
    const name = `v${this.n++}`;
    this.styles.push(`@keyframes ${name}{${visibilityKeyframes(runsOf(frames), this.count)}}`, `.${name}{visibility:hidden;${this.anim(name, 'step-end')}}`);
    return name;
  }

  /** A class moving and fading an element through one matrix and opacity per frame (blending between frames). */
  moving(frames: number[], mats: Mat[], opacities: number[]): { cls: string; still: string } {
    const sameM = mats.every((m) => matStr(m) === matStr(mats[0]));
    const sameO = opacities.every((o) => op(o) === op(opacities[0]));
    const still = (sameM ? ` transform="${matStr(mats[0]).replace(/,/g, ' ')}"` : '') + (sameO && opacities[0] < 1 ? ` opacity="${op(opacities[0])}"` : '');
    if (sameM && sameO) return { cls: '', still };
    const name = `m${this.n++}`;
    const keys: string[] = [];
    frames.forEach((f, i) => {
      const props = (sameM ? '' : `transform:${matStr(mats[i])};`) + (sameO ? '' : `opacity:${op(opacities[i])};`);
      keys.push(`${pct(f, this.count)}{${props}}`);
      // Hold the last value to the end of the timeline. Without a 100% key the browser blends towards no transform
      // at all during the last frame.
      if (i === frames.length - 1) keys.push(`100%{${props}}`);
      if (i === 0 && f > 0) keys.unshift(`0%{${props}}`);
    });
    this.styles.push(`@keyframes ${name}{${keys.join('')}}`, `.${name}{${this.anim(name, 'linear')}}`);
    return { cls: name, still: sameM ? still : sameO && opacities[0] < 1 ? ` opacity="${op(opacities[0])}"` : '' };
  }
}

const cls = (...names: string[]) => {
  const c = names.filter(Boolean).join(' ');
  return c ? ` class="${c}"` : '';
};

/** A posed instance's content at its posed frame (its own nested copies drawn as they are posed). */
function instanceContent(s: PosedInstance, doc: Doc): string {
  if (s.posed.look) {
    const looked = composeSymbol(s.posed.look, (pl) => posedLayerSvg(pl, doc));
    if (looked !== null) return looked;
  }
  const parts: string[] = [];
  for (const l of s.posed.layers) {
    const inner = l.drawing.kind === 'vector' ? l.drawing.shapes.map((x) => shapeToSvg(x)).filter(Boolean) : [];
    if (!inner.length && l.drawing.kind !== 'vector') {
      // Pixel art inside a symbol: written through the still-SVG instance writer.
      const whole = shapeToSvg({ ...s, opacity: 1, posed: { matrix: [1, 0, 0, 1, 0, 0], layers: [l] } } as PosedInstance);
      if (whole) parts.push(whole);
      continue;
    }
    if (inner.length) parts.push(l.opacity < 1 ? `<g opacity="${op(l.opacity)}">${inner.join('')}</g>` : inner.join(''));
  }
  return parts.join('');
}

/** One key of a layer over its frames (export frame numbers in `frames`). */
function celSvg(w: Writer, doc: Doc, layer: Layer, cel: Cel, frames: number[], docFrames: number[]): string[] {
  const drawings = docFrames.map((f) => poseAt(doc, layer, f));
  const out: string[] = [];
  // Frames that show the very same picture share one copy of it.
  const byDrawing = new Map<Drawing, number[]>();
  drawings.forEach((d, i) => {
    if (d) byDrawing.set(d, [...(byDrawing.get(d) ?? []), frames[i]]);
  });
  if (byDrawing.size === 1 || layer.kind !== 'vector' || (cel.tween?.kind ?? 'classic') === 'shape') {
    for (const [d, fs] of byDrawing) {
      const inner = drawingToSvg(doc, layer, d, docFrames[frames.indexOf(fs[0])]);
      if (inner.length) out.push(`<g${cls(w.shownOn(fs))}>${inner.join('')}</g>`);
    }
    return out;
  }
  // Moving symbol copies: plain shapes stay put, each copy is one group moved by keyframes.
  const first = drawings[0];
  if (first?.kind !== 'vector' || !drawings.every((d) => d?.kind === 'vector' && d.shapes.length === first.shapes.length)) {
    for (const [d, fs] of byDrawing) out.push(`<g${cls(w.shownOn(fs))}>${drawingToSvg(doc, layer, d, docFrames[frames.indexOf(fs[0])]).join('')}</g>`);
    return out;
  }
  const parts: string[] = [];
  first.shapes.forEach((s0, k) => {
    if (!isInstance(s0)) {
      const all = drawings.map((d) => (d as unknown as { shapes: unknown[] }).shapes[k]);
      if (all.every((x) => x === s0)) parts.push(shapeToSvg(s0));
      else drawings.forEach((d, i) => parts.push(`<g${cls(w.shownOn([frames[i]]))}>${shapeToSvg((d as unknown as { shapes: InstanceShape[] }).shapes[k])}</g>`));
      return;
    }
    const insts = drawings.map((d) => (d as unknown as { shapes: PosedInstance[] }).shapes[k]).filter(isPosed);
    if (insts.length !== drawings.length) return;
    const move = w.moving(frames, insts.map((s) => s.posed.matrix), insts.map((s) => s.opacity));
    // Its own animation: each different inner picture once, shown on its frames.
    const c = symbolContent(doc, s0.symbolId);
    const byInner = new Map<number, number[]>();
    insts.forEach((s, i) => {
      const f = c ? symbolFrame(s, docFrames[i] - cel.start, c.length) : 0;
      byInner.set(f, [...(byInner.get(f) ?? []), i]);
    });
    const inner: string[] = [];
    for (const idx of byInner.values()) {
      const body = instanceContent(insts[idx[0]], doc);
      if (!body) continue;
      inner.push(byInner.size === 1 ? body : `<g${cls(w.shownOn(idx.map((i) => frames[i])))}>${body}</g>`);
    }
    if (inner.length) parts.push(`<g${cls(move.cls)}${move.still}${tintAttr(s0.tint)}>${inner.join('')}</g>`);
  });
  out.push(`<g${cls(w.shownOn(frames))}>${parts.join('')}</g>`);
  return out;
}

/** The whole animation as one animated SVG, and plain words about anything SVG couldn't keep. */
export function animatedSvgExport(doc: Doc, opts: AnimatedSvgOptions = {}): { svg: string; notes: string[] } {
  const from = Math.max(0, opts.range?.start ?? 0);
  const to = Math.min(doc.length - 1, opts.range?.end ?? doc.length - 1);
  const order = opts.order?.length && opts.order.every((p) => p >= 0 && p <= to - from) ? opts.order : undefined;
  const count = order ? order.length : to - from + 1;
  const loop = opts.loop !== false;
  const w = new Writer(count, count / doc.fps, loop);
  const scale = opts.scale ?? 1;
  const W = Math.max(1, Math.round(doc.width * scale));
  const H = Math.max(1, Math.round(doc.height * scale));
  const used = new Set<string>();
  // The document frame each moment shows (a clip played backward or several times shows a frame more than once).
  const allFrames = Array.from({ length: count }, (_, i) => from + (order?.[i] ?? i));
  const views = allFrames.map((f) => cameraViewAt(doc, f));
  const notes = new Set<string>();
  const defs: string[] = [];
  const body = (layer: Layer): string => {
    const parts: string[] = [];
    for (const cel of layer.cels) {
      const a = Math.max(from, cel.start);
      const b = Math.min(to, cel.start + cel.length - 1);
      if (a > b) continue;
      // The moments this cel shows on, and the document frame at each.
      const moments: number[] = [];
      if (order) allFrames.forEach((f, i) => f >= a && f <= b && moments.push(i));
      else for (let f = a; f <= b; f++) moments.push(f - from);
      if (!moments.length) continue;
      parts.push(...celSvg(w, doc, layer, cel, moments, moments.map((i) => allFrames[i])));
    }
    if (!parts.length) return '';
    const id = layerId(layer.name, used);
    let g = `<g id="${esc(id)}"${layer.kind !== 'vector' ? ' shape-rendering="crispEdges"' : ''}>\n${parts.join('\n')}\n</g>`;
    const mats = views.map((v) => layerCameraMatrix(doc, layer, v) ?? ([1, 0, 0, 1, 0, 0] as Mat));
    if (mats.some((m) => matStr(m) !== 'matrix(1,0,0,1,0,0)')) {
      const move = w.moving(allFrames.map((_, i) => i), mats, mats.map(() => 1));
      g = `<g${cls(move.cls)}${move.still}>\n${g}\n</g>`;
    }
    return g;
  };
  const { value: content, defs: sprites } = withSprites(() => composeSvg({ doc, frames: allFrames, duration: count / doc.fps, loop, defs, notes, body }));
  const out: string[] = [];
  if (doc.background && !opts.transparent) out.push(`<rect width="${n2(doc.width)}" height="${n2(doc.height)}"${paint('fill', doc.background, 1)}/>`);
  if (content) out.push(content);
  const style = w.styles.length ? `<style>\n${w.styles.join('\n')}\n</style>\n` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${n2(doc.width)} ${n2(doc.height)}">\n${style}${defsBlock([...defs, ...sprites], content)}${out.join('\n')}\n</svg>\n`;
  return { svg, notes: [...notes] };
}

/** The whole animation as one animated SVG. */
export function animatedSvg(doc: Doc, opts: AnimatedSvgOptions = {}): string {
  return animatedSvgExport(doc, opts).svg;
}
