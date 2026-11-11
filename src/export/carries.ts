/**
 * What each export format keeps, in one table, so the Export window can say it before anyone exports, and can list
 * what in this document will be turned into pictures or left out. Pure: no DOM.
 *
 * Keep it in step with the writers (lottie.ts, svg-look.ts, svg.ts, psd/pdf in layered.ts). Pictures-of-frames formats
 * (video, GIF, PNG, sheets) draw with the canvas renderer, so they keep everything.
 */
import type { Doc, EffectKind } from '../core/format';
import type { FormatId } from './types';
import { effectInfo } from '../effects/model';

/** Things a document can have that not every format can carry. */
export type Feature = 'text' | 'particles' | 'tint' | 'blend' | 'effects' | 'clip' | 'mask' | 'folders' | 'bones';

/** kept: as itself. shapes: kept, but as outlines or shapes rather than editable text. picture: baked into pictures. out: left out. */
export type Carry = 'kept' | 'shapes' | 'picture' | 'out';

export const FEATURE_WORDS: Record<Feature, string> = {
  text: 'text',
  particles: 'particles',
  tint: 'colour wash on symbols',
  blend: 'blend modes',
  effects: 'effects',
  clip: 'clipping',
  mask: 'masks',
  folders: 'layer folders',
  bones: 'bent (boned) drawings',
};

interface FormatCarry {
  /** One sentence for everything at once (used alone for pictures-of-frames formats). */
  summary: string;
  /** Per feature, when the summary isn't the whole story. Missing = kept. */
  rows?: Partial<Record<Feature, Carry>>;
  /** Effects this format has its own version of (the rest go by `rows.effects`). */
  nativeEffects?: EffectKind[];
  /** Help topic with the full story. */
  help?: string;
}

const PICTURES = 'Everything looks exactly as it does on the canvas: each frame is a finished picture.';

export const CARRY: Record<FormatId, FormatCarry> = {
  mp4: { summary: PICTURES, help: 'export-video-gif-apng' },
  webm: { summary: PICTURES, help: 'export-video-gif-apng' },
  gif: { summary: PICTURES + ' GIF has only 256 colours and hard see-through edges.', help: 'export-video-gif-apng' },
  apng: { summary: PICTURES, help: 'export-video-gif-apng' },
  png: { summary: PICTURES },
  pngseq: { summary: PICTURES },
  sheet: { summary: PICTURES, help: 'export-sprite-sheets' },
  prores: { summary: PICTURES },
  interactives: { summary: PICTURES + ' Clips, markers and the clip flow come along for Interactives to play.', help: 'export-interactives' },
  lottie: {
    help: 'export-lottie',
    summary: 'Shapes, symbols, tweens, the camera, blend modes, masks, clipping and colour wash stay vector. Text becomes letter shapes (no fonts needed). Particles become little shapes, one per particle.',
    rows: { text: 'shapes', particles: 'shapes', effects: 'picture', bones: 'kept' },
    nativeEffects: ['blur', 'shadow'],
  },
  svganim: {
    help: 'export-svg-animated',
    summary: 'Shapes, symbols, tweens, the camera, text, particles, blend modes, masks, clipping, colour wash and most effects stay vector.',
    rows: { effects: 'kept', bones: 'picture' },
    nativeEffects: ['blur', 'shadow', 'adjust', 'glow', 'outline'],
  },
  svg: {
    help: 'export-svg',
    summary: 'This frame as vector shapes, with text, blend modes, masks, clipping, colour wash and most effects kept.',
    rows: { effects: 'kept', bones: 'picture' },
    nativeEffects: ['blur', 'shadow', 'adjust', 'glow', 'outline'],
  },
  psd: {
    summary: 'This frame with every layer kept: names, blend modes, opacity, folders and clipping. Effects are baked into the layer pixels.',
    rows: { text: 'picture', particles: 'picture', effects: 'picture', mask: 'kept', folders: 'kept' },
  },
  pdf: {
    summary: 'Sharp vector shapes with your layers as PDF layers. Text becomes letter outlines. Layers with effects, clipping, masks or bending become pictures.',
    rows: { text: 'shapes', effects: 'picture', clip: 'picture', mask: 'picture', bones: 'picture', folders: 'kept' },
  },
  ai: {
    summary: 'The same as PDF, opened by Illustrator with every shape editable. Layers with effects, clipping, masks or bending become pictures.',
    rows: { text: 'shapes', effects: 'picture', clip: 'picture', mask: 'picture', bones: 'picture', folders: 'kept' },
  },
};

/** What a document uses that some formats can't carry exactly. Effects are listed by kind. */
export interface DocFeatures {
  features: Set<Feature>;
  effectKinds: Set<EffectKind>;
}

export function docFeatures(doc: Doc): DocFeatures {
  const features = new Set<Feature>();
  const effectKinds = new Set<EffectKind>();
  const layers = [...doc.layers, ...Object.values(doc.symbols ?? {}).flatMap((s) => s.layers)];
  for (const l of layers) {
    if (l.blend && l.blend !== 'normal') features.add('blend');
    for (const e of l.effects ?? []) if (e.on !== false) effectKinds.add(e.kind);
    if (l.clipToBelow) features.add('clip');
    if (l.mask) features.add('mask');
    if (l.folder) features.add('folders');
    if ((l as { bind?: unknown }).bind) features.add('bones');
  }
  for (const f of Object.values(doc.folders ?? {})) for (const e of f.effects ?? []) if (e.on !== false) effectKinds.add(e.kind);
  if (effectKinds.size) features.add('effects');
  for (const d of Object.values(doc.drawings)) {
    if (d.kind !== 'vector') continue;
    for (const s of d.shapes) {
      if (s.type === 'text') features.add('text');
      else if (s.type === 'particles') features.add('particles');
      else if (s.type === 'instance' && s.tint && s.tint.amount > 0) features.add('tint');
    }
  }
  return { features, effectKinds };
}

/** Plain-words lines about what in this document won't come across as it is, for this format. Empty = all of it. */
export function carryWarnings(doc: Doc, format: FormatId, found: DocFeatures = docFeatures(doc)): string[] {
  const c = CARRY[format];
  if (!c.rows) return [];
  const out: string[] = [];
  const pictures: string[] = [];
  const left: string[] = [];
  for (const f of found.features) {
    const how = f === 'effects' ? undefined : c.rows[f];
    if (how === 'picture') pictures.push(FEATURE_WORDS[f]);
    else if (how === 'out') left.push(FEATURE_WORDS[f]);
  }
  if (found.features.has('effects')) {
    const native = new Set(c.nativeEffects ?? []);
    const other = [...found.effectKinds].filter((k) => !native.has(k)).map((k) => effectInfo(k).label.toLowerCase());
    const how = c.rows.effects ?? 'kept';
    if (how === 'picture' && other.length) pictures.push(`layers with ${list(other)}`);
    else if (how === 'kept' && other.length) left.push(list(other));
  }
  if (pictures.length) out.push(`Turned into pictures here: ${list(pictures)}.`);
  if (left.length) out.push(`Left out here: ${list(left)}.`);
  return out;
}

function list(xs: string[]): string {
  if (xs.length < 2) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
