// Turn into pixels (rasterize) and Turn into shapes (trace): the two halves of going between vector and pixel art.
// The tracing is the tracer the app already has (src/geometry/trace.ts); this folder is the colour separation, the
// stacking, the dialogs and the commands. Checked end to end by scripts/e2e/convert.cjs.
import { registerCommands, registerHelpTopics, registerPanel } from '../core/registry';
import { lazyPanel } from '../core/lazy';
import { registerPanelInfo } from '../ui/panelInfo';
import './choices';
import { openConvert } from './open';
import { sourceNow, isSource } from './ops';
import { wayFor } from './relevant';

registerPanel({
  id: 'convert',
  title: 'Turn into',
  icon: 'convert',
  component: lazyPanel(() => import('./ConvertPanel').then((m) => m.ConvertPanel)),
  zone: 'right',
  order: 37,
  help: 'convert-to-pixels',
});

registerPanelInfo('convert', {
  short: 'Turn into',
  blurb: 'Turn shapes into pixels, or pixels into shapes, with a preview and one undo.',
  group: 'properties',
  section: true,
  selection: true,
  relevant: (s) => wayFor(s) !== null,
  idle: 'Pick a vector or pixel layer with something on it',
  keywords: ['rasterize', 'rasterise', 'vectorize', 'vectorise', 'trace', 'pixels', 'shapes', 'convert', 'image trace', 'live trace'],
});

registerCommands([
  {
    id: 'convert.toPixels',
    label: 'Turn into pixels (rasterize)...',
    category: 'Draw',
    description: 'Turn the shapes you picked, or the drawing on this vector layer, into pixels. You see it first, choose the size, and one undo takes it back.',
    help: 'convert-to-pixels',
    keywords: ['rasterize', 'rasterise', 'flatten to pixels', 'bitmap', 'pixelate', 'vector to pixel', 'make pixel art', 'convert to pixels'],
    enabled: (st) => isSource(sourceNow('pixels', st)),
    run: () => openConvert('pixels'),
  },
  {
    id: 'convert.toShapes',
    label: 'Turn into shapes (trace)...',
    category: 'Draw',
    description: 'Turn the pixels you selected, or the drawing on this pixel layer, into flat-colour shapes. You see it first, and one undo takes it back.',
    help: 'convert-to-shapes',
    keywords: ['vectorize', 'vectorise', 'trace', 'image trace', 'live trace', 'autotrace', 'pixel to vector', 'convert to shapes', 'outline pixels'],
    enabled: (st) => isSource(sourceNow('shapes', st)),
    run: () => openConvert('shapes'),
  },
]);

registerHelpTopics([
  {
    id: 'convert-to-pixels',
    order: 6.2,
    media: 'convert-to-pixels.png',
    title: 'Turn shapes into pixels',
    section: 'Drawing',
    summary: 'Turn a drawing of shapes into pixels you can paint on, at the pixel size you choose. You see it first, and one undo takes it back.',
    keywords: ['rasterize', 'rasterise', 'pixels', 'bitmap', 'vector to pixel', 'pixelate', 'turn into pixels', 'pixel art from vector'],
  },
  {
    id: 'convert-to-shapes',
    order: 6.3,
    media: 'convert-to-shapes.png',
    title: 'Turn pixels into shapes',
    section: 'Drawing',
    summary: 'Turn pixel art or a flat-colour picture into shapes you can reshape and resize. Works best on flat colours; a photo makes a mess.',
    keywords: ['vectorize', 'vectorise', 'pixel to vector', 'turn into shapes', 'outline', 'photo'],
  },
]);
