/**
 * Dashed and dotted lines, arrow heads, and a width that changes along a line: the commands, and what the tool options
 * do. The geometry is in src/geometry/lineStyle.ts. Every choice is set for the next shapes you draw and, when shapes
 * are picked, put on them too, in one undo step.
 */
import type { ArrowHead, PathStroke } from '../core/format';
import { registerCommands, registerHelp } from '../core/registry';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { ARROW_HEADS, DASH_PRESETS, WIDTH_PRESETS, dashPatch, restyleShapes, widthPatch, type DashKind, type StylePatch, type WidthKind } from '../geometry/lineStyle';
import { editShapes, selected } from './merge-mode';
import { EDIT_HINTS } from './edit';
import { getToolSettings, setToolSettings } from './settings';

const have = (): boolean => selected().length > 0;

/** Puts a change on the selected shapes' outlines (one undo step), and says plainly if there was nothing to put it on. */
export function styleSelected(label: string, patch: StylePatch | ((st: PathStroke) => StylePatch)): void {
  const picked = selected();
  if (!picked.length) return;
  const ids = new Set(picked.map((s) => s.id));
  let counted = { changed: 0, skipped: 0 };
  const r = editShapes(label, (before) => {
    const out = restyleShapes(before, ids, patch);
    counted = out;
    return out.changed ? out.shapes : null;
  });
  if (r !== 'ok' && r !== 'nothing') return void toast(EDIT_HINTS[r]);
  if (!counted.changed && counted.skipped) toast('Those have no outline to change. Pick a shape with an outline, or a line.');
}

/** A dash choice: the next shapes get it, and so do the ones picked. */
export function chooseDash(kind: DashKind): void {
  setToolSettings({ lineDash: kind });
  if (have()) styleSelected(DASH_PRESETS[kind].label === 'Solid' ? 'Make the line solid' : `Make the line ${DASH_PRESETS[kind].label.toLowerCase()}`, dashPatch(kind));
}

export function chooseWidth(kind: WidthKind): void {
  setToolSettings({ lineWidth: kind });
  if (have()) styleSelected('Change the width along the line', widthPatch(kind));
}

export function chooseArrow(end: 'start' | 'end', head: ArrowHead | 'none'): void {
  setToolSettings(end === 'start' ? { arrowStart: head } : { arrowEnd: head });
  const key = end === 'start' ? 'arrowStart' : 'arrowEnd';
  if (have()) styleSelected(head === 'none' ? 'Take off the arrow head' : 'Add an arrow head', { [key]: head === 'none' ? undefined : head });
}

/** Adds an arrow head to the end of the picked lines, or takes it off when every one already has it. */
function toggleArrow(end: 'start' | 'end'): void {
  const key = end === 'start' ? 'arrowStart' : 'arrowEnd';
  const now = getToolSettings()[key];
  if (!have()) return chooseArrow(end, now === 'none' ? 'triangle' : 'none');
  const allHave = selected().every((s) => s.type !== 'path' || !s.stroke || !!s.stroke[key]);
  chooseArrow(end, allHave ? 'none' : 'triangle');
}

const DASH_WORDS: Record<DashKind, { description: string; keywords: string[] }> = {
  solid: { description: 'Make the outline of the picked shapes (and the next ones you draw) a plain, unbroken line.', keywords: ['no dashes', 'plain line', 'continuous'] },
  dashed: { description: 'Make the outline dashes with gaps between them. The dashes scale with the line’s thickness.', keywords: ['dash', 'broken line', 'dashes', 'stroke-dasharray'] },
  dotted: { description: 'Make the outline a row of round dots. It rounds the line’s ends so the dots show.', keywords: ['dots', 'dot line', 'dotted line', 'round dots'] },
  dashdot: { description: 'Make the outline a dash, then a dot, then a dash, and so on.', keywords: ['dash dot', 'dash and dot', 'centre line', 'chain line'] },
};

registerCommands([
  ...(Object.keys(DASH_PRESETS) as DashKind[]).map((k) => ({
    id: `stroke.dash.${k}`,
    label: k === 'solid' ? 'Line: solid' : k === 'dashed' ? 'Line: dashed' : k === 'dotted' ? 'Line: dotted' : 'Line: dash and dot',
    category: 'Arrange',
    description: DASH_WORDS[k].description,
    help: 'line-style',
    keywords: [...DASH_WORDS[k].keywords, 'line style', 'stroke', 'outline'],
    checked: () => getToolSettings().lineDash === k,
    run: () => chooseDash(k),
  })),
  {
    id: 'stroke.arrow.end',
    label: 'Arrow head at the end of a line',
    category: 'Arrange',
    description: 'Put an arrow head on the end of the picked lines (and the next ones you draw), or take it off. Works on open lines.',
    help: 'line-style',
    keywords: ['arrow', 'arrowhead', 'pointer', 'line end', 'marker', 'stroke', 'outline'],
    checked: () => getToolSettings().arrowEnd !== 'none',
    run: () => toggleArrow('end'),
  },
  {
    id: 'stroke.arrow.start',
    label: 'Arrow head at the start of a line',
    category: 'Arrange',
    description: 'Put an arrow head on the start of the picked lines (and the next ones you draw), or take it off. Works on open lines.',
    help: 'line-style',
    keywords: ['arrow', 'arrowhead', 'pointer', 'line start', 'marker', 'stroke', 'outline'],
    checked: () => getToolSettings().arrowStart !== 'none',
    run: () => toggleArrow('start'),
  },
  ...(Object.keys(WIDTH_PRESETS) as WidthKind[]).map((k) => ({
    id: `stroke.width.${k}`,
    label: `Line width: ${WIDTH_PRESETS[k].label.toLowerCase()}`,
    category: 'Arrange',
    description: k === 'even' ? 'Make the line the same width all the way along.' : `Make the picked lines (and the next ones you draw) change width along their length: ${WIDTH_PRESETS[k].label.toLowerCase()}. It is saved as a filled outline in SVG, PDF and Lottie.`,
    help: 'line-style',
    keywords: ['variable width', 'taper', 'swell', 'brush', 'pressure', 'stroke width', 'line style', 'outline', 'calligraphy'],
    checked: () => getToolSettings().lineWidth === k,
    run: () => chooseWidth(k),
  })),
]);

registerHelp({
  id: 'line-style',
  title: 'Dashed lines, arrows and tapered lines',
  section: 'Drawing',
  media: 'line-style.png',
  summary: 'Make an outline dashed or dotted, put arrow heads on a line, or let its width change along its length.',
  keywords: ['dash', 'dashed', 'dotted', 'arrow', 'arrowhead', 'taper', 'variable width', 'stroke', 'outline', 'line style'],
});

export { ARROW_HEADS };
