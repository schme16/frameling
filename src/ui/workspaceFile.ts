// A workspace as a file or as text, to share. Plain JSON with a format tag, so a file that isn't one is turned away
// with a sentence, and nothing in it is trusted: it goes through the same tidying as a saved layout.
import { cleanName, normaliseLayout, sanitizeWorkspace, type Workspace } from './dockModel';

export const WORKSPACE_FORMAT = 'frameling-workspace';
export const WORKSPACE_VERSION = 1;
export const WORKSPACE_EXT = '.frameling-workspace.json';
/** Bigger than this isn't a workspace. */
export const MAX_WORKSPACE_BYTES = 256 * 1024;

export interface WorkspaceFile {
  format: typeof WORKSPACE_FORMAT;
  version: number;
  name: string;
  about?: string;
  layout: Workspace['layout'];
  pixel?: boolean;
  tools?: Workspace['tools'];
  /** The tool rail's arrangement for this workspace. */
  rail?: Workspace['rail'];
  /** How wide the tool rail is, in pixels. Optional, so a file from before it still opens. */
  railWidth?: number;
}

/** The text to save or copy for a workspace. */
export function workspaceToText(w: Workspace): string {
  const file: WorkspaceFile = { format: WORKSPACE_FORMAT, version: WORKSPACE_VERSION, name: w.name, ...(w.about ? { about: w.about } : {}), layout: w.layout, ...(w.pixel ? { pixel: true } : {}), ...(w.tools ? { tools: w.tools } : {}), ...(w.rail ? { rail: w.rail } : {}), ...(w.railWidth ? { railWidth: w.railWidth } : {}) };
  return JSON.stringify(file, null, 2);
}

/** A file name for a workspace: its name, made safe for any system. */
export function workspaceFileName(name: string): string {
  const base = cleanName(name).replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'workspace';
  return `${base}${WORKSPACE_EXT}`;
}

export type ImportResult = { ok: true; workspace: Workspace } | { ok: false; error: string };

/** Reads a workspace out of text (a file's or what was pasted). The result has no id yet: the caller gives it one. */
export function parseWorkspaceText(text: unknown): ImportResult {
  if (typeof text !== 'string') return { ok: false, error: 'That is not a workspace.' };
  if (text.length > MAX_WORKSPACE_BYTES) return { ok: false, error: 'That is too big to be a workspace.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: 'That is not a workspace. It should be a file or text copied from Frameling.' };
  }
  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== WORKSPACE_FORMAT) return { ok: false, error: 'That is not a Frameling workspace.' };
  const f = raw as Record<string, unknown>;
  if (typeof f.version === 'number' && f.version > WORKSPACE_VERSION) return { ok: false, error: 'That workspace is from a newer Frameling. Update Frameling to use it.' };
  if (!f.layout || typeof f.layout !== 'object') return { ok: false, error: 'That workspace has no layout in it.' };
  const ws = sanitizeWorkspace({ id: 'import', name: f.name, about: f.about, pixel: f.pixel, tools: f.tools, rail: f.rail, railWidth: f.railWidth, layout: normaliseLayout(f.layout) });
  if (!ws) return { ok: false, error: 'That workspace has no name.' };
  return { ok: true, workspace: ws };
}

/** A name that isn't taken (compared without caring about capitals): "Mine", then "Mine 2", "Mine 3". */
export function uniqueWorkspaceName(name: string, taken: string[], max = 40): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  const base = cleanName(name, max) || 'My workspace';
  if (!lower.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = ` ${n}`;
    const cand = `${base.slice(0, max - suffix.length)}${suffix}`;
    if (!lower.has(cand.toLowerCase())) return cand;
  }
  return base;
}
