// Dropping one JPG or PNG on the window. It could be a reference to trace over or pixel art to work with, so it is asked
// once and remembered (choice `reference.drop`). Several pictures, GIFs and sprite sheets are left to the pixel picture
// window. This listens first (the capture phase) so it can answer before that one does.
import { choose } from '../core/choices';
import { PICTURE_NAME } from './model';
import { addReferencePicture } from './ops';
import type { DropChoice } from './choices';

const TYPES = /^image\/(jpeg|png)$/i;

/** Whether a drop is one JPG or PNG and nothing else. */
export function isSinglePicture(files: { name: string; type?: string }[]): boolean {
  return files.length === 1 && (PICTURE_NAME.test(files[0].name) || TYPES.test(files[0].type ?? ''));
}

function install(target: Window): void {
  target.addEventListener(
    'dragover',
    (e) => {
      if (e.defaultPrevented) return;
      const items = [...(e.dataTransfer?.items ?? [])];
      if (items.length !== 1 || items[0].kind !== 'file' || !TYPES.test(items[0].type)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    },
    true,
  );
  target.addEventListener(
    'drop',
    (e) => {
      if (e.defaultPrevented) return;
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!isSinglePicture(files)) return;
      e.preventDefault();
      const file = files[0];
      void choose<DropChoice>('reference.drop').then(async (way) => {
        if (way === 'pixel') return void (await import('../pixel/import/run')).dropPictures([file]);
        await addReferencePicture(new Uint8Array(await file.arrayBuffer()), file.name);
      });
    },
    true,
  );
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') setTimeout(() => install(window), 0);
