// Your templates: kept in the app's library (desktop: a templates folder in the user data dir, where .frameling files
// can be dropped by hand; web: IndexedDB). Template sources are a list, so an online gallery can join later as one
// more source with its own section, without the welcome sheet changing.
import { ownedUndo } from '../core/owners';
import type { Doc } from '../core/format';
import { uid } from '../core/doc';
import { FileProblem } from '../io/file';
import { idFromName, library } from '../platform/library';
import { createStore } from '../ui/mini';
import { readTemplate, packTemplate, type TemplateMeta } from './community';

/** A template card, from any source. Built-in ones have the same shape (see index.ts). */
export interface TemplateCard {
  id: string;
  name: string;
  blurb: string;
  kind: 'vector' | 'pixel';
  thumbnail?: () => number;
  make(): Doc;
  tags?: string[];
  author?: string;
  licence?: string;
}

export interface TemplateSource {
  id: string;
  /** The section heading on the welcome sheet ("Yours"). */
  title: string;
  /** Shown when the source has nothing yet. */
  empty: string;
  list(): Promise<TemplateCard[]>;
  /** Present when people can take one away again. */
  remove?(id: string): Promise<void>;
}

const sources: TemplateSource[] = [];

/** Adds a section of templates to the welcome sheet (Yours, and one day an online gallery). */
export function registerTemplateSource(s: TemplateSource): void {
  const i = sources.findIndex((x) => x.id === s.id);
  const before = i >= 0 ? sources[i] : null;
  if (i >= 0) sources[i] = s;
  else sources.push(s);
  ownedUndo(() => {
    const at = sources.indexOf(s);
    if (at < 0) return;
    if (before) sources[at] = before;
    else sources.splice(at, 1);
  });
}

export function templateSources(): TemplateSource[] {
  return [...sources];
}

// ---------------------------------------------------------------- yours

/** Bumped whenever your templates change, so the welcome sheet reloads them. */
export const userTemplatesVersion = createStore(0);
const bump = () => userTemplatesVersion.set((v) => v + 1);

/** A fresh document from template bytes, with its own id (so it never shares autosave or links with another). */
function makeFrom(bytes: Uint8Array): Doc {
  const doc = readTemplate(bytes).doc;
  doc.id = uid('d');
  return doc;
}

export async function listUserTemplates(): Promise<TemplateCard[]> {
  const out: TemplateCard[] = [];
  for (const e of await library.list('templates')) {
    const bytes = await library.read('templates', e.id);
    if (!bytes) continue;
    try {
      const { meta } = readTemplate(bytes);
      out.push({ id: `user:${e.id}`, name: meta.name, blurb: meta.blurb, kind: meta.kind, tags: meta.tags, author: meta.author, licence: meta.licence, thumbnail: () => meta.frame ?? 0, make: () => makeFrom(bytes) });
    } catch {
      // Not a drawing (something else dropped in the folder): leave it out.
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function freeId(name: string): Promise<string> {
  const base = idFromName(name, 'template').slice(0, 60);
  const taken = new Set((await library.list('templates')).map((e) => e.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Keeps a drawing as one of your templates. Resolves the card id. */
export async function saveUserTemplate(doc: Doc, meta: TemplateMeta, appVersion = ''): Promise<string> {
  const id = await freeId(meta.name);
  await library.write('templates', id, packTemplate(doc, meta, appVersion));
  bump();
  return `user:${id}`;
}

/** Adds a template file (or any .frameling) to yours. Throws FileProblem in plain words. */
export async function importUserTemplate(bytes: Uint8Array, fileName = ''): Promise<{ id: string; name: string }> {
  const t = readTemplate(bytes);
  const name = t.described ? t.meta.name : fileName.replace(/\.frameling$/i, '') || t.meta.name;
  const meta = { ...t.meta, name };
  const id = await freeId(name);
  // Stored with its description, so a plain drawing gets one too.
  await library.write('templates', id, t.described ? bytes : packTemplate(t.doc, meta));
  bump();
  return { id: `user:${id}`, name };
}

export async function removeUserTemplate(cardId: string): Promise<void> {
  if (!cardId.startsWith('user:')) throw new FileProblem('That template comes with Frameling.');
  await library.remove('templates', cardId.slice(5));
  bump();
}

/** The template file for sharing. */
export async function userTemplateBytes(cardId: string): Promise<Uint8Array | null> {
  return cardId.startsWith('user:') ? library.read('templates', cardId.slice(5)) : null;
}

registerTemplateSource({
  id: 'yours',
  title: 'Yours',
  empty: 'Templates you save show up here. Open any drawing, then choose File > Save as template.',
  list: listUserTemplates,
  remove: removeUserTemplate,
});
