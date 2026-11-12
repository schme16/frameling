// The Pixel workspace's own behaviour: the workspace following the kind of drawing (asked once, then remembered),
// and starting Export on a sprite sheet at art size while you're in it.
import { migrateChoices, registerChoice, withChoice } from '../core/choices';
import type { Doc, Id } from '../core/format';
import type { ExportSettings } from '../export/types';
import { applyWorkspace, dock, hidePanel, inPixelWorkspace, PIXEL_TOOLS, showPanel } from '../ui/dock';
import { isPlaced } from '../ui/dockModel';
import { isPixelDoc } from './way';

export { isPixelDoc };

/** The one question: should the workspace follow the kind of drawing (Pixel for pixel art, Draw for drawings)? */
export const FOLLOW_CHOICE = 'workspace.follow';

registerChoice({
  id: FOLLOW_CHOICE,
  title: 'Workspace follows the drawing',
  question: 'Switch workspaces to match the kind of drawing? (Pixel for pixel art, Draw for drawings)',
  category: 'Workspace',
  help: 'pixel-workspace',
  default: 'always',
  // Closing the question without answering switches nothing.
  dismiss: 'later',
  quill: true,
  options: [
    { value: 'always', label: 'Always', detail: 'Pixel art opens in the Pixel workspace, and drawings in Draw. After this it happens by itself, no more questions.' },
    { value: 'later', label: 'Not now', detail: 'Stay as you are this time. Frameling asks again next time it matters.', once: true },
    { value: 'never', label: 'Never', detail: 'Always keep my layout. View > Workspaces switches any time.' },
  ],
});

// The two older questions (pixel art in another workspace, a drawing in Pixel) became this one. Saying "keep my layout"
// to either means never; otherwise a "switch" means always.
migrateChoices(FOLLOW_CHOICE, ['workspace.pixelDocs', 'workspace.vectorDocs'], (old) => (old.includes('stay') ? 'never' : old.includes('switch') ? 'always' : undefined));

/** The built-in Draw workspace (the Animate workspace and ones you made are left alone). */
const inDrawWorkspace = (): boolean => dock.get().workspaceId === 'draw';

// Pages a lesson makes: the workspace follows them without asking.
const madeHere = new Set<Id>();

/** Say that this page was just made for a lesson, so the matching workspace is picked without a question. Call before loading it. */
export function madeOnPurpose(doc: Doc): Doc {
  madeHere.add(doc.id);
  return doc;
}

interface DocSource {
  get(): { doc: Doc };
  subscribe(fn: () => void): () => void;
}

/**
 * Watches for documents opening, and makes the workspace follow the kind of document: pixel art opening in Draw goes
 * to Pixel, a drawing opening in Pixel goes to Draw. The first time it matters Frameling asks (Always, Not now, Never,
 * remembered); after Always it just follows. The Animate workspace and ones you made yourself are left alone. A lesson's
 * page (see madeOnPurpose) switches without asking. `then` runs for pixel art once that is settled: the "Coming from
 * Aseprite?" question.
 */
export function watchPixelDocs(
  s: DocSource,
  switchTo: () => void = () => void applyWorkspace('pixel'),
  then: () => void = () => {},
  toDraw: () => void = () => void applyWorkspace('draw'),
): () => void {
  // The document that's there at start-up isn't "opening".
  let last: Id = s.get().doc.id;
  return s.subscribe(() => {
    const { doc } = s.get();
    if (doc.id === last) return;
    last = doc.id;
    const mine = madeHere.delete(doc.id);
    const pixel = isPixelDoc(doc);
    const mismatch = () => (pixel ? inDrawWorkspace() : inPixelWorkspace());
    if (!mismatch()) {
      if (pixel) then();
      return;
    }
    const follow = () => {
      // Still the same document, and still in the wrong workspace, by the time they answer.
      if (s.get().doc.id === doc.id && mismatch()) (pixel ? switchTo : toDraw)();
    };
    if (mine) {
      follow();
      if (pixel) then();
      return;
    }
    withChoice(FOLLOW_CHOICE, (v) => {
      if (v === 'always') follow();
      if (pixel) then();
    });
  });
}

/** The tool a pixel sprite starts on: the Pencil, when the tool in hand is not one the Pixel workspace's rail shows. */
export function pixelStartTool(tool: string, layerKind: string | null): string | null {
  if (layerKind !== null && layerKind !== 'pixel') return null;
  return (PIXEL_TOOLS as readonly string[]).includes(tool) ? null : 'pencil';
}

interface ToolSource extends DocSource {
  get(): { doc: Doc; ui: { tool: string; activeLayerId: Id | null } };
  setUi(patch: { tool: string }): void;
}

/**
 * Entering the Pixel workspace, or opening a pixel document in it, picks the Pencil when the tool in hand (the vector
 * Brush, say) isn't in the rail, so something is always lit. After that the person's own picks stay.
 */
export function watchPixelTool(s: ToolSource, d: { inPixelWorkspace(): boolean; subscribe(fn: () => void): () => void } = realDock): () => void {
  let seen = '';
  const check = () => {
    const { doc, ui } = s.get();
    const on = d.inPixelWorkspace() && isPixelDoc(doc);
    const key = on ? doc.id : '';
    if (key === seen) return;
    seen = key;
    if (!on) return;
    const layer = doc.layers.find((l) => l.id === ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
    const next = pixelStartTool(ui.tool, layer?.kind ?? null);
    if (next) s.setUi({ tool: next });
  };
  const offDoc = s.subscribe(check);
  const offDock = d.subscribe(check);
  check();
  return () => (offDoc(), offDock());
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

// ---------------------------------------------------------------- one picture hides the Preview

/** A one-picture file: pixel art with a single frame on a single board. Nothing moves, so there is nothing to preview. */
export function isOnePicture(doc: Doc): boolean {
  return isPixelDoc(doc) && doc.length <= 1 && (doc.artboards?.length ?? 0) <= 1;
}

/** The bits of the dock the Preview rule needs, so it can be tested without one. */
export interface PreviewDock {
  inPixelWorkspace(): boolean;
  previewOpen(): boolean;
  hidePreview(): void;
  showPreview(): void;
  subscribe(fn: () => void): () => void;
}

const realDock: PreviewDock = {
  inPixelWorkspace: () => inPixelWorkspace(),
  previewOpen: () => isPlaced(dock.get().layout, 'preview'),
  hidePreview: () => hidePanel('preview'),
  showPreview: () => showPanel('preview'),
  subscribe: (fn) => dock.subscribe(fn),
};

/**
 * In the Pixel workspace the Preview starts away for a one-picture file (it would play one frame), and comes forward
 * by itself the first time the file gets a second frame or board. Each document is decided once: after that, wherever
 * you put the Preview stays.
 */
export function watchOnePicture(s: DocSource, d: PreviewDock = realDock): () => void {
  const state = new Map<Id, 'hidden' | 'done'>();
  const check = () => {
    if (!d.inPixelWorkspace()) return;
    const { doc } = s.get();
    if (!isPixelDoc(doc)) return;
    const now = state.get(doc.id);
    if (now === 'done') return;
    if (now === 'hidden') {
      if (isOnePicture(doc)) return;
      state.set(doc.id, 'done');
      if (!d.previewOpen()) d.showPreview();
      return;
    }
    if (!isOnePicture(doc)) return void state.set(doc.id, 'done');
    state.set(doc.id, 'hidden');
    if (d.previewOpen()) d.hidePreview();
  };
  const offDoc = s.subscribe(check);
  const offDock = d.subscribe(check);
  check();
  return () => (offDoc(), offDock());
}
