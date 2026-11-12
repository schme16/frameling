// Aseprite files (.aseprite and .ase): open as a drawing, add to one, or take just the palette. The reader and the
// mapping are plain functions (parse.ts, convert.ts); this registers the commands, help and the file opener.
import './commands';
import './help';
import { addAsepriteBytes, installAsepriteDrop, openAsepriteBytes, registerAsepriteOpener } from './run';

registerAsepriteOpener();
if (typeof window !== 'undefined' && typeof document !== 'undefined') setTimeout(() => installAsepriteDrop(), 0);

export { openAsepriteBytes, addAsepriteBytes };

// With ?debug in the page address, opening a file from bytes is exposed for the help picture capture and the checks.
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  const w = window as unknown as { __framelingAseprite: unknown };
  w.__framelingAseprite = {
    open: (bytes: number[], name: string) => openAsepriteBytes(Uint8Array.from(bytes), name),
    add: (bytes: number[], name: string) => addAsepriteBytes(Uint8Array.from(bytes), name),
  };
}
