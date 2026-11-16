// What the two SVG formats settle before they start: when the drawing has chalk or charcoal that catches on paper,
// how to write it (tiny shapes that scale forever, or a baked picture that looks right). Asked only when such a line
// really goes into the file; loaded on first use.
import { askAgain, choose, getChoiceDef, rememberedChoice } from '../../core/choices';
import type { Doc } from '../../core/format';
import { planExport } from '../plan';
import { loadShapeExports } from '../shapeExport';
import { animatedSvg } from '../svg-anim';
import { frameToSvg } from '../svg';
import { hasToothedLine, meetsTooth, type SvgTooth } from '../svgTooth';
import type { ExportSettings } from '../types';
import { SVG_TOOTH_CHOICE, type SvgToothPref } from '../choices';

/** Does this export put a chalk or charcoal line on paper into the file (the frames it writes, not the whole drawing)? */
export async function svgHasTooth(doc: Doc, s: ExportSettings, frame: number): Promise<boolean> {
  if (!hasToothedLine(doc)) return false;
  await loadShapeExports();
  const plan = planExport(doc, s, frame);
  if (plan.problem) return false;
  return meetsTooth(() => (s.format === 'svganim' ? animatedSvg(doc, { range: plan.range, order: plan.order, scale: 1, loop: plan.loop }) : frameToSvg(doc, plan.range.start, { scale: 1 })));
}

/** The answer for this export: the remembered one, or the question (every time, when that is what is remembered). */
export async function askSvgTooth(): Promise<SvgTooth> {
  if (!getChoiceDef(SVG_TOOTH_CHOICE)) return 'shapes';
  const thisTime = async (): Promise<SvgTooth> => {
    const r = await askAgain(SVG_TOOTH_CHOICE, undefined, { without: ['ask'] });
    return r?.value === 'picture' ? 'picture' : 'shapes';
  };
  if (rememberedChoice(SVG_TOOTH_CHOICE) === 'ask') return thisTime();
  const v = await choose<SvgToothPref>(SVG_TOOTH_CHOICE);
  // "Ask me every time" picked on the first question: that is now remembered, and this export still needs an answer.
  return v === 'ask' ? thisTime() : v;
}

export async function settleSvgTooth(doc: Doc, s: ExportSettings, frame: number): Promise<ExportSettings> {
  if (s.svgTooth || !(await svgHasTooth(doc, s, frame))) return s;
  return { ...s, svgTooth: await askSvgTooth() };
}
