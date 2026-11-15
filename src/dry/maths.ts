/**
 * Dry media maths: how much pigment a pixel takes from a stroke, given how hard it was pressed and how high that bit
 * of paper stands. Light pressure reaches only the high points, so a light stroke is specks; hard pressure fills the
 * pits in too. Pure functions, no DOM.
 */
import { paperInfo, type PaperKind } from './paper';

export type DryId = 'vine-charcoal' | 'compressed-charcoal' | 'chalk' | 'soft-pastel' | 'oil-pastel' | 'crayon' | 'sketch-pencil' | 'soft-pencil' | 'colour-pencil';

export interface Medium {
  id: DryId;
  label: string;
  /** One plain line for the options panel. */
  hint: string;
  /** Width in pixels, how firm the edge is (0 to 1) and how hard you press (0.05 to 1), until you change them. */
  size: number;
  hardness: number;
  press: number;
  /** How much the paper's bumps decide where pigment lands: 1 all of it, 0 none (a flat fill). */
  tooth: number;
  /** How gradually a pixel goes from bare to covered. Small is sharp specks, large is soft grain. */
  soft: number;
  /** The most of a pixel one pass can cover. Under 1 and a little paper always shows. */
  ceiling: number;
  /** How much pigment already there helps the next pass take hold in the pits. */
  lift: number;
  /** How much the stick's own bumps streak the mark along the way you drag, 0 to 1. */
  streak: number;
}

export const MEDIA: Medium[] = [
  { id: 'vine-charcoal', label: 'Vine charcoal', hint: 'Light, dusty and never quite black. The paper shows through even when you press hard.', size: 26, hardness: 0.15, press: 0.7, tooth: 1, soft: 0.5, ceiling: 0.88, lift: 0.3, streak: 0.5 },
  { id: 'compressed-charcoal', label: 'Compressed charcoal', hint: 'Dense and dark. Goes to a rich black when you press, with the grain showing in the lighter tones.', size: 20, hardness: 0.3, press: 0.8, tooth: 1, soft: 0.42, ceiling: 0.98, lift: 0.5, streak: 0.35 },
  { id: 'chalk', label: 'Chalk', hint: 'Dry and matte, with a crumbly edge. Try it in a pale colour on dark paper.', size: 18, hardness: 0.45, press: 0.7, tooth: 1, soft: 0.1, ceiling: 0.95, lift: 0.25, streak: 0.4 },
  { id: 'soft-pastel', label: 'Soft pastel', hint: 'Rich colour that fills the grain quickly and builds up as you go over it.', size: 26, hardness: 0.55, press: 0.85, tooth: 0.9, soft: 0.28, ceiling: 1, lift: 0.7, streak: 0.25 },
  { id: 'oil-pastel', label: 'Oil pastel', hint: 'Waxy and heavy. It covers the paper almost solid, with only a little tooth showing.', size: 18, hardness: 0.7, press: 0.9, tooth: 0.7, soft: 0.35, ceiling: 1, lift: 0.85, streak: 0.12 },
  { id: 'crayon', label: 'Crayon', hint: 'Wax that skips the pits in the paper in sharp little flecks, and fills in slowly.', size: 12, hardness: 0.8, press: 0.7, tooth: 0.95, soft: 0.07, ceiling: 1, lift: 0.12, streak: 0.3 },
  { id: 'sketch-pencil', label: 'Sketch pencil', hint: 'A hard grey line with a light touch of grain. Press for darker.', size: 3, hardness: 0.9, press: 0.7, tooth: 0.55, soft: 0.3, ceiling: 0.9, lift: 0.2, streak: 0.08 },
  { id: 'soft-pencil', label: 'Soft pencil (6B)', hint: 'A broad, dark pencil that smudges easily and shows the paper.', size: 6, hardness: 0.7, press: 0.75, tooth: 0.7, soft: 0.3, ceiling: 0.95, lift: 0.4, streak: 0.15 },
  { id: 'colour-pencil', label: 'Colour pencil', hint: 'A fine tip that lays colour thinly, so you go over it again to build it up.', size: 4, hardness: 0.9, press: 0.6, tooth: 0.6, soft: 0.3, ceiling: 0.85, lift: 0.18, streak: 0.08 },
];

export const MEDIUM_IDS: DryId[] = MEDIA.map((m) => m.id);
export const isMedium = (v: unknown): v is DryId => typeof v === 'string' && (MEDIUM_IDS as string[]).includes(v);
export const mediumInfo = (id: DryId): Medium => MEDIA.find((m) => m.id === id) ?? MEDIA[0];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * How deep the paper is at a pixel, 0 (a peak, takes pigment first) to 1 (a pit, takes it last). A paper that is not
 * very bumpy squeezes its pits and peaks toward the middle, so the pressure alone decides more.
 */
export function pitDepth(height: number, paperTooth: number, mediumTooth: number): number {
  const t = clamp01(paperTooth * mediumTooth);
  return 0.5 + (1 - height - 0.5) * t;
}

/**
 * How much of this pixel the pigment covers, 0 to 1.
 * - `reach` is how far the stick gets into the paper here: the brush's strength at this pixel times how hard you press.
 * - `depth` is how deep the pit is (see pitDepth).
 * - `have` is how much pigment is already on this pixel (0 to 1). It builds the paper up, so a second pass takes hold
 *   where the first only touched the peaks.
 */
export function deposit(reach: number, depth: number, have: number, m: Pick<Medium, 'soft' | 'ceiling' | 'lift'>): number {
  if (reach <= 0) return 0;
  const d = depth - m.lift * 0.5 * clamp01(have);
  const x = (reach - d) / m.soft;
  if (x <= -1) return 0;
  return m.ceiling * (x >= 1 ? 1 : smooth(0.5 + 0.5 * x));
}

/** A stroke's pigment at a pixel for one medium on one paper. `height` is the paper's height there (see paperHeight). */
export function pigmentAt(m: Medium, paper: PaperKind, height: number, reach: number, have: number): number {
  return deposit(reach, pitDepth(height, paperInfo(paper).tooth, m.tooth), have, m);
}

/** A smooth bump pattern across the stick: 0 to 1, the same at the same distance from the stroke's middle line. */
export function streakAt(across: number, seed: number): number {
  const a = across / 1.6;
  const b = across / 4.5 + 7.3;
  const n = (t: number, k: number) => {
    const i = Math.floor(t);
    const f = t - i;
    const h = (j: number) => {
      let x = (Math.imul(j + k * 977, 374761393) + Math.imul(seed, 668265263)) | 0;
      x = Math.imul(x ^ (x >>> 13), 1274126177);
      return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
    };
    const u = f * f * (3 - 2 * f);
    return h(i) * (1 - u) + h(i + 1) * u;
  };
  return 0.6 * n(a, 1) + 0.4 * n(b, 2);
}
