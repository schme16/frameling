/**
 * What each export format keeps, in one table, so the Export window can say it before anyone exports, and can list
 * what in this document will be turned into pictures or left out. Pure: no DOM.
 *
 * Keep it in step with the writers (lottie.ts, svg-look.ts, svg.ts, psd/pdf in layered.ts). Pictures-of-frames formats
 * (video, GIF, PNG, sheets) draw with the canvas renderer, so they keep everything. Looks on a symbol's own layers
 * count the same as on the stage: every writer composites them inside the copy (PDF turns the copy's layer into a
 * picture for effects, clipping and masks, as it does on the stage).
 *
 * Lines that draw themselves (Start, End, Offset) are kept by every format: the picture formats draw each frame, SVG and PDF
 * cut the line to what shows on the frame, and Lottie and animated SVG keep a plain line as one line with a trim path or a
 * dash offset that moves (anything fancier, like a line that also has arrow heads, is cut frame by frame, still as vector).
 *
 * Gradients (linear and radial, fills and lines) are kept as real gradients by SVG, animated SVG, Lottie and PDF.
 * Angular (conic) gradients are not: SVG, animated SVG, PDF and Illustrator draw them as 90 thin wedges, and Lottie has no conic
 * gradient, so a shape with one comes out in its own plain colour there.
 * PDF's gradients are solid colours only, so a see-through stop comes out solid there.
 */
import type { Doc, EffectKind } from '../core/format';
import { hasPlaySettings } from '../core/clipPlay';
import { flowExportNotes } from '../core/flow';
import type { FormatId } from './types';
import { effectInfo } from '../effects/model';

import { shapeFeatureOf } from './shapeExport';
import { trimOf } from '../core/trimTween';
import { trimActive } from '../geometry/trim';
import { shapeFxKinds } from '../effects/shapeFx';
import { isGrainy } from '../geometry/tip';
import { onPaper } from '../core/tips';
import { exporterOf, type Carry, type Feature, type FormatCarry } from './registry';
import './builtin';

export type { Carry, Feature };

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
  gradientAlpha: 'see-through colours inside gradients',
  gradientAngular: 'angular gradients (a plain colour instead)',
  trim: 'lines that draw themselves',
  grain: 'chalk and charcoal brush grain',
};

/** What a format keeps (it is in the format's registration, see builtin.ts). */
export function carryOf(format: FormatId): FormatCarry {
  const d = exporterOf(format);
  if (!d) throw new Error(`Nothing exports as "${format}".`);
  return d.carry;
}

/** What a document uses that some formats can't carry exactly. Effects are listed by kind. */
export interface DocFeatures {
  features: Set<Feature>;
  /** Effects on layers and folders. */
  effectKinds: Set<EffectKind>;
  /** Effects on single shapes (they are said separately, since a format that has layer effects can still lack these). */
  shapeEffectKinds: Set<EffectKind>;
  /** Chalk or charcoal lines drawn on paper (Paper tooth), which only the formats that draw pictures can show as they are. */
  tooth: boolean;
}

export function docFeatures(doc: Doc): DocFeatures {
  const features = new Set<Feature>();
  const effectKinds = new Set<EffectKind>();
  const shapeEffectKinds = new Set<EffectKind>();
  let tooth = false;
  const layers = [...doc.layers, ...Object.values(doc.symbols ?? {}).flatMap((s) => s.layers)];
  for (const l of layers) {
    if (l.blend && l.blend !== 'normal') features.add('blend');
    for (const e of l.effects ?? []) if (e.on !== false) effectKinds.add(e.kind);
    if (l.clipToBelow) features.add('clip');
    // A mask that is switched off cuts nothing, so no format needs to carry it.
    if (l.mask && l.visible) features.add('mask');
    if (l.folder) features.add('folders');
    if ((l as { bind?: unknown }).bind) features.add('bones');
  }
  for (const f of Object.values(doc.folders ?? {})) for (const e of f.effects ?? []) if (e.on !== false) effectKinds.add(e.kind);
  for (const d of Object.values(doc.drawings)) {
    if (d.kind !== 'vector') continue;
    shapeFxKinds(d, shapeEffectKinds);
    for (const s of d.shapes) {
      if (trimActive(trimOf(s))) features.add('trim');
      if (s.type === 'stroke' && isGrainy(s.brush)) {
        if (onPaper(s)) tooth = true;
        else features.add('grain');
      }
      const kind = s.type !== 'stroke' && s.type !== 'fill' && s.type !== 'path' && s.type !== 'instance' ? shapeFeatureOf(s.type) : undefined;
      if (kind) features.add(kind);
      else if (s.type === 'instance' && s.tint && s.tint.amount > 0) features.add('tint');
      else if (s.type === 'fill' || s.type === 'path') {
        const grads = s.type === 'fill' ? [s.gradient] : [s.fillGradient, s.strokeGradient];
        if (grads.some((g) => g?.stops.some((st) => /^#[0-9a-f]{6}(?!ff)[0-9a-f]{2}$/i.test(st.color)))) features.add('gradientAlpha');
        if (grads.some((g) => g?.kind === 'angular')) features.add('gradientAngular');
      }
    }
  }
  if (effectKinds.size || shapeEffectKinds.size) features.add('effects');
  return { features, effectKinds, shapeEffectKinds, tooth };
}

/** Does this document have effects a format has no version of, so they'd become pictures there? */
export function bakesEffects(doc: Doc, format: FormatId, found: DocFeatures = docFeatures(doc)): boolean {
  const c = carryOf(format);
  const native = new Set(c.nativeEffects ?? []);
  // An effect on one shape is a picture in every format that makes layer effects into pictures, native kinds included.
  return c.rows?.effects === 'picture' && ([...found.effectKinds].some((k) => !native.has(k)) || found.shapeEffectKinds.size > 0);
}

/** Does this document have Soften or Shadow, which Lottie can do itself but not every player draws? */
export function hasSoftOrShadow(found: DocFeatures): boolean {
  return found.effectKinds.has('blur') || found.effectKinds.has('shadow');
}

/** What the Export window says about angular gradients in a vector format that has no conic gradient but draws them as thin wedges. */
export const ANGULAR_NOTE = 'Angular gradients are made of 90 thin wedges here, each one plain colour. They look the same, and the file comes out bigger.';

/** What the Export window says about chalk and charcoal in a vector format. */
export const GRAIN_NOTE = 'Chalk and charcoal grain stays vector, made of thousands of tiny shapes. It looks the same, and the file comes out bigger.';

/** What the Export window says about chalk and charcoal drawn on paper in a vector format that has no paper tooth. */
export const TOOTH_NOTE = 'Chalk and charcoal that catch on paper come out as tiny shapes here. They stay sharp at any size, but the texture is not the same as on the canvas, and the file comes out bigger.';

/** The same, when the SVG bakes them as pictures (the answer "Look right"). */
export const TOOTH_PICTURE_NOTE = 'Chalk and charcoal that catch on paper are baked as pictures here, so they look as they do on the canvas. Those lines stop being sharp at any size (they are made at twice the size of the file), and the file comes out much bigger.';

/** The same, when it is asked on every export. */
export const TOOTH_ASK_NOTE = 'Chalk and charcoal that catch on paper: you choose when you export. Tiny shapes stay sharp at any size but look less like charcoal; pictures look right but stop being sharp at any size, and the file comes out much bigger.';

/** Which of the three lines about paper tooth goes with the answer in force (shapes, picture, or ask; no answer yet means it will ask). */
export const toothNote = (how: 'shapes' | 'picture' | 'ask' | undefined): string => (how === 'picture' ? TOOTH_PICTURE_NOTE : how === 'shapes' ? TOOTH_NOTE : TOOTH_ASK_NOTE);

/** Plain-words lines about what in this document won't come across as it is, for this format. Empty = all of it. */
export function carryWarnings(doc: Doc, format: FormatId, found: DocFeatures = docFeatures(doc), range?: { start: number; end: number }, tooth: 'shapes' | 'picture' | 'ask' | undefined = 'shapes'): string[] {
  const c = carryOf(format);
  const clipNote = exporterOf(format)?.clipPlayNote;
  // The clip flow's inputs, checks, Any clip arrows and fades go to a Godot sheet and an Interactives package (both say so themselves); anywhere else they are left out, and that is said.
  const flowWarn = format === 'interactives' || format === 'sheet' ? [] : flowExportNotes(doc, 'other');
  const clipWarn = [...(clipNote && doc.clips.some((k) => hasPlaySettings(k)) ? [clipNote] : []), ...(range ? (exporterOf(format)?.docNotes?.(doc, range) ?? []) : []), ...flowWarn];
  if (!c.rows) return clipWarn;
  const out: string[] = [...clipWarn];
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
  // An effect on one shape: a picture of its layer where the format has pictures for effects, left out where it only keeps what it has a version of.
  if (found.shapeEffectKinds.size) {
    const native = new Set(c.nativeEffects ?? []);
    const how = c.rows.effects ?? 'kept';
    const all = [...found.shapeEffectKinds].map((k) => effectInfo(k).label.toLowerCase());
    // Paper tooth on chalk and charcoal lines has its own line below, so a format that draws their tiny shapes does not also say "left out".
    const other = [...found.shapeEffectKinds].filter((k) => !native.has(k) && !(k === 'tooth' && found.tooth && c.rows!.grain === 'shapes')).map((k) => effectInfo(k).label.toLowerCase());
    if (how === 'picture') pictures.push(`layers with a shape that has ${list(all)}`);
    else if (other.length) left.push(`${list(other)} on single shapes`);
  }
  // The same for an angular gradient where there is no conic gradient to write.
  if (found.features.has('gradientAngular') && c.rows.gradientAngular === 'shapes') out.push(ANGULAR_NOTE);
  // Grain stays vector in the formats that carry shapes, but it is a lot of shapes.
  if (found.features.has('grain') && c.rows.grain === 'shapes') out.push(GRAIN_NOTE);
  // Where effects are left out and grain is shapes (SVG), paper tooth comes out as those shapes. Where layers become pictures it is kept as drawn.
  if (found.tooth && c.rows.grain === 'shapes' && c.rows.effects !== 'picture') out.push(toothNote(tooth));
  if (pictures.length) out.push(`Turned into pictures here: ${list(pictures)}.`);
  if (left.length) out.push(`Left out here: ${list(left)}.`);
  return out;
}

function list(xs: string[]): string {
  if (xs.length < 2) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
