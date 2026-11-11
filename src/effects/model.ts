/**
 * Blend modes, the effect catalogue and the maths of animated effect values. Pure: no DOM, no store.
 *
 * Every effect setting is in document pixels (or percent, degrees, 0 to 1), so a 4 px blur looks the same at any
 * zoom and in every export size. The compositor scales them to the canvas it draws on.
 */
import type { BlendMode, Doc, EffectKey, EffectKind, Layer, LayerEffect, LayerFolder } from '../core/format';

// ---------------------------------------------------------------- blend modes

export interface BlendInfo {
  mode: BlendMode;
  /** Plain words first. */
  label: string;
  /** The name other apps use. */
  term: string;
  /** One sentence: what it does and what it's good for. */
  description: string;
}

export const BLEND_MODES: BlendInfo[] = [
  { mode: 'normal', label: 'Normal', term: 'Normal', description: 'Covers what is under it, like paint.' },
  { mode: 'multiply', label: 'Darken like ink', term: 'Multiply', description: 'Mixes like layers of ink. White vanishes and every other colour darkens what is under it. Good for shadows.' },
  { mode: 'screen', label: 'Lighten like light', term: 'Screen', description: 'Mixes like beams of light. Black vanishes and every other colour lightens what is under it. Good for highlights and mist.' },
  { mode: 'add', label: 'Glow brighter', term: 'Add', description: 'Adds its colours to what is under it, so overlaps burn towards white. Good for fire, sparks and magic.' },
  { mode: 'overlay', label: 'Boost contrast', term: 'Overlay', description: 'Darks get darker and lights get lighter where it sits. Good for texture and mood.' },
  { mode: 'soft-light', label: 'Gentle light', term: 'Soft light', description: 'A softer Boost contrast, like a faint lamp shining on the picture.' },
  { mode: 'hard-light', label: 'Strong light', term: 'Hard light', description: 'A harsher Boost contrast, like a spotlight.' },
  { mode: 'darken', label: 'Keep the darker', term: 'Darken', description: 'Shows whichever is darker, this layer or what is under it.' },
  { mode: 'lighten', label: 'Keep the lighter', term: 'Lighten', description: 'Shows whichever is lighter, this layer or what is under it.' },
  { mode: 'color-dodge', label: 'Burn bright', term: 'Colour dodge', description: 'Brightens what is under it a lot. Good for shine and glints.' },
  { mode: 'color-burn', label: 'Burn dark', term: 'Colour burn', description: 'Darkens what is under it a lot, with stronger colour.' },
  { mode: 'difference', label: 'Invert where it overlaps', term: 'Difference', description: 'Flips colours where it overlaps. White turns things into their negative.' },
  { mode: 'exclusion', label: 'Softer invert', term: 'Exclusion', description: 'Like Invert where it overlaps, but greyer and gentler.' },
  { mode: 'hue', label: 'Hue only', term: 'Hue', description: 'Takes this layer\'s hue (red, blue...) and keeps the shading and strength of what is under it.' },
  { mode: 'saturation', label: 'Colourfulness only', term: 'Saturation', description: 'Takes how colourful this layer is. Grey makes what is under it grey.' },
  { mode: 'color', label: 'Colour only', term: 'Colour', description: 'Paints its colour onto the shading under it. Good for tinting a grey drawing.' },
  { mode: 'luminosity', label: 'Lightness only', term: 'Luminosity', description: 'Takes this layer\'s light and dark and keeps the colours of what is under it.' },
];

export function blendInfo(mode: BlendMode | undefined): BlendInfo {
  return BLEND_MODES.find((b) => b.mode === (mode ?? 'normal')) ?? BLEND_MODES[0];
}

/** The canvas globalCompositeOperation for a blend mode. */
export function compositeOp(mode: BlendMode | undefined): GlobalCompositeOperation {
  if (!mode || mode === 'normal') return 'source-over';
  if (mode === 'add') return 'lighter';
  return mode;
}

export function isBlendMode(v: unknown): v is BlendMode {
  return typeof v === 'string' && BLEND_MODES.some((b) => b.mode === v);
}

// ---------------------------------------------------------------- effect catalogue

export interface EffectParam {
  key: string;
  label: string;
  type: 'number' | 'color';
  default: number | string;
  min?: number;
  max?: number;
  step?: number;
  /** Shown after the number ("px", "%", "°"). */
  unit?: string;
}

export interface EffectInfo {
  kind: EffectKind;
  label: string;
  term: string;
  description: string;
  icon: string;
  params: EffectParam[];
}

export const EFFECTS: EffectInfo[] = [
  {
    kind: 'blur',
    label: 'Soften',
    term: 'Blur',
    description: 'Makes the layer soft and out of focus. Good for backgrounds, speed and depth.',
    icon: 'fx-blur',
    params: [{ key: 'radius', label: 'How soft', type: 'number', default: 4, min: 0, max: 60, step: 0.5, unit: 'px' }],
  },
  {
    kind: 'glow',
    label: 'Glow',
    term: 'Outer glow',
    description: 'A soft light around the drawing. Good for magic, lamps and neon.',
    icon: 'fx-glow',
    params: [
      { key: 'color', label: 'Colour', type: 'color', default: '#ffd76a' },
      { key: 'size', label: 'Size', type: 'number', default: 12, min: 0, max: 80, step: 0.5, unit: 'px' },
      { key: 'strength', label: 'Strength', type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    ],
  },
  {
    kind: 'shadow',
    label: 'Shadow',
    term: 'Drop shadow',
    description: 'A shadow behind the drawing, as if it floats above the page.',
    icon: 'fx-shadow',
    params: [
      { key: 'color', label: 'Colour', type: 'color', default: '#000000' },
      { key: 'opacity', label: 'Strength', type: 'number', default: 0.45, min: 0, max: 1, step: 0.01 },
      { key: 'x', label: 'Across', type: 'number', default: 6, min: -100, max: 100, step: 0.5, unit: 'px' },
      { key: 'y', label: 'Down', type: 'number', default: 6, min: -100, max: 100, step: 0.5, unit: 'px' },
      { key: 'softness', label: 'Softness', type: 'number', default: 6, min: 0, max: 60, step: 0.5, unit: 'px' },
    ],
  },
  {
    kind: 'adjust',
    label: 'Colour adjust',
    term: 'Hue / saturation / brightness / contrast',
    description: 'Shift the colours, make them stronger or greyer, lighter or darker.',
    icon: 'fx-adjust',
    params: [
      { key: 'hue', label: 'Shift colour', type: 'number', default: 0, min: -180, max: 180, step: 1, unit: '°' },
      { key: 'saturation', label: 'Colourfulness', type: 'number', default: 100, min: 0, max: 300, step: 1, unit: '%' },
      { key: 'brightness', label: 'Brightness', type: 'number', default: 100, min: 0, max: 300, step: 1, unit: '%' },
      { key: 'contrast', label: 'Contrast', type: 'number', default: 100, min: 0, max: 300, step: 1, unit: '%' },
    ],
  },
  {
    kind: 'outline',
    label: 'Outline',
    term: 'Stroke',
    description: 'A solid line all the way around the drawing. Good for stickers, game sprites and readability.',
    icon: 'fx-outline',
    params: [
      { key: 'color', label: 'Colour', type: 'color', default: '#1d1b26' },
      { key: 'width', label: 'Thickness', type: 'number', default: 3, min: 0, max: 40, step: 0.5, unit: 'px' },
    ],
  },
  {
    kind: 'pixelate',
    label: 'Pixelate',
    term: 'Mosaic',
    description: 'Turns the layer into big squares, like a censored photo or a retro game.',
    icon: 'fx-pixelate',
    params: [{ key: 'size', label: 'Square size', type: 'number', default: 8, min: 1, max: 64, step: 1, unit: 'px' }],
  },
];

export function effectInfo(kind: EffectKind): EffectInfo {
  return EFFECTS.find((e) => e.kind === kind)!;
}

export function isEffectKind(v: unknown): v is EffectKind {
  return typeof v === 'string' && EFFECTS.some((e) => e.kind === v);
}

/** The settings a new effect starts with. */
export function defaultValues(kind: EffectKind): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const p of effectInfo(kind).params) out[p.key] = p.default;
  return out;
}

export function clampParam(p: EffectParam, v: number): number {
  if (!Number.isFinite(v)) return p.default as number;
  return Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
}

// ---------------------------------------------------------------- animated values

/** An effect's settings at a frame: keys blend evenly between each other and hold before the first and after the last. */
export function valuesAt(e: LayerEffect, frame: number): Record<string, number | string> {
  const out: Record<string, number | string> = { ...defaultValues(e.kind), ...e.values };
  const keys = e.keys;
  if (!keys?.length) return out;
  const names = new Set<string>();
  for (const k of keys) for (const n of Object.keys(k.values)) names.add(n);
  for (const n of names) {
    const v = valueAt(keys, n, frame);
    if (v !== undefined) out[n] = v;
  }
  return out;
}

/** One animated number at a frame, from the keys that set it. */
export function valueAt(keys: EffectKey[], name: string, frame: number): number | undefined {
  let prev: EffectKey | undefined;
  for (const k of keys) {
    if (!(name in k.values)) continue;
    if (k.frame === frame) return k.values[name];
    if (k.frame > frame) {
      if (!prev) return k.values[name];
      const t = (frame - prev.frame) / (k.frame - prev.frame);
      return prev.values[name] + (k.values[name] - prev.values[name]) * t;
    }
    prev = k;
  }
  return prev?.values[name];
}

export function isAnimated(e: LayerEffect): boolean {
  return !!e.keys?.length;
}

/** The effects that change what's drawn at this frame, with their settings resolved. */
export function activeEffects(list: LayerEffect[] | undefined, frame: number): { kind: EffectKind; v: Record<string, number | string> }[] {
  if (!list?.length) return [];
  const out: { kind: EffectKind; v: Record<string, number | string> }[] = [];
  for (const e of list) {
    if (e.on === false || !isEffectKind(e.kind)) continue;
    const v = valuesAt(e, frame);
    if (isNoop(e.kind, v)) continue;
    out.push({ kind: e.kind, v });
  }
  return out;
}

/** True when the settings leave the picture as it was (a 0 px blur), so the work can be skipped. */
export function isNoop(kind: EffectKind, v: Record<string, number | string>): boolean {
  const n = (k: string) => Number(v[k]);
  switch (kind) {
    case 'blur':
      return !(n('radius') > 0);
    case 'glow':
      return !(n('strength') > 0);
    case 'shadow':
      return !(n('opacity') > 0);
    case 'adjust':
      return n('hue') === 0 && n('saturation') === 100 && n('brightness') === 100 && n('contrast') === 100;
    case 'outline':
      return !(n('width') > 0);
    case 'pixelate':
      return !(n('size') > 1);
  }
}

/** Sets a key's values, adding the key in frame order (pure: returns a new list). */
export function withKey(keys: EffectKey[] | undefined, frame: number, values: Record<string, number>): EffectKey[] {
  const list = (keys ?? []).map((k) => ({ frame: k.frame, values: { ...k.values } }));
  const at = list.find((k) => k.frame === frame);
  if (at) Object.assign(at.values, values);
  else list.push({ frame, values: { ...values } });
  return list.sort((a, b) => a.frame - b.frame);
}

// ---------------------------------------------------------------- what needs the compositor

/** True when a layer looks different from "draw it at its opacity". */
export function layerHasLook(l: Layer): boolean {
  return (!!l.blend && l.blend !== 'normal') || !!l.effects?.some((e) => e.on !== false) || !!l.clipToBelow || !!l.mask || !!l.folder;
}

/** True when a frame of this document needs the compositor (blend modes, effects, clipping, masks or folders). */
export function needsCompositor(doc: Doc): boolean {
  return doc.layers.some(layerHasLook);
}

export function folderOf(doc: Doc, l: Layer): LayerFolder | undefined {
  return l.folder ? doc.folders?.[l.folder] : undefined;
}

/** Plain-words summary of a layer's look, for tooltips and the timeline ("Darken like ink, 2 effects"). */
export function lookSummary(l: Layer): string {
  const parts: string[] = [];
  if (l.mask) parts.push(l.mask === 'hide' ? 'Mask that hides' : 'Mask');
  if (l.clipToBelow) parts.push('Clipped to the layer below');
  if (l.blend && l.blend !== 'normal') parts.push(blendInfo(l.blend).label);
  const n = l.effects?.filter((e) => e.on !== false).length ?? 0;
  if (n) parts.push(n === 1 ? `1 effect (${effectInfo(l.effects!.find((e) => e.on !== false)!.kind).label})` : `${n} effects`);
  return parts.join(', ');
}
