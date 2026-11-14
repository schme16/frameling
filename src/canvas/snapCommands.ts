// Snapping commands: the options popover, and a toggle for each thing to snap to (so the palette can reach every one).
import { registerCommands, type Command } from '../core/registry';
import { SNAP_TARGETS, type SnapTarget } from './snapModel';
import { isPicked, openSnapOptions, setSnapAllLayers, toggleSnapPick } from './snapOps';
import { getViewSettings } from './viewSettings';

const WORDS: Record<SnapTarget, { label: string; description: string; keywords: string[] }> = {
  page: { label: 'Snap to page edges', description: 'Shapes jump onto the four edges of the page when they get close. Pixel layers have their own tick.', keywords: ['page', 'edge', 'border', 'canvas'] },
  centre: { label: 'Snap to page middle', description: 'Shapes jump onto the middle of the page, across and down, when they get close.', keywords: ['centre', 'center', 'middle', 'page'] },
  guides: { label: 'Snap to guides', description: 'Shapes jump onto the guide lines you dragged out of the rulers.', keywords: ['guide', 'ruler', 'lines'] },
  grid: { label: 'Snap to the grid', description: 'Shapes jump onto the grid lines (or the isometric grid corners) while the grid shows.', keywords: ['grid', 'squares', 'isometric'] },
  shapes: { label: 'Snap to other shapes', description: 'Shapes line up with the edges, middles and corner points of the other shapes in the drawing.', keywords: ['shapes', 'objects', 'align', 'edges', 'points', 'smart guides'] },
  spacing: { label: 'Snap to equal gaps', description: 'Shapes settle where the gap to a neighbour matches a gap already there (or sits in the middle of one), and the distance shows.', keywords: ['spacing', 'gap', 'equal', 'distribute', 'even'] },
  perspective: { label: 'Snap to perspective lines', description: 'Lines and boxes follow the perspective guides toward their vanishing points, while those show.', keywords: ['perspective', 'vanishing', 'horizon'] },
  plugins: { label: 'Snap to plugin guides', description: 'Shapes line up with the straight lines and boxes a plugin draws on the canvas as a guide, while that plugin is on and allowed to draw there.', keywords: ['plugin', 'plugins', 'guide', 'extension'] },
  cells: { label: 'Snap to pixel cells', description: 'On a pixel layer, drawing stays on whole pixels and guides, grid and page stay out of the way. Turn it off to snap pixel layers to those as well.', keywords: ['pixel', 'cells', 'pixel perfect', 'pixel art'] },
  angles: { label: 'Snap to angle steps (Shift)', description: 'Holding Shift turns lines and rotations to neat angles. Turn it off if Shift should do nothing there.', keywords: ['angle', 'shift', '45', 'degrees', 'rotate', 'constrain'] },
  artboards: { label: 'Snap to other artboards', description: "Artboards line up with each other's edges and middles when you move or size them with the Artboard tool.", keywords: ['artboard', 'edges', 'align', 'pasteboard'] },
};

const toggles: Command[] = SNAP_TARGETS.map((t) => ({
  id: `view.snap.${t.id}`,
  label: WORDS[t.id].label,
  category: 'View',
  description: WORDS[t.id].description,
  help: 'snapping',
  keywords: ['snap', 'snapping', 'magnet', ...WORDS[t.id].keywords],
  checked: () => isPicked(t.id),
  run: () => toggleSnapPick(t.id),
}));

registerCommands([
  {
    id: 'view.snap.allLayers',
    label: 'Snap to shapes on all layers',
    category: 'View',
    description: 'Other shapes and equal gaps look at every visible layer. Off, they look at the open layer only.',
    help: 'snapping',
    keywords: ['snap', 'snapping', 'layers', 'all layers', 'this layer', 'only'],
    checked: () => getViewSettings().snapAllLayers,
    run: () => setSnapAllLayers(!getViewSettings().snapAllLayers),
  },
  {
    id: 'view.snapOptions',
    label: 'Snapping options...',
    category: 'View',
    description: 'Pick exactly what things snap to: the page, guides, the grid, other shapes, perspective lines, pixel cells, angle steps and other artboards.',
    help: 'snapping',
    keywords: ['snap', 'snapping', 'magnet', 'align', 'options', 'settings'],
    run: openSnapOptions,
  },
  ...toggles,
]);
