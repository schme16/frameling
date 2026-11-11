// Registers the pixel art area: the Shade and Dither tools, the Palette panel, the pixel commands and their help.
// Loaded after the other tools (from src/tools/index.ts) so it can add the mirror lines and options to them.
import { getTool, registerCommand, registerPanel } from '../core/registry';
import './commands';
import './help';
import { drawMirrorLines } from './tools';
import './tools';
import { PalettePanel } from './PalettePanel';
import { openRotateDialog } from './RotateDialog';
import { activePixelLayer } from './tools';
import { withMirror } from './ToolOptions';
import { exportPalette, importPalette, paletteFromDrawing } from './palette-files';

registerPanel({ id: 'palette', title: 'Palette', icon: 'palette', component: PalettePanel, zone: 'right', order: 25, help: 'palette' });

registerCommand({
  id: 'pixel.rotate',
  label: 'Turn drawing by any angle...',
  category: 'Pixel',
  description: 'Turn the pixels on this frame by any angle, crisply, without blurring the colours.',
  help: 'pixel-flip-rotate',
  keywords: ['rotate', 'turn', 'angle', 'rotsprite', 'tilt'],
  enabled: () => !!activePixelLayer(),
  run: openRotateDialog,
});
registerCommand({
  id: 'palette.import',
  label: 'Load a palette...',
  category: 'Pixel',
  description: 'Load a .gpl, .hex or .pal palette file, or take the colours from a picture.',
  help: 'palette',
  keywords: ['palette', 'import', 'gpl', 'hex', 'pal', 'jasc', 'gimp', 'lospec', 'colours from image'],
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
