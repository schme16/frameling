/**
 * A report a beta tester chooses to send: what went on, and what this computer is.
 *
 * Two rules the whole thing is built around, and the tests hold them:
 * 1. Nothing is ever sent on its own. There is no background telemetry, no ping on start-up, no counting of what
 *    you do. A report leaves this computer when you press the button and not before.
 * 2. Nothing personal goes in it. No file paths, no file names, no drawing, no words you typed, no account, no
 *    address. What the shape of your document is, yes; what is in it, never.
 *
 * You can read the whole thing before it goes: `reportText` is what the panel shows, and it is exactly what is sent.
 */
import type { Doc } from '../core/format';
import type { MachineFacts } from './machine';

/** The board's ingest shape (see the Reports tab). Every field is optional at the far end; we fill what we can. */
export interface IngestReport {
  title: string;
  kind: 'beta' | 'crash' | 'pen';
  app: string;
  version: string;
  platform: string;
  /** Only when the person typed one. Never taken from an account or a file. */
  contact?: string;
  summary: string;
  text: string;
  data: Record<string, unknown>;
}

/** The shape of a document, with nothing of what is drawn in it. */
export interface DocShape {
  width: number;
  height: number;
  frames: number;
  fps: number;
  layers: number;
  /** How many of each kind, so a problem can be put down to pixel, vector, tiles or bones. */
  kinds: Record<string, number>;
  artboards: number;
  clips: number;
  hasAudio: boolean;
}

/** Measures a document without reading a single thing anyone drew or named. */
export function docShape(doc: Doc): DocShape {
  const kinds: Record<string, number> = {};
  for (const l of doc.layers) kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
  return {
    width: doc.width,
    height: doc.height,
    frames: doc.length,
    fps: doc.fps,
    layers: doc.layers.length,
    kinds,
    artboards: doc.artboards?.length ?? 1,
    clips: doc.clips.length,
    hasAudio: !!doc.audio?.length,
  };
}

/** Anything that looks like a path, an address or a home folder, taken out of free text before it goes. */
export function scrub(text: string): string {
  return text
    .replace(/[A-Za-z]:\\[^\s"']+/g, '<a path>')
    .replace(/(?:\/[\w.-]+){2,}\/?/g, '<a path>')
    .replace(/\bfile:\/\/\S+/g, '<a path>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<an address>');
}

export interface ReportParts {
  /** What the person typed. Theirs, kept as they wrote it apart from paths and addresses. */
  note: string;
  /** How to get back to them, only if they chose to give it. Kept exactly as typed: giving an address is the whole point of it, and the preview shows it as it will be sent. */
  contact?: string;
  /** Where in the app it happened, as a plain word ("Export", "Drawing"). */
  where?: string;
  env: Record<string, unknown>;
  shape?: DocShape;
  /** The processor, memory and graphics. Only when the person left "Include details of this computer" on. */
  machine?: MachineFacts | null;
  /** The last few things that went wrong in the page, already made safe. */
  problems?: string[];
}

export const MAX_NOTE = 4000;
/** The board turns away anything bigger. We stay well under it and say so rather than being cut off. */
export const MAX_BYTES = 256_000;

/** Builds the report. Pure: the same parts always give the same thing, which is what lets the panel show it first. */
export function buildReport(p: ReportParts, app = 'Frameling'): IngestReport {
  const note = scrub(p.note).slice(0, MAX_NOTE).trim();
  const first = note.split('\n')[0]?.slice(0, 120) ?? '';
  return {
    title: first || 'A note from a beta tester',
    kind: 'beta',
    app,
    version: String(p.env.appVersion ?? ''),
    platform: String(p.env.platform ?? ''),
    ...(p.contact?.trim() ? { contact: p.contact.trim().slice(0, 200) } : {}),
    summary: first || 'No note',
    text: note,
    data: {
      where: p.where ?? '',
      env: p.env,
      ...(p.shape ? { doc: p.shape } : {}),
      ...(p.machine ? { machine: p.machine } : {}),
      ...(p.problems?.length ? { problems: p.problems.slice(-20).map((x) => scrub(x).slice(0, 500)) } : {}),
    },
  };
}

/** Exactly what will be sent, laid out to be read. The panel shows this and nothing else goes. */
export const reportText = (r: IngestReport): string => JSON.stringify(r, null, 2);

/** Whether it will fit. Too big means the note or the problems list is enormous. */
export const reportFits = (r: IngestReport): boolean => new TextEncoder().encode(reportText(r)).length <= MAX_BYTES;
