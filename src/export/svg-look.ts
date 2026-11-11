/**
 * How layers combine in SVG: blend modes (mix-blend-mode), opacity, effects as SVG filters, clipping and mask layers
 * as <mask>, and the colour wash (tint) on symbol copies as a small filter. Shared by the still and the moving SVG,
 * following the same plan the canvas compositor follows (effects/plan.ts), so they agree on what masks what.
 *
 * Effects: Soften is a Gaussian blur, Shadow a blurred, moved and coloured copy underneath, Colour adjust colour
 * matrices, Glow a blurred coloured copy underneath (stacked by strength), Outline the drawing moved round a ring of
 * offsets the same way the canvas does it. Pixelate has no SVG equivalent and is left out (the export says so).
 * Effect settings that change over time are SMIL <animate>s switching once per frame.
 */
import type { Doc, Layer, LayerEffect } from '../core/format';
import { buildPlan, type PlanNode, type PlanStep } from '../effects/plan';
import { effectInfo, isNoop, valuesAt } from '../effects/model';
import { outlineOffsets } from '../effects/apply';
import { splitColor, esc } from './svg';

const n4 = (v: number) => {
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** What the composer needs from the writer it's used by. */
export interface SvgLookHost {
  doc: Doc;
  /** Document frames shown (one for a still SVG). */
  frames: number[];
  /** Seconds the whole thing lasts, and whether it loops (for animated settings). */
  duration: number;
  loop: boolean;
  /** A layer's content: its drawings (and camera move), without its own opacity, blend or effects. Empty for none. */
  body(layer: Layer): string;
  defs: string[];
  notes: Set<string>;
}

let uidN = 0;
const uid = (p: string) => `${p}${(uidN++).toString(36)}`;

/** An SVG attribute that may change per frame: plain when it doesn't, else SMIL switching on frame boundaries. */
function attrs(host: SvgLookHost, values: Record<string, (string | number)[]>): { attr: string; anim: string } {
  let attr = '';
  let anim = '';
  const count = host.frames.length;
  for (const [name, vs] of Object.entries(values)) {
    const s = vs.map((v) => (typeof v === 'number' ? n4(v) : v));
    attr += ` ${name}="${esc(s[0])}"`;
    if (s.every((v) => v === s[0])) continue;
    const keyTimes = s.map((_, i) => n4(i / count)).join(';');
    anim += `<animate attributeName="${name}" values="${esc(s.join(';'))}" keyTimes="${keyTimes}" calcMode="discrete" dur="${n4(host.duration)}s" ${host.loop ? 'repeatCount="indefinite"' : 'fill="freeze"'}/>`;
  }
  return { attr, anim };
}

function prim(host: SvgLookHost, tag: string, fixed: string, values: Record<string, (string | number)[]> = {}): string {
  const { attr, anim } = attrs(host, values);
  return anim ? `<${tag}${fixed}${attr}>${anim}</${tag}>` : `<${tag}${fixed}${attr}/>`;
}

/** The effects as one SVG filter (its id), or '' when none of them do anything. */
export function effectsFilter(host: SvgLookHost, effects: LayerEffect[] | undefined, owner: string): string {
  const list = (effects ?? []).filter((e) => e.on !== false && !host.frames.every((f) => isNoop(e.kind, valuesAt(e, f))));
  if (!list.length) return '';
  const { doc } = host;
  const parts: string[] = [];
  let prev = 'SourceGraphic';
  let k = 0;
  const res = () => `r${k++}`;
  for (const e of list) {
    const vs = host.frames.map((f) => valuesAt(e, f));
    const num = (key: string) => vs.map((v) => Number(v[key]));
    const col = splitColor(String(vs[0].color ?? '#000000'));
    if (e.kind === 'blur') {
      const out = res();
      parts.push(prim(host, 'feGaussianBlur', ` in="${prev}" result="${out}"`, { stdDeviation: num('radius') }));
      prev = out;
    } else if (e.kind === 'shadow') {
      const [b, o, f, c, out] = [res(), res(), res(), res(), res()];
      // The canvas's drop-shadow(x y b): a blur of b / 2.
      parts.push(prim(host, 'feGaussianBlur', ` in="${prev}" result="${b}"`, { stdDeviation: num('softness').map((v) => v / 2) }));
      parts.push(prim(host, 'feOffset', ` in="${b}" result="${o}"`, { dx: num('x'), dy: num('y') }));
      parts.push(prim(host, 'feFlood', ` flood-color="${col.color}" result="${f}"`, { 'flood-opacity': num('opacity').map((v) => Math.min(1, v * col.alpha)) }));
      parts.push(`<feComposite in="${f}" in2="${o}" operator="in" result="${c}"/>`);
      parts.push(`<feMerge result="${out}"><feMergeNode in="${c}"/><feMergeNode in="${prev}"/></feMerge>`);
      prev = out;
    } else if (e.kind === 'adjust') {
      const [h, s, bo, bc] = [res(), res(), res(), res()];
      parts.push(prim(host, 'feColorMatrix', ` in="${prev}" type="hueRotate" result="${h}"`, { values: num('hue') }));
      parts.push(prim(host, 'feColorMatrix', ` in="${h}" type="saturate" result="${s}"`, { values: num('saturation').map((v) => v / 100) }));
      // Brightness then contrast, as the canvas filter does them (each clamps).
      const br = num('brightness').map((v) => v / 100);
      const ct = num('contrast').map((v) => v / 100);
      const fb = (ch: string) => prim(host, `feFunc${ch}`, ' type="linear"', { slope: br });
      const fc = (ch: string) => prim(host, `feFunc${ch}`, ' type="linear"', { slope: ct, intercept: ct.map((c) => 0.5 - 0.5 * c) });
      parts.push(`<feComponentTransfer in="${s}" result="${bo}">${fb('R')}${fb('G')}${fb('B')}</feComponentTransfer>`);
      parts.push(`<feComponentTransfer in="${bo}" result="${bc}">${fc('R')}${fc('G')}${fc('B')}</feComponentTransfer>`);
      prev = bc;
    } else if (e.kind === 'glow') {
      const [b, f, g, out] = [res(), res(), res(), res()];
      parts.push(prim(host, 'feGaussianBlur', ` in="${prev}" result="${b}"`, { stdDeviation: num('size').map((v) => v / 2) }));
      parts.push(`<feFlood flood-color="${col.color}" flood-opacity="${n4(col.alpha)}" result="${f}"/>`);
      parts.push(`<feComposite in="${f}" in2="${b}" operator="in" result="${g}"/>`);
      // Strength over 1 stacks the glow, like the canvas (the last copy fainter for the part past a whole number).
      const strength = num('strength')[0];
      const nodes: string[] = [];
      for (let left = strength; left > 0; left -= 1) {
        if (left >= 1) nodes.push(`<feMergeNode in="${g}"/>`);
        else {
          const part = res();
          parts.push(`<feColorMatrix in="${g}" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${n4(left)} 0" result="${part}"/>`);
          nodes.push(`<feMergeNode in="${part}"/>`);
        }
      }
      parts.push(`<feMerge result="${out}">${nodes.join('')}<feMergeNode in="${prev}"/></feMerge>`);
      prev = out;
    } else if (e.kind === 'outline') {
      const offs = outlineOffsets(num('width')[0]);
      const names = offs.map(() => res());
      offs.forEach(([dx, dy], i) => parts.push(`<feOffset in="${prev}" dx="${n4(dx)}" dy="${n4(dy)}" result="${names[i]}"/>`));
      const [ring, f, c, out] = [res(), res(), res(), res()];
      parts.push(`<feMerge result="${ring}">${names.map((nm) => `<feMergeNode in="${nm}"/>`).join('')}</feMerge>`);
      parts.push(`<feFlood flood-color="${col.color}" flood-opacity="${n4(col.alpha)}" result="${f}"/>`);
      parts.push(`<feComposite in="${f}" in2="${ring}" operator="in" result="${c}"/>`);
      parts.push(`<feMerge result="${out}"><feMergeNode in="${c}"/><feMergeNode in="${prev}"/></feMerge>`);
      prev = out;
    } else {
      host.notes.add(`${effectInfo(e.kind).label} on "${owner}" was left out: SVG has nothing like it.`);
    }
  }
  if (!parts.length) return '';
  const id = uid('fx');
  // A region well past the stage, so blurs and shadows near the edge aren't cut off.
  host.defs.push(`<filter id="${id}" filterUnits="userSpaceOnUse" x="${-doc.width}" y="${-doc.height}" width="${doc.width * 3}" height="${doc.height * 3}" color-interpolation-filters="sRGB">${parts.join('')}</filter>`);
  return id;
}

/** Filters that turn a picture into a white (or black) silhouette, for masks. */
function silhouette(host: SvgLookHost, white: boolean): string {
  const id = white ? 'fl-white' : 'fl-black';
  if (!host.defs.some((d) => d.includes(`id="${id}"`))) {
    const v = white ? 1 : 0;
    host.defs.push(`<filter id="${id}" filterUnits="userSpaceOnUse" x="${-host.doc.width}" y="${-host.doc.height}" width="${host.doc.width * 3}" height="${host.doc.height * 3}"><feColorMatrix type="matrix" values="0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 1 0"/></filter>`);
  }
  return id;
}

/** A <mask> showing what `content` covers (or hiding it), in stage space. */
function maskOf(host: SvgLookHost, content: string, hide: boolean): string {
  const { doc } = host;
  const id = uid('mk');
  const box = `x="${-doc.width}" y="${-doc.height}" width="${doc.width * 3}" height="${doc.height * 3}"`;
  host.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" ${box}>${hide ? `<rect ${box} fill="#fff"/>` : ''}<g filter="url(#${silhouette(host, !hide)})">${content}</g></mask>`);
  return id;
}

const blendCss = (b: string | undefined) => (b && b !== 'normal' ? `mix-blend-mode:${b === 'add' ? 'plus-lighter' : b}` : '');

/** A group with a look: opacity, blend mode and a filter (attributes only where they do something). */
function lookGroup(inner: string, look: { opacity?: number; blend?: string; filter?: string; mask?: string; id?: string }): string {
  let a = '';
  if (look.id) a += ` id="${esc(look.id)}"`;
  if (look.filter) a += ` filter="url(#${look.filter})"`;
  if (look.opacity !== undefined && look.opacity < 1) a += ` opacity="${n4(look.opacity)}"`;
  const css = blendCss(look.blend);
  if (css) a += ` style="${css}"`;
  if (look.mask) a += ` mask="url(#${look.mask})"`;
  return a ? `<g${a}>${inner}</g>` : inner;
}

function nodeName(node: PlanNode): string {
  return node.type === 'layer' ? node.layer.name : node.folder.name;
}

/** A layer or folder with its effects, before its own opacity and blend mode. */
function picture(host: SvgLookHost, node: PlanNode): string {
  const look = node.type === 'layer' ? node.layer : node.folder;
  const inner = node.type === 'layer' ? host.body(node.layer) : level(host, node.steps);
  if (!inner) return '';
  return lookGroup(inner, { filter: effectsFilter(host, look.effects, nodeName(node)) });
}

function step(host: SvgLookHost, node: PlanNode, clips: Layer[]): string {
  const look = node.type === 'layer' ? node.layer : node.folder;
  if (look.opacity <= 0) return '';
  if (node.type === 'folder' && !node.isolate && !clips.length) return level(host, node.steps);
  const pic = picture(host, node);
  if (!pic) return '';
  if (!clips.length) return lookGroup(pic, { opacity: look.opacity, blend: look.blend });
  // Clipped layers are kept inside the base's picture: a mask made from a reference to it.
  const baseId = uid('base');
  const parts = [`<g id="${baseId}">${pic}</g>`];
  for (const cl of clips) {
    if (cl.opacity <= 0) continue;
    const c = step(host, { type: 'layer', layer: cl }, []);
    if (!c) continue;
    parts.push(lookGroup(c, { mask: maskOf(host, `<use href="#${baseId}"/>`, false) }));
  }
  return lookGroup(parts.join(''), { opacity: look.opacity, blend: look.blend });
}

function level(host: SvgLookHost, steps: PlanStep[]): string {
  let acc = '';
  for (const s of steps) {
    if (s.type === 'mask') {
      if (!acc) continue;
      const m = picture(host, { type: 'layer', layer: s.layer });
      const hide = s.layer.mask === 'hide';
      if (!m) {
        if (!hide) acc = '';
        continue;
      }
      acc = lookGroup(acc, { mask: maskOf(host, m, hide) });
      continue;
    }
    acc += step(host, s.node, s.clips);
  }
  return acc;
}

/** Every visible layer of the document, composited the way the canvas does it. */
export function composeSvg(host: SvgLookHost): string {
  const include = (l: Layer) => l.visible && !l.reference && l.kind !== 'camera';
  const steps = buildPlan(host.doc, include);
  const out = level(host, steps);
  // Masks at the stage level cut the layers, never the stage colour, so the stage is its own group.
  return steps.some((s) => s.type === 'mask') ? `<g style="isolation:isolate">${out}</g>` : out;
}

/** The tint filters a finished SVG refers to (`url(#tint-rrggbb-aaaa)`), as <filter> definitions. */
export function tintDefs(svg: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of svg.matchAll(/url\(#tint-([0-9a-f]{6})-(\d{1,4})\)/g)) {
    const id = `tint-${m[1]}-${m[2]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    // The canvas paints the colour over the copy with source-atop: the colour mixes in, the see-through stays.
    out.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feFlood flood-color="#${m[1]}" flood-opacity="${n4(Number(m[2]) / 1000)}"/><feComposite in2="SourceGraphic" operator="atop"/></filter>`);
  }
  return out;
}

/** The filter attribute for a symbol copy's colour wash ('' when it has none). */
export function tintAttr(tint: { color: string; amount: number } | undefined): string {
  if (!tint || tint.amount <= 0) return '';
  const c = splitColor(tint.color);
  const a = Math.round(Math.min(1, tint.amount * c.alpha) * 1000);
  return ` filter="url(#tint-${c.color.slice(1).toLowerCase()}-${a})"`;
}
