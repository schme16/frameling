import { registerCommands } from '../core/registry';
import { lazyModule } from '../core/lazy';

// The reader and the mapping are a download of their own, fetched the first time an Aseprite file is brought in.
export const run = lazyModule(() => import('./run'));

registerCommands([
  {
    id: 'file.openAseprite',
    label: 'Open Aseprite file...',
    category: 'File',
    description: 'Open a pixel art animation made in Aseprite as a new drawing.',
    help: 'aseprite-import',
    keywords: ['aseprite', 'ase', 'sprite', 'pixel art', 'import', 'open'],
    run: () => run().then((m) => m.pickAndOpen()),
  },
  {
    id: 'file.importAseprite',
    label: 'Aseprite file...',
    category: 'File',
    description: 'Add an Aseprite animation to this drawing: its layers go on top.',
    help: 'aseprite-import',
    keywords: ['aseprite', 'ase', 'sprite', 'pixel art', 'import', 'add', 'bring in'],
    run: () => run().then((m) => m.pickAndAdd()),
  },
  {
    id: 'palette.fromAseprite',
    label: 'Use palette from an Aseprite file...',
    category: 'Pixel',
    description: 'Take just the colours of an Aseprite file as this drawing\'s palette.',
    help: 'aseprite-import',
    keywords: ['aseprite', 'palette', 'colours', 'colors', 'swatches', 'import'],
    run: () => run().then((m) => m.pickForPalette()),
  },
]);
