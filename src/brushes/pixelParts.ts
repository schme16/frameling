// The pixel brush's parts, the way parts.ts does it for the vector Brush: what is changed from how a saved pixel brush came,
// part by part. A pixel brush is a Pixel brush dab (its tip is Round, Square or Picture), a Soft paint tool, or a Chalk and
// charcoal stick on paper. The Pixel brush has a Tip, Chalk and charcoal a Stick, Soft paint neither; a Pixel brush's paper is
// its grain's own paper when it keeps one. Pure functions, no DOM.
import type { DabBrush } from '../dab/maths';
import { sameDab } from '../dab/maths';
import type { PixelSpec } from '../dab/spec';
import { sameSpec } from '../dab/spec';
import { NONE_CHANGED, type Parts } from './parts';

/** The same size and the settings of a dab that are not its tip or its paper, for telling what else changed. */
const withoutTipAndPaper = (d: DabBrush, as: DabBrush): DabBrush => ({ ...d, tip: as.tip, picture: as.picture, grain: d.grain ? { ...d.grain, paper: as.grain?.paper } : d.grain });

const samePicture = (a: DabBrush, b: DabBrush): boolean => (a.tip !== 'picture' && b.tip !== 'picture') || sameDab({ ...a, tip: 'picture' }, { ...a, picture: b.picture, tip: 'picture' });

const tipDiffers = (was: DabBrush, live: DabBrush): boolean => was.tip !== live.tip || !samePicture(was, live);

const paperOf = (d: DabBrush) => d.grain?.paper ?? null;
const paperDiffers = (was: DabBrush, live: DabBrush): boolean => !!(was.grain || live.grain) && paperOf(was) !== paperOf(live);

/** Which parts of `live` differ from `was`, the pixel brush as it came. Nothing can be said without a saved brush of the same kind. */
export function pixelPartsOf(was: PixelSpec | undefined, live: PixelSpec | null): Parts {
  if (!was || !live || was.kind !== live.kind) return NONE_CHANGED;
  if (was.kind === 'dab' && live.kind === 'dab') {
    const tip = tipDiffers(was.dab, live.dab);
    const paper = paperDiffers(was.dab, live.dab);
    const other = !sameDab(withoutTipAndPaper(live.dab, was.dab), was.dab);
    return { changed: tip || paper || other, tip, stick: false, other, paper };
  }
  if (was.kind === 'dry' && live.kind === 'dry') {
    const stick = was.medium !== live.medium;
    const other = !sameSpec({ ...live, medium: was.medium }, was);
    return { changed: stick || other, tip: false, stick, other, paper: false };
  }
  const other = !sameSpec(live, was);
  return { changed: other, tip: false, stick: false, other, paper: false };
}

/** The pixel brush with its tip (Round, Square or Picture, and the picture) put back as it came. Only a Pixel brush has one. */
export function withPixelTipOf(live: PixelSpec, was: PixelSpec): PixelSpec {
  if (live.kind !== 'dab' || was.kind !== 'dab') return live;
  return { kind: 'dab', dab: { ...live.dab, tip: was.dab.tip, picture: was.dab.picture } };
}

/** The pixel brush with its stick put back as it came. Only Chalk and charcoal has one. */
export function withPixelStickOf(live: PixelSpec, was: PixelSpec): PixelSpec {
  if (live.kind !== 'dry' || was.kind !== 'dry') return live;
  return { ...live, medium: was.medium };
}

/** The pixel brush with only its own paper put back as it came (its grain's paper). Only a Pixel brush with a grain has one. */
export function withPixelPaperOf(live: PixelSpec, was: PixelSpec): PixelSpec {
  if (live.kind !== 'dab' || was.kind !== 'dab' || !live.dab.grain) return live;
  const { paper: _p, ...rest } = live.dab.grain;
  const own = was.dab.grain?.paper;
  return { kind: 'dab', dab: { ...live.dab, grain: own ? { ...rest, paper: own } : rest } };
}
