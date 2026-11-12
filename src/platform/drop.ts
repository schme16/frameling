// Dropping a file on the browser page. The desktop app never navigates away from itself, but a browser tab would
// open or download whatever is dropped on it, and lose the drawing in the tab. So the page takes every file drop:
// a .frameling or .flplay drawing opens, pictures and Aseprite files go to their own handlers (src/pixel/import,
// src/aseprite), and anything else gets a polite word instead of a page change.
import { notify } from '../io/notify';
import { webApi } from './index';

const DRAWING = /\.(frameling|flplay)$/i;
const OTHER = /\.(png|apng|gif|webp|jpe?g|bmp|aseprite|ase|json)$/i;

type WithHandle = DataTransferItem & { getAsFileSystemHandle?: () => Promise<{ kind: string; name: string } | null> };

/** Which of the dropped files are drawings Frameling opens (by name), and whether there were files at all. */
export function sortDropped(names: string[]): { drawings: string[]; others: string[] } {
  return { drawings: names.filter((n) => DRAWING.test(n)), others: names.filter((n) => !DRAWING.test(n) && !OTHER.test(n)) };
}

export function installFileDrop(target: Window = window): () => void {
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  const over = (e: DragEvent) => {
    // Another handler (pictures, Aseprite) already said it takes this one.
    if (e.defaultPrevented || !hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const drop = (e: DragEvent) => {
    if (e.defaultPrevented || !hasFiles(e)) return;
    // Never let the browser open the file in this tab.
    e.preventDefault();
    const api = webApi();
    const items = [...(e.dataTransfer?.items ?? [])] as WithHandle[];
    const files = [...(e.dataTransfer?.files ?? [])];
    const { drawings, others } = sortDropped(files.map((f) => f.name));
    if (!api || !drawings.length) {
      if (others.length) notify('Frameling opens its own drawings (.frameling), pictures and Aseprite files. Drop one of those, or use File > Open.', 'info', undefined, 6000);
      return;
    }
    const first = files.findIndex((f) => DRAWING.test(f.name));
    void (async () => {
      // A handle keeps Save writing back into the same file (Chrome and Edge); without one the page keeps a copy.
      try {
        const h = await items.filter((i) => i.kind === 'file')[first]?.getAsFileSystemHandle?.();
        if (h?.kind === 'file') return void (await api.receiveFiles([h as never]));
      } catch {
        // No handle: the copy below.
      }
      await api.receiveFile(files[first]);
    })();
  };
  target.addEventListener('dragover', over);
  target.addEventListener('drop', drop);
  return () => {
    target.removeEventListener('dragover', over);
    target.removeEventListener('drop', drop);
  };
}
