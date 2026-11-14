/**
 * The selection commands on pixel layers. The Edit menu's own commands (Select all, Deselect, Copy, Cut, Paste,
 * Delete, Duplicate, the arrow key nudges, Undo) are taken over here so they do the pixel thing when a pixel layer is active,
 * and what they always did otherwise. Plus Invert selection and the Lasso and Magic wand shortcuts.
 */
import { gridPixels } from '../core/pixelBounds';
import { getCommand, registerCommand, registerCommands, type Command } from '../core/registry';
import { store, type State } from '../core/store';
import { hint } from '../canvas/controller';
import { showPanel } from '../ui/dock';
import { editPixels } from '../pixel/commands';
import { cancelOpenLasso, lassoIsOpen } from '../tools/select';
import { clearPixels, emptyMask, extractPixels, fullMask, invertMask, maskEmpty, resizeMask, resizePixels, type Mask } from './mask';
import {
  activePixelDrawing,
  activePixelGrid,
  cancelFloating,
  deleteFloating,
  dropFloating,
  duplicateSelection,
  floatingPixels,
  floatPixels,
  isFloating,
  nudgeSelection,
  PIXEL_SELECT_TOOL,
  pixelSelection,
  setPixelSelection,
} from './pixel-state';
import { cancelOpenPixelLasso, pixelLassoIsOpen } from './pixel-tool';
import { isPixelSelectTool, toolFor, type SelectMode } from './ways';

const onPixel = (): boolean => !!activePixelGrid();
const hasSel = (): boolean => !!pixelSelection();

// ---------------------------------------------------------------- the pixel clipboard

interface PixelClip {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  mask: Mask;
  /** Page units per art pixel on the layer it came from, so a paste on a vector layer keeps its size. */
  pixelSize: number;
}
let clip: PixelClip | null = null;

export function pixelClipboard(): PixelClip | null {
  return clip;
}

export function clearPixelClipboard(): void {
  clip = null;
}

/** Copies the selected pixels (or the lifted ones, where they are now). */
export function copyPixels(): boolean {
  const lifted = floatingPixels();
  const pixelSize = activePixelGrid()?.layer.pixelSize ?? 1;
  if (lifted) {
    clip = { width: lifted.mask.width, height: lifted.mask.height, pixels: lifted.pixels, mask: lifted.mask, pixelSize };
    return true;
  }
  const m = pixelSelection();
  if (!m) return false;
  const d = activePixelDrawing();
  const pixels = d ? extractPixels(gridPixels(d, m.width, m.height), m) : new Uint8ClampedArray(m.width * m.height * 4);
  clip = { width: m.width, height: m.height, pixels, mask: m, pixelSize };
  return true;
}

/** Takes the selected pixels off the drawing (one undo step). */
export function deletePixels(label = 'Delete pixels'): boolean {
  if (isFloating()) {
    deleteFloating(label);
    return true;
  }
  const m = pixelSelection();
  if (!m) return false;
  if (!activePixelDrawing()) return false;
  return editPixels(label, (d) => clearPixels(d.pixels, m));
}

/** Pastes the copied pixels in the same place, lifted, so they can be dragged into position. */
export function pastePixels(): boolean {
  const c = clip;
  const a = activePixelGrid();
  if (!c || !a) return false;
  // Another layer with a different pixel size: same art pixels, kept at the top left.
  const pixels = resizePixels(c.pixels, c.width, c.height, a.width, a.height);
  const mask = resizeMask(c.mask, a.width, a.height);
  if (maskEmpty(mask)) {
    hint('What you copied would land off the edge of this layer.');
    return false;
  }
  if (!isPixelSelectTool(store().get().ui.tool)) store().setUi({ tool: PIXEL_SELECT_TOOL });
  return floatPixels(pixels, mask);
}

// ---------------------------------------------------------------- taking over the Edit menu's commands

/** Re-registers a command so it does `pixel` on a pixel layer, and what it did before everywhere else. */
function extend(id: string, pixel: { enabled: () => boolean; run: () => void }, always = false): void {
  const orig = getCommand(id);
  if (!orig) return;
  const own = (s: State) => (orig.enabled ? orig.enabled(s) : true);
  const usePixel = () => (always ? pixel.enabled() : onPixel());
  registerCommand({
    ...orig,
    enabled: (s) => (usePixel() ? pixel.enabled() : own(s)),
    run: () => (usePixel() ? pixel.run() : orig.run()),
  });
}

/** Turns the nudge commands into pixel nudges on a pixel layer. */
function extendNudge(id: string, dx: number, dy: number): void {
  extend(id, { enabled: hasSel, run: () => void nudgeSelection(dx, dy) });
}

/** Lets go: an open lasso, lifted pixels (they land), then the selection. */
export function deselectPixels(): void {
  if (cancelOpenPixelLasso()) return;
  if (isFloating()) dropFloating();
  setPixelSelection(null);
}

function install(): void {
  extend('select.all', { enabled: onPixel, run: () => {
    const a = activePixelGrid();
    if (a) setPixelSelection(fullMask(a.width, a.height));
  } });
  extend('select.none', { enabled: () => hasSel(), run: deselectPixels });
  // Escape also closes a lasso left open between Alt+clicks, on either kind of layer.
  const none = getCommand('select.none');
  if (none) {
    registerCommand({
      ...none,
      enabled: (s) => lassoIsOpen() || pixelLassoIsOpen() || (none.enabled ? none.enabled(s) : true),
      run: () => {
        if (cancelOpenLasso() || cancelOpenPixelLasso()) return store().setUi({});
        return none.run();
      },
    });
  }
  extend('edit.copy', { enabled: hasSel, run: () => void copyPixels() });
  extend('edit.cut', { enabled: hasSel, run: () => void (copyPixels() && deletePixels('Cut pixels')) });
  extend('edit.paste', { enabled: () => !!clip, run: () => void pastePixels() });
  extend('edit.delete', { enabled: hasSel, run: () => void deletePixels() });
  // Ctrl+D. Plain D (copy the drawing to the next frame) is a different key and keeps working with a selection.
  extend('edit.duplicate', { enabled: hasSel, run: () => void duplicateSelection() });
  // Undo while pixels are lifted just puts them back.
  extend('edit.undo', { enabled: isFloating, run: cancelFloating }, true);
  for (const [id, dx, dy] of [
    ['select.nudgeLeft', -1, 0],
    ['select.nudgeRight', 1, 0],
    ['select.nudgeUp', 0, -1],
    ['select.nudgeDown', 0, 1],
    ['select.nudgeLeftMore', -10, 0],
    ['select.nudgeRightMore', 10, 0],
    ['select.nudgeUpMore', 0, -10],
    ['select.nudgeDownMore', 0, 10],
  ] as const)
    extendNudge(id, dx, dy);
}

install();

// ---------------------------------------------------------------- new commands

/** Picks the tool for a way, on whichever kind of layer you are on. */
function pickWith(mode: SelectMode): void {
  const tool = toolFor(mode, onPixel());
  if (!tool) return hint('The magic wand picks pixels by colour, so it works on pixel layers.');
  store().setUi({ tool });
}

// The four ways of picking are tools with their own commands now (tools.select-lasso and so on), so these older
// "pick the way" commands stay only for keys that name them (the Aseprite set's Q) and are kept out of the lists.
const commands: Command[] = [
  {
    id: 'select.invert',
    label: 'Invert selection',
    category: 'Edit',
    keys: ['Mod+Shift+I'],
    description: 'Select everything that was not selected, and let go of what was.',
    help: 'pixel-select',
    keywords: ['inverse', 'reverse', 'flip selection', 'everything else'],
    enabled: () => onPixel(),
    run: () => {
      const a = activePixelGrid();
      if (!a) return;
      if (isFloating()) dropFloating();
      const m = pixelSelection() ?? emptyMask(a.width, a.height);
      setPixelSelection(invertMask(m));
    },
  },
  {
    id: 'select.numbers',
    label: 'Type an exact position and size',
    category: 'Edit',
    description: 'Opens the X, Y, Width, Height and Turn boxes for what is selected, shapes or pixels, so you can place it exactly.',
    help: 'selection-numbers',
    keywords: ['position', 'coordinates', 'x y', 'size', 'width', 'height', 'resize exactly', 'numbers', 'transform', 'rotate', 'turn', 'skew', 'slant', 'move exactly', 'precise', 'properties'],
    enabled: (s) => s.ui.selection.length > 0 || hasSel(),
    run: () => {
      showPanel('symbol-props');
      // The panel may have just opened: give it a moment to draw before taking the focus.
      setTimeout(() => document.querySelector<HTMLInputElement>('.sy-props input[aria-label="X"]')?.focus(), 120);
    },
  },
  {
    id: 'select.box',
    hidden: true,
    label: 'Select with a box',
    category: 'Tools',
    description: 'The Select tool, picking with a rectangle (marquee).',
    help: 'pixel-select',
    keywords: ['marquee', 'rectangle', 'rectangular selection', 'box select'],
    run: () => pickWith('box'),
  },
  {
    id: 'select.lasso',
    hidden: true,
    label: 'Lasso',
    category: 'Tools',
    description: 'The Select tool, drawing round what you want. Hold Alt as you let go for straight sides.',
    help: 'pixel-select',
    keywords: ['lasso', 'freehand selection', 'polygon lasso', 'draw round'],
    run: () => pickWith('lasso'),
  },
  {
    id: 'select.magnetic',
    hidden: true,
    label: 'Magnetic lasso',
    category: 'Tools',
    description: 'The Select tool, tracing roughly round something and clinging to its edge. Click to place a point, Backspace takes one back, Enter closes it.',
    help: 'select-magnetic',
    keywords: ['magnetic', 'magnet', 'edge', 'snap', 'cling', 'follow edge', 'smart select', 'intelligent scissors', 'cut out', 'trace', 'outline'],
    run: () => pickWith('magnetic'),
  },
  {
    id: 'select.wand',
    hidden: true,
    label: 'Magic wand',
    category: 'Tools',
    description: 'The Select tool on a pixel layer, picking every pixel of the colour you click.',
    help: 'pixel-select',
    keywords: ['magic wand', 'select colour', 'select color', 'by colour', 'tolerance'],
    enabled: () => onPixel(),
    run: () => pickWith('wand'),
  },
];
registerCommands(commands);
