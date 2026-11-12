// Bringing in pictures: PNG, GIF and sprite sheets, as a new drawing or into the open one, and colours for the palette.
// The reading, cutting and building are plain functions (picture.ts, gif.ts, slicing.ts, sheetJson.ts, build.ts); this
// registers the commands, the file opener, the drop and the help.
import { registerCommands } from '../../core/registry';
import './help';
import { addPictureBytes, installPictureDrop, openPictureBytes, pickAndAddPicture, pickAndOpenPicture, pickPictureForPalette, registerPictureOpener } from './run';

registerCommands([
  {
    id: 'file.openPicture',
    label: 'Open a picture or sprite sheet...',
    category: 'File',
    description: 'Bring in a PNG, GIF or sprite sheet as a new pixel drawing: cut it into frames and choose how it is built.',
    help: 'pixel-import',
    keywords: ['png', 'gif', 'image', 'picture', 'sprite sheet', 'spritesheet', 'atlas', 'slice', 'grid', 'import', 'open', 'animated gif', 'frames'],
    run: () => pickAndOpenPicture(),
  },
  {
    id: 'file.importPicture',
    label: 'Picture or sprite sheet...',
    category: 'File',
    keys: ['Mod+I'],
    description: 'Add a PNG, GIF or sprite sheet to this drawing as a layer with its frames, or as boards.',
    help: 'pixel-import',
    keywords: ['png', 'gif', 'image', 'picture', 'sprite sheet', 'spritesheet', 'atlas', 'slice', 'grid', 'import', 'add', 'animated gif', 'frames'],
    run: () => pickAndAddPicture(),
  },
  {
    id: 'palette.fromPicture',
    label: 'Take colours from a picture...',
    category: 'Pixel',
    description: 'Add the colours of a PNG, GIF or sprite sheet to the palette, or use them in its place.',
    help: 'pixel-import',
    keywords: ['palette', 'colours', 'colors', 'extract', 'picture', 'png', 'gif', 'image', 'import', 'swatches'],
    run: () => pickPictureForPalette(),
  },
]);

registerPictureOpener();
if (typeof window !== 'undefined' && typeof document !== 'undefined') setTimeout(() => installPictureDrop(), 0);

export { addPictureBytes, openPictureBytes };

// With ?debug in the page address, opening a picture from bytes is exposed for the help picture capture and the checks.
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  const w = window as unknown as { __framelingPicture: unknown };
  w.__framelingPicture = {
    open: (bytes: number[], name: string) => openPictureBytes(Uint8Array.from(bytes), name),
    add: (bytes: number[], name: string) => addPictureBytes(Uint8Array.from(bytes), name),
  };
}
