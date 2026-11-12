// Slices: named rectangles on a pixel layer (with a 9-patch middle and a pivot), the Slice tool, the Slices panel and
// the view option. The maths is in model.ts; the engine files that use them are made by the sprite sheet export.
import { lazyPanel } from '../../core/lazy';
import { registerCommands, registerPanel } from '../../core/registry';
import { getPixelSettings, setPixelSettings } from '../settings';
import './help';
import './tool';
import { deleteSlice, pickedSlice, sliceExists } from './state';

registerPanel({ id: 'slices', title: 'Slices', icon: 'slice', component: lazyPanel(() => import('./SlicesPanel').then((m) => m.SlicesPanel)), zone: 'right', order: 82, help: 'pixel-slices' });

registerCommands([
  {
    id: 'pixel.showSlices',
    label: 'Show slices on the canvas',
    category: 'Pixel',
    description: 'Draw the named rectangles (slices) of your pixel layers over the picture. They never show in exports.',
    help: 'pixel-slices',
    keywords: ['slices', 'slice', '9-patch', 'nine patch', 'pivot', 'hitbox', 'show', 'hide', 'overlay'],
    checked: () => getPixelSettings().showSlices,
    run: () => setPixelSettings({ showSlices: !getPixelSettings().showSlices }),
  },
  {
    id: 'pixel.deleteSlice',
    label: 'Delete the picked slice',
    category: 'Pixel',
    description: 'Remove the slice picked in the Slices panel or with the Slice tool.',
    help: 'pixel-slices',
    keywords: ['slices', 'slice', 'delete', 'remove'],
    enabled: () => !!pickedSlice() && sliceExists(pickedSlice()!),
    run: () => {
      const id = pickedSlice();
      if (id) deleteSlice(id);
    },
  },
]);

