/**
 * The Pixel brush, on pixel layers: a stroke as a row of dabs, with a round, square or picture tip, a spacing, scatter,
 * and turning with the line. Anti-aliasing is off by default (a pixel artist usually wants whole pixels); with it on, the
 * edge is see-through, unless the layer keeps to its palette or Pixel perfect says keep it crisp, and then it dithers.
 * The drawing is in painter.ts, shared with the plain Brush on a pixel layer.
 */
import { registerTool, type Tool } from '../core/registry';
import { DabOptionsPanel } from './Options';
import { PIXEL_BRUSH_TOOL } from './live';
import { dabPainter } from './painter';

export { dabEdge } from './painter';

function dabTool(): Tool {
  return {
    id: PIXEL_BRUSH_TOOL,
    group: 'draw',
    groupAt: 1.5,
    stack: 'brush',
    label: 'Pixel brush',
    commandLabel: 'Draw with the pixel brush (tips, spacing, scatter)',
    icon: 'pixel-brush',
    key: 'Alt+Shift+N',
    layers: ['pixel'],
    order: 33,
    help: 'pixel-brush',
    cursor: 'crosshair',
    options: DabOptionsPanel,
    ...dabPainter(),
  };
}

registerTool(dabTool());
