// Registers the pixel art area: the Shade and Dither tools, the Palette panel, the pixel commands and their help.
// Loaded after the other tools (from src/tools/index.ts) so it can add the mirror lines and options to them.
import { lazyPanel } from '../core/lazy';
import { getTool, registerCommand, registerPanel } from '../core/registry';
import './commands';
import './habits';
import './help';
import './help-ways';
import { drawMirrorLines } from './tools';
import './tools';
import { activePixelLayer } from './tools';
import { withMirror } from './ToolOptions';
import { exportPalette, importPalette, paletteFromDrawing } from './palette-files';
import { store } from '../core/store';
import { dock, inPixelWorkspace, showPanel } from '../ui/dock';
import { paintWellsOn, setPaintWells, setShapeFilledSource } from '../tools/pixelWells';
import { isPixelDoc } from './way';
import { getPixelSettings } from './settings';
import { previewSettings, setPreview } from './preview';
import { watchOnePicture, watchPixelDocs, watchPixelTool } from './workspace';
import './workspace-help';
import './wayCommands';
import './import';
import './slices';
import { installWayWatchers } from './wayOps';
import { askAboutKeys } from './keysAsk';

registerPanel({ id: 'palette', title: 'Palette', icon: 'palette', component: lazyPanel(() => import('./PalettePanel').then((m) => m.PalettePanel)), zone: 'right', order: 25, help: 'palette' });
registerPanel({ id: 'preview', title: 'Preview', icon: 'film', component: lazyPanel(() => import('./PreviewPanel').then((m) => m.PreviewPanel)), zone: 'right', order: 80, help: 'pixel-preview' });

// Paint and Back: in the Pixel workspace the two colour wells are Paint and Back, and every pixel tool paints with Paint.
setShapeFilledSource(() => getPixelSettings().shapeFilled);
const syncWells = () => {
  // Paint and Back belong to pixel art: a drawing opened in the Pixel workspace keeps Fill and Stroke.
  setPaintWells(inPixelWorkspace() && isPixelDoc(store().get().doc));
  const ui = store().get().ui;
  if (paintWellsOn() && (!ui.strokeOn || ui.activeWell !== 'stroke')) store().setUi({ strokeOn: true, activeWell: 'stroke' });
};
dock.subscribe(syncWells);
store().subscribe(syncWells);
syncWells();

// Offer the Pixel workspace when pixel art opens (asked once).
watchPixelDocs(store(), undefined, askAboutKeys);
// Entering the Pixel workspace with a pixel sprite starts on the Pencil, so a tool is lit.
watchPixelTool(store());
installWayWatchers(store());
// A one-picture file has nothing to preview: the Preview stays away until it moves.
watchOnePicture(store());

registerCommand({
  id: 'pixel.previewPlay',
  label: 'Play or pause the Preview',
  category: 'Pixel',
  description: 'Start or stop the animation in the Preview panel, which plays it at real size while you draw.',
  help: 'pixel-preview',
  keywords: ['preview', 'real size', '1x', 'actual size', 'play', 'loop', 'sprite preview'],
  checked: () => previewSettings.get().playing,
  run: () => {
    showPanel('preview');
    setPreview({ playing: !previewSettings.get().playing });
  },
});
registerCommand({
  id: 'pixel.previewSize',
  label: 'Preview size (1x, 2x, 3x, fit)',
  category: 'Pixel',
  description: 'Change how big the Preview panel shows the animation. 1x is real size.',
  help: 'pixel-preview',
  keywords: ['preview', 'zoom', 'real size', 'actual size', 'scale'],
  run: () => {
    showPanel('preview');
    const order = [1, 2, 3, 'fit'] as const;
    const at = order.indexOf(previewSettings.get().zoom);
    setPreview({ zoom: order[(at + 1) % order.length] });
  },
});

registerCommand({
  id: 'pixel.rotate',
  label: 'Turn drawing by any angle...',
  category: 'Pixel',
  description: 'Turn the pixels on this frame by any angle, crisply, without blurring the colours.',
  help: 'pixel-flip-rotate',
  keywords: ['rotate', 'turn', 'angle', 'rotsprite', 'tilt'],
  enabled: () => !!activePixelLayer(),
  // The dialog loads on first use.
  run: () => void import('./RotateDialog').then((m) => m.openRotateDialog()),
});
registerCommand({
  id: 'palette.import',
  label: 'Load a palette...',
  category: 'Pixel',
  description: 'Load a .gpl, .hex, .pal or Adobe swatch (.ase) palette file, or take the colours from a picture.',
  help: 'palette',
  keywords: ['palette', 'import', 'gpl', 'hex', 'pal', 'jasc', 'gimp', 'lospec', 'colours from image', 'ase', 'adobe', 'swatches', 'illustrator', 'photoshop'],
  run: () => void importPalette(),
});
registerCommand({
  id: 'palette.exportGpl',
  label: 'Save the palette as a GIMP palette (.gpl)',
  category: 'Pixel',
  help: 'palette',
  keywords: ['palette', 'export', 'gpl', 'gimp'],
  run: () => void exportPalette('gpl'),
});
registerCommand({
  id: 'palette.exportHex',
  label: 'Save the palette as a hex list (.hex)',
  category: 'Pixel',
  help: 'palette',
  keywords: ['palette', 'export', 'hex'],
  run: () => void exportPalette('hex'),
});
registerCommand({
  id: 'palette.exportPal',
  label: 'Save the palette as a JASC palette (.pal)',
  category: 'Pixel',
  help: 'palette',
  keywords: ['palette', 'export', 'pal', 'jasc', 'paint shop'],
  run: () => void exportPalette('pal'),
});
registerCommand({
  id: 'palette.fromDrawing',
  label: 'Make a palette from this drawing',
  category: 'Pixel',
  description: 'Every colour on this frame becomes the palette.',
  help: 'palette',
  keywords: ['palette', 'extract', 'colours', 'from drawing'],
  enabled: () => !!activePixelLayer(),
  run: paletteFromDrawing,
});

// The brush and eraser were written before mirror drawing: give them the mirror lines on the canvas,
// and the mirror controls in their options, when they're used on a pixel layer.
for (const id of ['brush', 'eraser']) {
  const t = getTool(id);
  if (!t) continue;
  const own = t.overlay;
  t.overlay = (g, ctx) => {
    own?.(g, ctx);
    drawMirrorLines(g, ctx);
  };
  t.options = withMirror(t.options);
}
