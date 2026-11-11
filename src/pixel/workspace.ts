// The Pixel workspace's own behaviour: offering to switch to it when pixel art opens (asked once, then remembered),
// and starting Export on a sprite sheet at art size while you're in it.
import { registerChoice, withChoice } from '../core/choices';
import type { Doc, Id } from '../core/format';
import type { ExportSettings } from '../export/types';
import { applyWorkspace, inPixelWorkspace } from '../ui/dock';

export const PIXEL_DOC_CHOICE = 'workspace.pixelDocs';

registerChoice({
  id: PIXEL_DOC_CHOICE,
  title: 'Opening pixel art',
  question: 'This is pixel art. Switch to the Pixel workspace? It has the pixel tools, a big palette and a real-size preview.',
  category: 'Workspace',
  help: 'pixel-workspace',
  default: 'switch',
  options: [
    { value: 'switch', label: 'Switch to Pixel', detail: 'Pixel tools only, the palette up front, and the Preview panel playing your sprite.' },
    { value: 'stay', label: 'Keep my layout', detail: 'Stay as you are. View > Workspaces switches any time.' },
  ],
});

/** Pixel art: at least one pixel layer and no vector drawing layers (reference layers and rigs don't count). */
export function isPixelDoc(doc: Doc): boolean {
  let pixel = 0;
  for (const l of doc.layers) {
    if (l.kind === 'pixel') pixel++;
    else if (l.kind === 'vector' && !l.reference && !l.rig) return false;
  }
  return pixel > 0;
}

interface DocSource {
  get(): { doc: Doc };
  subscribe(fn: () => void): () => void;
}

/** Watches for documents opening, and offers the Pixel workspace when one is pixel art and you're not in it. */
export function watchPixelDocs(s: DocSource, switchTo: () => void = () => void applyWorkspace('pixel')): () => void {
  // The document that's there at start-up isn't "opening".
  let last: Id = s.get().doc.id;
  return s.subscribe(() => {
    const { doc } = s.get();
    if (doc.id === last) return;
    last = doc.id;
    if (!isPixelDoc(doc) || inPixelWorkspace()) return;
    withChoice(PIXEL_DOC_CHOICE, (v) => {
      // Still the same document, and still not in a pixel workspace, by the time they answer.
      if (v === 'switch' && s.get().doc.id === doc.id && !inPixelWorkspace()) switchTo();
    });
  });
}

const sheetStarted = new Set<Id>();

/**
 * In the Pixel workspace, Export starts on a sprite sheet at art size (one art pixel to one pixel) the first time it
 * opens on a document. After that, your own last choice wins. Returns `base` untouched otherwise.
 */
export function pixelExportStart(docId: Id, base: ExportSettings, art: number | null, pixelWorkspace = inPixelWorkspace()): ExportSettings {
  if (!pixelWorkspace || art === null || sheetStarted.has(docId)) return base;
  sheetStarted.add(docId);
  return { ...base, format: 'sheet', scale: art, range: 'all', clipId: null };
}
