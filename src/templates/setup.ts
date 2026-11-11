// How a template wants the app set up when it opens: onion skin on for a walk cycle, the export dialog starting on
// GIF for a spinner or on separate sprites for an icon set. Nothing here is saved in the document. A template's
// make() records its setup against the new document's id, the app applies the view part when that document loads,
// and the export dialog asks for the export part the first time it opens on it.
import type { Doc, Id } from '../core/format';
import type { OnionSettings, Store } from '../core/store';
import type { ExportSettings, FormatId, SheetSettings } from '../export/types';

export interface TemplateExport {
  format: FormatId;
  loop?: boolean;
  transparent?: boolean;
  /** A number, or 'art' for one art pixel to one pixel (pixel art for games). */
  scale?: number | 'art';
  sheet?: Partial<SheetSettings>;
}

export interface TemplateSetup {
  onion?: Partial<OnionSettings>;
  /** The frame to open on. */
  frame?: number;
  export?: TemplateExport;
}

// Templates get made a lot (thumbnails, the cards), so only the most recent few are kept.
const KEEP = 40;
const pending = new Map<Id, TemplateSetup>();
const exportUsed = new Set<Id>();

/** Remembers a setup for a document a template just made. */
export function rememberSetup(doc: Doc, setup: TemplateSetup): void {
  pending.set(doc.id, setup);
  while (pending.size > KEEP) pending.delete(pending.keys().next().value!);
}

export function setupFor(docId: Id): TemplateSetup | undefined {
  return pending.get(docId);
}

/** Wraps a template's make() so every document it makes carries the setup. */
export function withSetup(make: () => Doc, setup: TemplateSetup): () => Doc {
  return () => {
    const doc = make();
    rememberSetup(doc, setup);
    return doc;
  };
}

/** Applies the view part (onion skin, frame) whenever a template's document is loaded into the store. */
export function watchSetups(s: Store): () => void {
  let last: Id | null = null;
  const check = () => {
    const { doc } = s.get();
    if (doc.id === last) return;
    last = doc.id;
    const setup = pending.get(doc.id);
    if (!setup) return;
    if (setup.onion) s.setUi((ui) => ({ onion: { ...ui.onion, ...setup.onion } }));
    if (setup.frame !== undefined) s.setUi({ frame: Math.max(0, Math.min(doc.length - 1, setup.frame)) });
  };
  check();
  return s.subscribe(check);
}

/**
 * The template's export choice laid over `base`, the first time only (after that the person's own last choice
 * wins). Returns `base` untouched for any other document.
 */
export function templateExport(docId: Id, base: ExportSettings, art: number | null): ExportSettings {
  const hint = pending.get(docId)?.export;
  if (!hint || exportUsed.has(docId)) return base;
  exportUsed.add(docId);
  const scale = hint.scale === 'art' ? (art ?? base.scale) : (hint.scale ?? base.scale);
  return {
    ...base,
    format: hint.format,
    range: 'all',
    clipId: null,
    scale,
    ...(hint.loop !== undefined ? { loop: hint.loop } : {}),
    ...(hint.transparent !== undefined ? { transparent: hint.transparent } : {}),
    sheet: { ...base.sheet, ...hint.sheet },
  };
}

/** For tests. */
export function forgetSetups(): void {
  pending.clear();
  exportUsed.clear();
}
