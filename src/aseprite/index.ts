// Aseprite files (.aseprite and .ase): open as a drawing, add to one, or take just the palette. The reader and the
// mapping are plain functions (parse.ts, convert.ts); this registers the commands, help and the file opener.
import './commands';
import './help';
import { registerOpener } from '../io/document';
import { ASE_EXT } from './drop';
import { run } from './commands';

export const openAsepriteBytes = (bytes: Uint8Array, path: string): Promise<boolean> => run().then((m) => m.openAsepriteBytes(bytes, path));
export const addAsepriteBytes = (bytes: Uint8Array, path: string): Promise<boolean> => run().then((m) => m.addAsepriteBytes(bytes, path));

// Double-clicked files, File > Open and Open recent hand Aseprite files over by path.
registerOpener((p) => ASE_EXT.test(p), openAsepriteBytes);

/** Dropping Aseprite files on the window: open or add, as remembered (src/aseprite/run.ts does the asking). */
function installAsepriteDrop(target: Window = window): void {
  target.addEventListener('dragover', (e) => {
    if (e.defaultPrevented) return;
    const items = e.dataTransfer?.items;
    if (!items || ![...items].some((i) => i.kind === 'file' && (i.type === '' || i.type === 'application/x-aseprite'))) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  target.addEventListener('drop', (e) => {
    if (e.defaultPrevented) return;
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => ASE_EXT.test(f.name));
    if (!files.length) return;
    e.preventDefault();
    void run().then((m) => m.dropAseprite(files));
  });
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') setTimeout(() => installAsepriteDrop(), 0);

// With ?debug in the page address, opening a file from bytes is exposed for the help picture capture and the checks.
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  const w = window as unknown as { __framelingAseprite: unknown };
  w.__framelingAseprite = {
    open: (bytes: number[], name: string) => openAsepriteBytes(Uint8Array.from(bytes), name),
    add: (bytes: number[], name: string) => addAsepriteBytes(Uint8Array.from(bytes), name),
  };
}
