// The desktop side of the app's own library (installed plugins and your templates), the "Open another kind of file"
// dialog, and Interactives packages Frameling may write back to. Kept apart from ipc.ts so it stays small.
import { app, dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { FileFilter, LibraryEntry, LibraryKind } from '../preload/api';
import { pathKey } from './paths';

/** Each kind keeps its files with one extension, so people can drop files into the folder by hand. */
export const LIBRARY_EXT: Record<LibraryKind, string> = { plugins: '.zip', templates: '.frameling', versions: '.frameling', 'versions-index': '.json' };
const MAX_LIBRARY_FILE = 64 * 1024 * 1024;

export const isLibraryKind = (k: unknown): k is LibraryKind => k === 'plugins' || k === 'templates' || k === 'versions' || k === 'versions-index';

/** Ids are file names without the extension: letters, numbers, dashes and underscores only. */
export function libraryId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : null;
}

export function libraryFolder(kind: LibraryKind, base = app.getPath('userData')): string {
  return path.join(base, 'library', kind);
}

export function listLibrary(kind: LibraryKind, base?: string): LibraryEntry[] {
  const dir = libraryFolder(kind, base);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const ext = LIBRARY_EXT[kind];
  const out: LibraryEntry[] = [];
  for (const n of names) {
    if (!n.toLowerCase().endsWith(ext)) continue;
    const id = n.slice(0, -ext.length);
    if (!libraryId(id)) continue;
    try {
      const st = fs.statSync(path.join(dir, n));
      if (st.isFile()) out.push({ id, size: st.size, modified: st.mtimeMs });
    } catch {
      // Gone while we looked.
    }
  }
  return out;
}

export function readLibrary(kind: LibraryKind, id: string, base?: string): Uint8Array | null {
  try {
    const file = path.join(libraryFolder(kind, base), id + LIBRARY_EXT[kind]);
    if (fs.statSync(file).size > MAX_LIBRARY_FILE) return null;
    return new Uint8Array(fs.readFileSync(file));
  } catch {
    return null;
  }
}

export function writeLibrary(kind: LibraryKind, id: string, bytes: Uint8Array, write: (file: string, bytes: Uint8Array) => void, base?: string): void {
  if (bytes.length > MAX_LIBRARY_FILE) throw new Error('too big');
  const dir = libraryFolder(kind, base);
  fs.mkdirSync(dir, { recursive: true });
  write(path.join(dir, id + LIBRARY_EXT[kind]), bytes);
}

export function removeLibrary(kind: LibraryKind, id: string, base?: string): void {
  try {
    fs.rmSync(path.join(libraryFolder(kind, base), id + LIBRARY_EXT[kind]), { force: true });
  } catch {
    // Already gone.
  }
}

export function showLibraryFolder(kind: LibraryKind): void {
  const dir = libraryFolder(kind);
  fs.mkdirSync(dir, { recursive: true });
  void shell.openPath(dir);
}

// ---------------------------------------------------------------- other files

/** The kinds of file openOther may show. Anything else asked for is dropped. */
const OPEN_EXTS = new Set(['frameling', 'flplay', 'zip', 'flplugin']);

export function cleanFilters(filters: unknown): FileFilter[] {
  if (!Array.isArray(filters)) return [];
  return filters
    .filter((f): f is FileFilter => !!f && typeof f.name === 'string' && Array.isArray(f.extensions))
    .map((f) => ({ name: f.name.slice(0, 60), extensions: f.extensions.filter((e) => typeof e === 'string' && OPEN_EXTS.has(e.toLowerCase())) }))
    .filter((f) => f.extensions.length);
}

export function canOpenOther(p: string): boolean {
  return OPEN_EXTS.has(path.extname(p).slice(1).toLowerCase());
}

const MAX_FOLDER_FILES = 64;
const MAX_FOLDER_BYTES = 8 * 1024 * 1024;

/** A plugin folder being worked on: its top-level files (and one level down), small ones only. */
export function readSmallFolder(dir: string): { name: string; bytes: Uint8Array }[] | { error: string } {
  const out: { name: string; bytes: Uint8Array }[] = [];
  let total = 0;
  const walk = (d: string, prefix: string, depth: number): string | null => {
    for (const n of fs.readdirSync(d)) {
      if (n.startsWith('.') || n === 'node_modules') continue;
      const full = path.join(d, n);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (depth < 1) {
          const e = walk(full, `${prefix}${n}/`, depth + 1);
          if (e) return e;
        }
        continue;
      }
      if (!st.isFile()) continue;
      total += st.size;
      if (out.length >= MAX_FOLDER_FILES || total > MAX_FOLDER_BYTES) return 'That folder is too big to be a plugin. A plugin is a manifest.json and one script.';
      out.push({ name: prefix + n, bytes: new Uint8Array(fs.readFileSync(full)) });
    }
    return null;
  };
  try {
    const e = walk(dir, '', 0);
    return e ? { error: e } : out;
  } catch {
    return { error: 'Frameling could not read that folder.' };
  }
}

// ---------------------------------------------------------------- linked Interactives packages

const linkedFile = () => path.join(app.getPath('userData'), 'linked-playables.json');
const MAX_LINKED = 200;

export function listLinked(): string[] {
  try {
    const v = JSON.parse(fs.readFileSync(linkedFile(), 'utf8'));
    return Array.isArray(v) ? v.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export function addLinked(p: string, write: (file: string, bytes: string) => void): void {
  const list = [path.resolve(p), ...listLinked().filter((x) => pathKey(x) !== pathKey(p))].slice(0, MAX_LINKED);
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    write(linkedFile(), JSON.stringify(list));
  } catch {
    // Then it only works this session.
  }
}

export function isLinked(p: string): boolean {
  return path.extname(p).toLowerCase() === '.flplay' && listLinked().some((x) => pathKey(x) === pathKey(p));
}

export async function pickFolder(win: BrowserWindow, title: string, lastDir: string): Promise<string | null> {
  const r = await dialog.showOpenDialog(win, { title, defaultPath: lastDir, properties: ['openDirectory'], buttonLabel: 'Use this folder' });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
}

// ---------------------------------------------------------------- frameling:// links

export const PROTOCOL = 'frameling';

/**
 * The file a `frameling://open?path=...` link asks for, or null. Only .frameling and .flplay files that exist, as
 * absolute paths. Interactives (or anything else on the computer) can use it for "Edit in Frameling".
 */
export function fileFromUrl(url: string, exists: (p: string) => boolean = fs.existsSync): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== `${PROTOCOL}:`) return null;
  const action = (u.hostname || u.pathname.replace(/^\/+/, '')).toLowerCase();
  if (action !== 'open') return null;
  const p = u.searchParams.get('path');
  if (!p || !path.isAbsolute(p)) return null;
  const ext = path.extname(p).toLowerCase();
  if (ext !== '.frameling' && ext !== '.flplay') return null;
  const abs = path.resolve(p);
  return exists(abs) ? abs : null;
}
