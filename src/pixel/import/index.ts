// Bringing in pictures: PNG, GIF and sprite sheets, as a new drawing or into the open one, and colours for the palette.
// The reading, cutting and building are plain functions (picture.ts, gif.ts, slicing.ts, sheetJson.ts, build.ts); this
// registers the commands, the file opener, the drop and the help.
import { registerCommands } from '../../core/registry';
import './help';
import { registerOpener } from '../../io/document';
import { lazyModule } from '../../core/lazy';

// The reading, slicing and dialog are a big download: it comes the first time a picture is brought in.
const run = lazyModule(() => import('./run'));
// What the opener and the drop listeners need to know before that, kept here so they don't pull the rest in.
const PICTURE_EXT = /\.(png|apng|gif|webp|jpe?g|bmp)$/i;
const IMAGE_TYPE = /^image\/(png|apng|gif|webp|jpeg|bmp)$/;

registerCommands([
  {
    id: 'file.openPicture',
    label: 'Open a picture or sprite sheet...',
    category: 'File',
    description: 'Bring in a PNG, GIF, WebP or sprite sheet as a new pixel drawing: cut it into frames and choose how it is built.',
    help: 'pixel-import',
    keywords: ['png', 'gif', 'image', 'picture', 'sprite sheet', 'spritesheet', 'atlas', 'slice', 'grid', 'import', 'open', 'animated gif', 'apng', 'animated png', 'animated webp', 'webp', 'frames'],
    run: () => run().then((m) => m.pickAndOpenPicture()),
  },
  {
    id: 'file.importPicture',
    label: 'Picture or sprite sheet...',
    category: 'File',
    keys: ['Mod+I'],
    description: 'Add a PNG, GIF or sprite sheet to this drawing as a layer with its frames, or as boards.',
    help: 'pixel-import',
    keywords: ['png', 'gif', 'image', 'picture', 'sprite sheet', 'spritesheet', 'atlas', 'slice', 'grid', 'import', 'add', 'animated gif', 'apng', 'animated png', 'animated webp', 'webp', 'frames'],
    run: () => run().then((m) => m.pickAndAddPicture()),
  },
  {
    id: 'palette.fromPicture',
    label: 'Take colours from a picture...',
    category: 'Pixel',
    description: 'Take the colours of a picture for the palette: you set the most to take, and big pictures never hold Frameling up.',
    help: 'palette-picture',
    keywords: ['palette', 'colours', 'colors', 'extract', 'picture', 'png', 'gif', 'image', 'import', 'swatches'],
    run: () => run().then((m) => m.pickPictureForPalette()),
  },
]);

/** File > Open and Open recent hand pictures over by path. */
registerOpener((p) => PICTURE_EXT.test(p), (bytes, path) => run().then((m) => m.openPictureBytes(bytes, path)));

/** Dropping a picture on the window opens the dialog (src/pixel/import/run.tsx reads the sheet's data file if one comes along). */
function installPictureDrop(target: Window = window): void {
  target.addEventListener('dragover', (e) => {
    if (e.defaultPrevented) return;
    const items = e.dataTransfer?.items;
    if (!items || ![...items].some((i) => i.kind === 'file' && IMAGE_TYPE.test(i.type))) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  target.addEventListener('drop', (e) => {
    if (e.defaultPrevented) return;
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.some((f) => PICTURE_EXT.test(f.name))) return;
    e.preventDefault();
    void run().then((m) => m.dropPictures(files));
  });
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') setTimeout(() => installPictureDrop(), 0);

export const openPictureBytes = (bytes: Uint8Array, path: string): Promise<boolean> => run().then((m) => m.openPictureBytes(bytes, path));
export const addPictureBytes = (bytes: Uint8Array, path: string): Promise<boolean> => run().then((m) => m.addPictureBytes(bytes, path));

// With ?debug in the page address, opening a picture from bytes is exposed for the help picture capture and the checks.
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  const w = window as unknown as { __framelingPicture: unknown };
  w.__framelingPicture = {
    open: (bytes: number[], name: string) => openPictureBytes(Uint8Array.from(bytes), name),
    add: (bytes: number[], name: string) => addPictureBytes(Uint8Array.from(bytes), name),
    palette: (bytes: number[] | Uint8Array, name: string) => run().then((m) => m.paletteFromPictureBytes(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes), name)),
  };
}
