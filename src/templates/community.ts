/**
 * Templates people make and share: an ordinary `.frameling` file with a small `template.json` beside the drawing
 * (name, blurb, kind, tags, author, licence). Any Frameling opens it as a normal drawing; the template list reads the
 * extra file to show a nice card. Pure bytes in and out, so it is all tested in Node.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Doc } from '../core/format';
import { loadFile, saveFile } from '../io/file';

export const TEMPLATE_ENTRY = 'template.json';

export type TemplateKind = 'vector' | 'pixel';

export interface TemplateMeta {
  name: string;
  /** What it is, then a "try this" line. */
  blurb: string;
  kind: TemplateKind;
  tags: string[];
  author: string;
  /** A licence id from LICENCES, or free text. */
  licence: string;
  /** The frame shown on the card (the one you were on when saving). Missing = the first. */
  frame?: number;
}

/** Licences offered when saving. Free text is kept too, for templates made elsewhere. */
export const LICENCES: { id: string; label: string; detail: string }[] = [
  { id: 'CC0-1.0', label: 'Free for anything (CC0)', detail: 'Anyone can use it for anything, no credit needed.' },
  { id: 'CC-BY-4.0', label: 'Free with credit (CC BY 4.0)', detail: 'Anyone can use it for anything, as long as they credit you.' },
  { id: 'CC-BY-SA-4.0', label: 'Free with credit, share alike (CC BY-SA 4.0)', detail: 'As above, and what they make from it must use the same licence.' },
  { id: 'CC-BY-NC-4.0', label: 'Free for non-commercial use (CC BY-NC 4.0)', detail: 'Anyone can use it with credit, but not to make money.' },
  { id: 'personal', label: 'Just for me', detail: 'Not for sharing.' },
];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

/** Pixel when every layer is pixel art (or tiles), else vector. */
export function guessKind(doc: Pick<Doc, 'layers'>): TemplateKind {
  return doc.layers.length > 0 && doc.layers.every((l) => l.kind !== 'vector') ? 'pixel' : 'vector';
}

/** Tags from a typed list ("walk, cycle, character"): lower case, no repeats, at most 8. */
export function cleanTags(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const out: string[] = [];
  for (const t of list) {
    const s = text(t, 24).toLowerCase();
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= 8) break;
  }
  return out;
}

/** Checks a template.json, filling gaps from the drawing. */
export function cleanMeta(raw: unknown, doc: Pick<Doc, 'name' | 'layers'>): TemplateMeta {
  const r = isObj(raw) ? raw : {};
  return {
    name: text(r.name, 60) || doc.name || 'Untitled template',
    blurb: text(r.blurb, 300),
    kind: r.kind === 'pixel' || r.kind === 'vector' ? r.kind : guessKind(doc),
    tags: cleanTags(r.tags),
    author: text(r.author, 80),
    licence: text(r.licence, 60),
    ...(typeof r.frame === 'number' && Number.isInteger(r.frame) && r.frame > 0 ? { frame: r.frame } : {}),
  };
}

/** The template file: the drawing as a .frameling, plus template.json. */
export function packTemplate(doc: Doc, meta: TemplateMeta, appVersion = ''): Uint8Array {
  const files = unzipSync(saveFile(doc, appVersion));
  const out: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  // Pictures are already squeezed; only the JSON is worth compressing again.
  for (const [name, bytes] of Object.entries(files)) out[name] = name.endsWith('.png') ? [bytes, { level: 0 }] : bytes;
  out[TEMPLATE_ENTRY] = strToU8(JSON.stringify(cleanMeta(meta, doc), null, 2));
  return zipSync(out, { level: 6 });
}

export interface ReadTemplate {
  meta: TemplateMeta;
  doc: Doc;
  /** It had a template.json (false: a plain drawing used as a template). */
  described: boolean;
}

/** Reads a template (or any .frameling file). Throws the same plain-words FileProblem as opening a file. */
export function readTemplate(bytes: Uint8Array): ReadTemplate {
  const { doc } = loadFile(bytes);
  let raw: unknown = null;
  try {
    const e = unzipSync(bytes, { filter: (f) => f.name === TEMPLATE_ENTRY && f.originalSize < 64 * 1024 });
    if (e[TEMPLATE_ENTRY]) raw = JSON.parse(strFromU8(e[TEMPLATE_ENTRY]));
  } catch {
    raw = null;
  }
  return { meta: cleanMeta(raw, doc), doc, described: raw !== null };
}
