/**
 * Fill and stroke colours, the way Illustrator does them: two colour boxes, one in front (the active one). The picker,
 * swatches and eyedropper change the one in front. Shapes are drawn with both: the fill inside and the stroke round
 * the edge. Brush, pencil and pixel lines use the stroke colour; the paint bucket uses the fill colour.
 *
 * Changing a colour while shapes are selected also recolours them (one undo step per drag).
 *
 * Keys: X brings the other box to the front, Shift+X swaps the two colours (and gradients), Shift+D goes back to the defaults (the theme's
 * fill, black stroke; plain D is "copy drawing to next frame" in the timeline), / sets the box in front to none.
 */
import type { Color } from '../core/format';
import { registerCommands, registerHelp } from '../core/registry';
import { store, type UiState } from '../core/store';
import { activeDrawing, editActiveDrawing } from './edit';
import { cssVar, subscribeTheme } from '../canvas/theme';
import { applyGradientToSelection, endGradientGesture, getGradientWells, matchSelectedColours, giveBare, matchSelectedGradients, paintView, setPaintKind, swapGradientWells, writeColour } from './gradient-wells';
import { paintWellsOn, shapesFilled } from './pixelWells';

// A soft yellow that reads on white paper, so the first shape and the first bucket click show up (see themeFill).
/** The fill used when there's no theme to ask (tests, before the page styles load). */
export const DEFAULT_FILL: Color = '#ffc94a';

/** Any CSS colour as #rrggbb, or null if the browser can't read it. */
function toHex(css: string): Color | null {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css.toLowerCase();
  if (typeof OffscreenCanvas === 'undefined') return null;
  const g = new OffscreenCanvas(1, 1).getContext('2d');
  if (!g) return null;
  g.fillStyle = '#000001';
  g.fillStyle = css;
  const v = String(g.fillStyle);
  return /^#[0-9a-f]{6}$/i.test(v) && v !== '#000001' ? v : null;
}

/**
 * The default fill comes from the editor's theme: its highlight colour (gold in the default themes, aqua in Ice Camo,
 * lavender in Lilac Static and so on), so a new shape reads on white paper and feels part of the theme you picked.
 */
export function themeFill(): Color {
  return toHex(cssVar('--chosen-bg', DEFAULT_FILL)) ?? DEFAULT_FILL;
}

// When the theme changes, a fill still on the old theme's default follows it; one you picked yourself stays.
let lastThemeFill: Color = DEFAULT_FILL;
function followTheme(): void {
  const next = themeFill();
  const ui = store().get().ui;
  if ((ui.fillColor === lastThemeFill || ui.fillColor === DEFAULT_FILL) && next !== ui.fillColor) store().setUi({ fillColor: next });
  lastThemeFill = next;
}
if (typeof document !== 'undefined') {
  subscribeTheme(followTheme);
  // Once the theme's tokens are on the page.
  requestAnimationFrame(followTheme);
}
export const DEFAULT_STROKE: Color = '#1d1b26';

/** The colour in the box that's in front, or null when it's set to none. */
export function activeColor(ui: UiState = store().get().ui): Color | null {
  // Paint and Back (the Pixel workspace): the colour you set and pick is always Paint.
  if (paintWellsOn()) return ui.color;
  return ui.activeWell === 'fill' ? ui.fillColor : ui.strokeOn ? ui.color : null;
}

/** The fill shapes and shapes should use (null = none). */
export function shapeColors(ui: UiState = store().get().ui): { fill: Color | null; stroke: Color | null } {
  // Paint and Back: shapes are drawn in Paint, and filled in Paint when "Filled" is on.
  if (paintWellsOn()) {
    const f = shapesFilled();
    return { fill: f === 'back' ? ui.fillColor : f ? ui.color : null, stroke: ui.color };
  }
  return { fill: ui.fillColor, stroke: ui.strokeOn ? ui.color : null };
}

/** Recolours the selected shapes on the active drawing to match the boxes (one undo step per burst). */
function applyToSelection(which: 'fill' | 'stroke'): void {
  const { ui } = store().get();
  if (!ui.selection.length) return;
  const d = activeDrawing();
  if (!d || d.kind !== 'vector') return;
  const ids = new Set(ui.selection);
  if (!d.shapes.some((s) => ids.has(s.id))) return;
  const { fill, stroke } = shapeColors(ui);
  editActiveDrawing(
    which === 'fill' ? 'Change fill colour' : 'Change stroke colour',
    'vector',
    (dr) => {
      for (const s of dr.shapes) {
        if (!ids.has(s.id)) continue;
        if (which === 'fill') {
          if ((s.type === 'fill' || s.type === 'text') && fill) s.color = fill;
          else if (s.type === 'path') s.fill = fill;
        } else {
          if (s.type === 'stroke' && stroke) s.color = stroke;
          else if (s.type === 'path') {
            if (!stroke) s.stroke = null;
            else if (s.stroke) s.stroke.color = stroke;
            else s.stroke = { color: stroke, width: 2, join: 'round', cap: 'round' };
          }
        }
      }
    },
    { coalesce: `recolour-${which}` },
  );
}

/** Sets the colour of the box in front (and turns "none" off for it). */
export function setActiveColor(c: Color): void {
  const ui = store().get().ui;
  if (paintWellsOn()) {
    if (ui.color !== c || !ui.strokeOn) store().setUi({ color: c, strokeOn: true });
    return;
  }
  // Picked shapes that hold a plain colour on this side come first: they change, and the box follows the edit.
  const v = paintView(ui.activeWell);
  if (v.from === 'colour' || v.from === 'colours') {
    writeColour(ui.activeWell, c);
    return;
  }
  // Picked shapes with nothing on this side: the colour gives them something there, even when it is the box's own.
  if (v.from === 'none') {
    giveBare(ui.activeWell, c);
    return;
  }
  if (ui.activeWell === 'fill') {
    if (ui.fillColor === c) return;
    store().setUi({ fillColor: c });
  } else {
    if (ui.color === c && ui.strokeOn) return;
    store().setUi({ color: c, strokeOn: true });
  }
  applyToSelection(ui.activeWell);
}

export function setActiveWell(w: 'fill' | 'stroke'): void {
  store().setUi({ activeWell: w });
}

/** X: bring the other box to the front. */
export function toggleWell(): void {
  if (paintWellsOn()) {
    swapPaintBack();
    return;
  }
  setActiveWell(store().get().ui.activeWell === 'fill' ? 'stroke' : 'fill');
}

/** Shift+X: swap the fill and stroke colours, gradients included. */
export function swapColors(): void {
  if (paintWellsOn()) {
    swapPaintBack();
    return;
  }
  const ui = store().get().ui;
  const fill = ui.strokeOn ? ui.color : null;
  const stroke = ui.fillColor;
  const g = getGradientWells();
  const hadGradient = !!(g.fill || g.stroke);
  swapGradientWells();
  store().setUi({ fillColor: fill, color: stroke ?? ui.color, strokeOn: stroke !== null });
  applyToSelection('fill');
  applyToSelection('stroke');
  if (hadGradient) {
    applyGradientToSelection('fill');
    applyGradientToSelection('stroke');
  }
}

/** Paint and Back trade places (X in the Pixel workspace). With no Back colour there is nothing to swap with. */
export function swapPaintBack(): boolean {
  const ui = store().get().ui;
  if (!ui.fillColor) return false;
  store().setUi({ color: ui.fillColor, fillColor: ui.color, strokeOn: true });
  return true;
}

/** Shift+D: the theme's fill colour and a black stroke. */
export function resetColors(): void {
  store().setUi({ fillColor: themeFill(), color: DEFAULT_STROKE, strokeOn: true });
  applyToSelection('fill');
  applyToSelection('stroke');
}

/** /: set the box in front to none. */
export function setActiveNone(): void {
  const ui = store().get().ui;
  if (ui.activeWell === 'fill') store().setUi({ fillColor: null });
  else store().setUi({ strokeOn: false });
  applyToSelection(ui.activeWell);
}

registerCommands([
  {
    id: 'colors.angular',
    label: 'Make the box in front an angular gradient',
    category: 'Colours',
    description: 'Colours sweep once round the middle like a colour wheel or a pie. Good for metal, for a pie chart shape and for a spinning shine. The picked shapes (or the box in front, with nothing picked) change to it.',
    help: 'gradient-angular',
    keywords: ['angular', 'conic', 'sweep', 'pie', 'wheel', 'metal', 'chrome', 'shine', 'spin', 'gradient', 'colours'],
    enabled: (s) => paintView(s.ui.activeWell).from !== 'none',
    reason: () => 'Pick a shape that has a fill or an outline first, or click a colour so there is something to blend.',
    run: () => {
      setPaintKind(store().get().ui.activeWell, 'angular');
      endGradientGesture();
    },
  },
  {
    id: 'colors.diamond',
    label: 'Make the box in front a diamond gradient',
    category: 'Colours',
    description: 'Colours step out from the middle in a square turned on its corner. Good for a sheen on a flat panel, a soft box of light and a jewel facet. The picked shapes (or the box in front, with nothing picked) change to it.',
    help: 'gradient-diamond',
    keywords: ['diamond', 'square', 'rhombus', 'sheen', 'box of light', 'glow', 'glint', 'gradient', 'colours'],
    enabled: (s) => paintView(s.ui.activeWell).from !== 'none',
    reason: () => 'Pick a shape that has a fill or an outline first, or click a colour so there is something to blend.',
    run: () => {
      setPaintKind(store().get().ui.activeWell, 'diamond');
      endGradientGesture();
    },
  },
  {
    id: 'colors.matchGradients',
    label: 'Make picked gradients match the first',
    category: 'Colours',
    description: 'Give every picked shape the colours and direction of the first picked shape that has a gradient.',
    help: 'tool-gradient',
    keywords: ['gradient', 'match', 'same', 'different', 'differ', 'copy', 'colours'],
    enabled: (s) => s.ui.selection.length > 1 && paintView(s.ui.activeWell).from === 'differ',
    reason: () => 'Pick shapes with different gradients first.',
    run: () => {
      matchSelectedGradients(store().get().ui.activeWell);
      endGradientGesture();
    },
  },
  {
    id: 'colors.matchColours',
    label: 'Make picked colours match the first',
    category: 'Colours',
    description: 'Give every picked shape the fill or outline colour of the first picked shape, for the box in front.',
    help: 'fill-and-stroke',
    keywords: ['colour', 'color', 'match', 'same', 'different', 'differ', 'copy', 'fill', 'stroke'],
    enabled: (s) => s.ui.selection.length > 1 && paintView(s.ui.activeWell).from === 'colours',
    reason: () => 'Pick shapes with different colours first.',
    run: () => {
      matchSelectedColours(store().get().ui.activeWell);
      endGradientGesture();
    },
  },
  {
    id: 'colors.toggleWell',
    label: 'Switch between fill and stroke colour',
    category: 'Colours',
    keys: ['X'],
    description: 'Bring the other colour box to the front, so the picker and swatches change it.',
    help: 'fill-and-stroke',
    keywords: ['fill', 'stroke', 'outline', 'colour', 'color', 'well'],
    run: toggleWell,
  },
  {
    id: 'colors.swap',
    label: 'Swap fill and stroke colours',
    category: 'Colours',
    keys: ['Shift+X'],
    description: 'The fill colour becomes the stroke colour, and the other way round.',
    help: 'fill-and-stroke',
    keywords: ['swap', 'exchange', 'fill', 'stroke'],
    run: swapColors,
  },
  {
    id: 'colors.reset',
    label: 'Default colours (theme fill, black stroke)',
    category: 'Colours',
    keys: ['Shift+D'],
    description: "Go back to the theme's fill colour and a black stroke.",
    help: 'fill-and-stroke',
    keywords: ['default', 'reset', 'black', 'white', 'yellow', 'theme'],
    run: resetColors,
  },
  {
    id: 'colors.none',
    label: 'No colour (none) for the box in front',
    category: 'Colours',
    keys: ['/'],
    description: 'Shapes get no fill, or no outline, depending on which box is in front.',
    help: 'fill-and-stroke',
    keywords: ['none', 'transparent', 'no fill', 'no stroke', 'no outline'],
    run: setActiveNone,
  },
]);

registerHelp({
  id: 'fill-and-stroke',
  order: 4,
  title: 'Fill and stroke colours',
  section: 'Drawing',
  media: 'fill-and-stroke-boxes.png',
  summary: 'Two colour boxes: the fill for insides and the paint bucket, the stroke for lines and outlines.',
  keywords: ['fill', 'stroke', 'outline', 'colour', 'color', 'none', 'swap', 'default'],
});
