/**
 * Eyedropper [I]: click to pick up the colour you see on the canvas (all layers together, as it looks), and use it.
 * Drag to keep looking. Alt picks from the active layer only.
 */
import { activeColor, setActiveColor } from './wells';
import { renderFrame } from '../core/render';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { toHex } from '../canvas/colors';
import { canvasCamera } from '../camera/ops';
import { EyedropperOptions } from './options/EyedropperOptions';
import { noteColorUsed } from './recent';
import { getToolSettings } from './settings';
import { toolEvent } from './toolEvents';

let probe: { c: OffscreenCanvas | HTMLCanvasElement; g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } | null = null;

function getProbe() {
  if (!probe) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
    const g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    probe = { c, g };
  }
  return probe;
}

/**
 * The colour the frame shows at a stage position as #rrggbb, or null when there's nothing there (see-through). Looking
 * through the camera, the picture on screen has every layer at its own depth speed, so the colour is read from the
 * camera's picture at the spot the pointer is over, not from the layers at rest.
 */
export function sampleColor(px: number, py: number, activeLayerOnly: boolean): string | null {
  const { doc, ui } = store().get();
  const cam = canvasCamera();
  const [x, y] = cam ? ([cam.matrix[0] * px + cam.matrix[2] * py + cam.matrix[4], cam.matrix[1] * px + cam.matrix[3] * py + cam.matrix[5]] as const) : ([px, py] as const);
  if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return null;
  const { g } = getProbe();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, 1, 1);
  // Aim the one pixel we read at the middle of the spot.
  g.setTransform(1, 0, 0, 1, 0.5 - x, 0.5 - y);
  renderFrame(g, doc, ui.frame, activeLayerOnly ? { background: false, camera: !!cam, layerFilter: (l) => l.id === ui.activeLayerId } : { camera: !!cam });
  const d = g.getImageData(0, 0, 1, 1).data;
  if (d[3] === 0) return null;
  return toHex(d[0], d[1], d[2]);
}

function pick(e: ToolPointer, ctx: ToolContext, speak: boolean): void {
  const c = sampleColor(e.x, e.y, e.alt || getToolSettings().pickActiveLayerOnly);
  if (!c) {
    if (speak) ctx.hint("There's nothing to pick up there. It's see-through.");
    return;
  }
  // Into whichever colour box is in front (fill or stroke), as in Illustrator.
  if (c !== activeColor()) setActiveColor(c);
}

export const eyedropperTool: Tool = {
  id: 'eyedropper',
  group: 'extras',
  groupAt: 3,
  label: 'Eyedropper',
  icon: 'eyedropper',
  key: 'i',
  layers: ['vector', 'pixel'],
  order: 70,
  help: 'tool-eyedropper',
  cursor: 'crosshair',
  options: EyedropperOptions,
  down(e, ctx) {
    pick(e, ctx, true);
  },
  move(e, ctx) {
    pick(e, ctx, false);
  },
  up() {
    const c = activeColor();
    if (c) noteColorUsed(c);
  },
};

/**
 * Hold Alt with a painting tool on a pixel layer and the press picks a colour instead of painting, as in Aseprite. The
 * shape and select tools keep Alt for their own use (draw from the middle, take away from a selection).
 */
const ALT_PICK_TOOLS = new Set(['pencil', 'brush', 'eraser', 'fill', 'shade', 'dither', 'spray']);
export const altPicks = (tool: string, layerKind: string | undefined, alt: boolean): boolean => alt && layerKind === 'pixel' && ALT_PICK_TOOLS.has(tool);

/** The pointer as the temporary eyedropper sees it: Alt is what asked for it, so it doesn't also mean "this layer only". */
export const plainPointer = (e: ToolPointer): ToolPointer => (e.alt ? { ...e, alt: false } : e);

/** The eyedropper for one press made with Alt held over another tool. */
export const tempEyedropperTool: Tool = {
  ...eyedropperTool,
  down: (e, ctx) => {
    toolEvent('altPick');
    eyedropperTool.down?.(plainPointer(e), ctx);
  },
  move: (e, ctx) => eyedropperTool.move?.(plainPointer(e), ctx),
};

registerTool(eyedropperTool);
