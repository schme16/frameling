// Habits from other pixel tools, as commands: a bigger or smaller brush, the next or previous palette colour, and
// zoom levels at a key. The keys come with the "Aseprite keys" set (src/ui/keymapSets.ts); the commands are always in
// the command palette. The maths is plain functions, so it can be tested.
import { paletteIndexOf, sizeSettingFor } from './bar';
import { docPalette } from './palette';
import { getPixelSettings, setPixelSettings } from './settings';
import { activePixelLayer } from './tools';
import { ART_ZOOM_PRESETS, zoomForArtPercent } from './units';
import { zoomTo } from '../canvas/controller';
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { getToolSettings, setToolSettings } from '../tools/settings';
import { pickTool } from '../tools/pick';
import { noteColorUsed } from '../tools/recent';
import { activeColor, setActiveColor, swapPaintBack } from '../tools/wells';
import { paintWellsOn } from '../tools/pixelWells';

export const MAX_BRUSH = 24;
export const MAX_DITHER = 32;

export interface Sizes {
  pixelBrushSize: number;
  eraserPixelSize: number;
  ditherSize: number;
  spraySize: number;
}

/** What a size key does for this tool: the new size, and the tool to switch to when it isn't the one you are on. Null = nothing to change. */
export interface SizeStep {
  tool?: string;
  set: Partial<Sizes>;
}

/** Bigger (dir 1) or smaller (-1) for the tool in hand. Tools with no size do nothing. */
export function stepSize(tool: string, sizes: Sizes, dir: 1 | -1): SizeStep | null {
  const which = sizeSettingFor(tool);
  if (!which) return null;
  const key = which as keyof Sizes;
  const max = key === 'ditherSize' || key === 'spraySize' ? MAX_DITHER : MAX_BRUSH;
  const now = sizes[key];
  const next = Math.min(max, Math.max(1, now + dir));
  return next === now ? null : { set: { [key]: next } };
}

/** The palette colour one step along (wrapping round the ends), starting from the one in use or its nearest. */
export function stepPaletteColor(colors: readonly string[], index: number | null, dir: 1 | -1): number | null {
  const n = colors.length;
  if (!n) return null;
  if (index === null) return dir > 0 ? 0 : n - 1;
  return (index + dir + n) % n;
}

function resize(dir: 1 | -1): void {
  const step = stepSizeNow(dir);
  if (!step) return;
  const { ditherSize, spraySize, ...toolSizes } = step.set;
  if (Object.keys(toolSizes).length) setToolSettings(toolSizes);
  if (ditherSize !== undefined) setPixelSettings({ ditherSize });
  if (spraySize !== undefined) setPixelSettings({ spraySize });
  if (step.tool) pickTool(step.tool);
}

function stepSizeNow(dir: 1 | -1): SizeStep | null {
  const t = getToolSettings();
  return stepSize(store().get().ui.tool, { pixelBrushSize: t.pixelBrushSize, eraserPixelSize: t.eraserPixelSize, ditherSize: getPixelSettings().ditherSize, spraySize: getPixelSettings().spraySize }, dir);
}

const canResize = (dir: 1 | -1) => () => !!activePixelLayer() && !!stepSizeNow(dir);

function stepColor(dir: 1 | -1): void {
  const doc = store().get().doc;
  const p = docPalette(doc);
  const cur = activeColor();
  const at = cur ? paletteIndexOf(p, cur) : null;
  const next = stepPaletteColor(p.colors, at?.index ?? null, dir);
  if (next === null) return;
  setActiveColor(p.colors[next]);
  noteColorUsed(p.colors[next]);
}

/** The smallest art pixel size on a pixel layer: what a zoom percentage is measured in. */
function artPixelNow(): number {
  let px = 0;
  for (const l of store().get().doc.layers) if (l.kind === 'pixel') px = px ? Math.min(px, l.pixelSize) : l.pixelSize;
  return px;
}

registerCommands([
  {
    id: 'pixel.sizeUp',
    label: 'Bigger brush',
    category: 'Pixel',
    description: 'Make the pencil, eraser, dither or spray one pixel bigger. The pencil at size 1 is the plain pencil.',
    help: 'pixel-aseprite-habits',
    keywords: ['brush size', 'bigger', 'larger', 'plus', 'size up', 'thicker'],
    enabled: canResize(1),
    run: () => resize(1),
  },
  {
    id: 'pixel.sizeDown',
    label: 'Smaller brush',
    category: 'Pixel',
    description: 'Make the pencil, eraser, dither or spray one pixel smaller.',
    help: 'pixel-aseprite-habits',
    keywords: ['brush size', 'smaller', 'minus', 'size down', 'thinner'],
    enabled: canResize(-1),
    run: () => resize(-1),
  },
  {
    id: 'pixel.nextColor',
    label: 'Next palette colour',
    category: 'Pixel',
    description: 'Paint with the next colour in the palette. After the last one it starts again at the first.',
    help: 'pixel-aseprite-habits',
    keywords: ['palette', 'swatch', 'step colour', 'next swatch', 'cycle'],
    enabled: () => !!activePixelLayer(),
    run: () => stepColor(1),
  },
  {
    id: 'pixel.previousColor',
    label: 'Previous palette colour',
    category: 'Pixel',
    description: 'Paint with the colour before this one in the palette. Before the first it goes to the last.',
    help: 'pixel-aseprite-habits',
    keywords: ['palette', 'swatch', 'step colour', 'previous swatch', 'cycle'],
    enabled: () => !!activePixelLayer(),
    run: () => stepColor(-1),
  },
  {
    id: 'pixel.swapPaintBack',
    label: 'Swap Paint and Back colours',
    category: 'Pixel',
    description: 'Paint and Back trade places. In the Pixel workspace X does this too, and a right-click paints with Back.',
    help: 'pixel-wells',
    keywords: ['paint', 'back', 'foreground', 'background', 'swap', 'colours', 'wells', 'x'],
    enabled: () => paintWellsOn() && !!store().get().ui.fillColor,
    run: () => void swapPaintBack(),
  },
  ...ART_ZOOM_PRESETS.map((percent, i) => ({
    id: `pixel.zoom${i + 1}`,
    label: `Zoom ${percent}%`,
    category: 'Pixel',
    description: `Show each pixel of your sprite ${percent / 100} times as big on the screen.`,
    help: 'pixel-aseprite-habits',
    keywords: ['zoom', 'magnify', `${percent}%`, 'pixel zoom'],
    enabled: () => artPixelNow() > 0,
    run: () => zoomTo(zoomForArtPercent(percent, artPixelNow())),
  })),
]);
