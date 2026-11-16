/**
 * Grow, shrink and feather the selection. On a pixel layer these work on the selection itself (grow and shrink move
 * its edge out or in; feather fades it, and everything that uses a selection then respects the fade). On a vector
 * layer the selection is the picked shapes, so grow and shrink resize those shapes (the same maths as Offset path) and
 * feather softens their edges (the Soften effect).
 */
import { getCommand, registerCommands, registerHelp } from '../core/registry';
import { say } from '../core/reasons';
import { store, type State } from '../core/store';
import { toast } from '../ui/toast';
import { softenPicked } from '../effects/shapeOps';
import { resizePicked } from '../tools/offset';
import { activeLayer } from '../tools/edit';
import { featherMask, growMask, maskCount, MAX_REACH, type Mask } from './mask';
import { activePixelGrid, isFloating, dropFloating, pixelSelection, setPixelSelection } from './pixel-state';

export type EdgeWay = 'grow' | 'shrink' | 'feather';

/** What was last used, so the commands and the dialog start where you left off. */
let reach = 4;
export const edgeReach = (): number => reach;
export function rememberReach(px: number): number {
  reach = Math.max(1, Math.min(MAX_REACH, Math.round(px) || reach));
  return reach;
}

/** The mask after one of the three, as a new mask. Feather keeps its own radius (a soft edge) and the others make a hard edge. */
export function edgeOf(m: Mask, way: EdgeWay, px: number): Mask {
  return way === 'grow' ? growMask(m, px) : way === 'shrink' ? growMask(m, -px) : featherMask(m, px);
}

const onVector = (): boolean => activeLayer().layer?.kind === 'vector';
const hasPixels = (): boolean => !!activePixelGrid() && !!pixelSelection();
const hasShapes = (s: State): boolean => onVector() && s.ui.selection.length > 0;
/** Is there anything for the three to work on? */
export const canEdge = (s: State): boolean => hasPixels() || hasShapes(s);
export const needSomethingPicked = say('Select something first: pixels with the Select tool, or shapes on a vector layer.');

const WORDS: Record<EdgeWay, { pixel: (n: number, px: number) => string; shapes: (px: number) => string }> = {
  grow: { pixel: (n, px) => `Grew the selection by ${px} px. It now holds ${n} pixel${n === 1 ? '' : 's'}.`, shapes: (px) => `Made the picked shapes ${px} px bigger all the way round.` },
  shrink: { pixel: (n, px) => `Shrank the selection by ${px} px. It now holds ${n} pixel${n === 1 ? '' : 's'}.`, shapes: (px) => `Made the picked shapes ${px} px smaller all the way round.` },
  feather: { pixel: (_n, px) => `Feathered the edge by ${px} px. Paint, fill, delete and copy now fade out along it.`, shapes: (px) => `Softened the edges of the picked shapes by ${px} px.` },
};

/** Does one of the three on whatever is selected; false (with a word) when nothing is. */
export function applyEdge(way: EdgeWay, px: number = reach): boolean {
  const n = Math.max(1, Math.min(MAX_REACH, Math.round(px)));
  const s = store().get();
  const a = activePixelGrid();
  if (a) {
    if (isFloating()) dropFloating();
    const m = pixelSelection();
    if (!m) {
      toast('Select some pixels first, then grow, shrink or feather the selection.');
      return false;
    }
    const out = edgeOf(m, way, n);
    if (way === 'shrink' && maskCount(out) === 0) {
      toast(`Shrinking by ${n} px would take the whole selection away. Try a smaller number.`);
      return false;
    }
    setPixelSelection(out);
    toast(WORDS[way].pixel(maskCount(out), n));
    return true;
  }
  if (!hasShapes(s)) {
    toast('Select some shapes first, then grow, shrink or feather them.');
    return false;
  }
  if (way === 'feather') {
    const ok = softenPicked(Math.min(60, n));
    if (ok) toast(WORDS.feather.shapes(Math.min(60, n)));
    return ok;
  }
  resizePicked(way === 'grow' ? n : -n);
  return true;
}

registerCommands([
  {
    id: 'select.grow',
    label: 'Grow the selection',
    category: 'Edit',
    description: 'Push the edge of the selection out by the last amount you used. On shapes it makes them bigger all the way round.',
    help: 'selection-edge',
    keywords: ['expand', 'bigger', 'enlarge', 'outset', 'swell', 'modify selection', 'selection edge'],
    enabled: canEdge,
    reason: needSomethingPicked,
    run: () => void applyEdge('grow'),
  },
  {
    id: 'select.shrink',
    label: 'Shrink the selection',
    category: 'Edit',
    description: 'Pull the edge of the selection in by the last amount you used. On shapes it makes them smaller all the way round.',
    help: 'selection-edge',
    keywords: ['contract', 'smaller', 'inset', 'reduce', 'modify selection', 'selection edge'],
    enabled: canEdge,
    reason: needSomethingPicked,
    run: () => void applyEdge('shrink'),
  },
  {
    id: 'select.feather',
    label: 'Feather the selection',
    category: 'Edit',
    description: 'Fade the edge of the selection so a paste, a fill or a delete blends in instead of looking cut out. On shapes it softens their edges.',
    help: 'selection-edge',
    keywords: ['soft edge', 'soften', 'blur edge', 'fade edge', 'smooth edge', 'cut out', 'halo', 'modify selection', 'selection edge'],
    enabled: canEdge,
    reason: needSomethingPicked,
    run: () => void applyEdge('feather'),
  },
  {
    id: 'select.edge',
    label: 'Grow, shrink or feather the selection...',
    category: 'Edit',
    keys: ['Mod+Alt+F'],
    description: 'Opens a small card: pick grow, shrink or feather, slide the amount and see the edge before you press the button.',
    help: 'selection-edge',
    keywords: ['modify selection', 'selection edge', 'expand', 'contract', 'soft edge', 'feather', 'grow', 'shrink', 'smooth', 'border'],
    enabled: canEdge,
    reason: needSomethingPicked,
    // The card loads on first use.
    run: () => void import('./EdgeDialog').then((m) => m.openEdgeDialog()),
  },
]);

registerHelp({
  id: 'selection-edge',
  title: 'Grow, shrink and feather a selection',
  section: 'Drawing',
  media: 'selection-edge.png',
  summary: 'Push the edge of a selection out or in, or fade it so a paste blends in instead of looking cut out (feather).',
  keywords: ['feather', 'grow selection', 'shrink selection', 'expand selection', 'contract selection', 'soft edge', 'modify selection', 'smooth selection', 'halo', 'cut out', 'fade edge'],
});

export const edgeCommandIds = ['select.grow', 'select.shrink', 'select.feather'] as const;
void getCommand;
