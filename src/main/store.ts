// The small things the desktop side remembers between runs, kept as plain JSON in the user's data folder: the recent
// files list, the folder the last dialog was in, and the autosave copy.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AutosaveInfo, AutosaveMeta, KeptAutosave, RecentFile } from '../preload/api';
import { pathKey } from './paths';
import { pruneCopies } from './preview';

const MAX_RECENT = 12;

const dataPath = (...p: string[]) => path.join(app.getPath('userData'), ...p);

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Writes through a temp file and renames, so a crash mid-write never leaves half a file behind. */
export function writeFileAtomic(file: string, bytes: Uint8Array | string): void {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------- settings

interface Prefs {
  recent: RecentFile[];
  lastDir?: string;
}

function loadPrefs(): Prefs {
  const p = readJson<Prefs>(dataPath('files.json'), { recent: [] });
  return { recent: Array.isArray(p.recent) ? p.recent.filter((r) => r && typeof r.path === 'string') : [], lastDir: typeof p.lastDir === 'string' ? p.lastDir : undefined };
}

function savePrefs(p: Prefs): void {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileAtomic(dataPath('files.json'), JSON.stringify(p));
  } catch {
    // Not being able to remember is never worth bothering anyone about.
  }
}

/** The recent drawings. One that has gone (a drive unplugged, a file moved) stays on the list, marked, so it can be removed or found again. */
export function listRecent(): RecentFile[] {
  return loadPrefs().recent.map((r) => (fs.existsSync(r.path) ? r : { ...r, missing: true }));
}

/** Whether a path is on the recent list (the only files the page may ask for a picture of). */
export function isRecent(file: string): boolean {
  return loadPrefs().recent.some((r) => pathKey(r.path) === pathKey(file));
}

/** The folder the app keeps pictures of drawings that had none of their own. */
export const previewDir = () => dataPath('previews');

export function addRecent(file: string): void {
  const p = loadPrefs();
  const recent = [{ path: file, name: path.basename(file, path.extname(file)), openedAt: Date.now() }, ...p.recent.filter((r) => pathKey(r.path) !== pathKey(file))].slice(0, MAX_RECENT);
  savePrefs({ ...p, recent });
  pruneCopies(previewDir(), recent.map((r) => pathKey(r.path)));
  try {
    app.addRecentDocument(file);
  } catch {
    // Only some systems have a system-wide recent list.
  }
}

export function removeRecent(file: string): void {
  const p = loadPrefs();
  const recent = p.recent.filter((r) => pathKey(r.path) !== pathKey(file));
  savePrefs({ ...p, recent });
  pruneCopies(previewDir(), recent.map((r) => pathKey(r.path)));
}

export function clearRecent(): void {
  const p = loadPrefs();
  savePrefs({ ...p, recent: [] });
  pruneCopies(previewDir(), []);
  try {
    app.clearRecentDocuments();
  } catch {
    // Same as above.
  }
}

export function lastDir(): string {
  const d = loadPrefs().lastDir;
  return d && fs.existsSync(d) ? d : app.getPath('documents');
}

export function rememberDir(file: string): void {
  const p = loadPrefs();
  savePrefs({ ...p, lastDir: path.dirname(file) });
}

// ---------------------------------------------------------------- autosave

const autosaveDir = () => dataPath('autosave');

export function writeAutosave(bytes: Uint8Array, meta: AutosaveMeta): void {
  fs.mkdirSync(autosaveDir(), { recursive: true });
  // The data goes first and the note about it last, so a note always points at a complete copy.
  writeFileAtomic(path.join(autosaveDir(), 'current.frameling'), bytes);
  writeFileAtomic(path.join(autosaveDir(), 'current.json'), JSON.stringify({ ...meta, savedAt: Date.now() }));
}

export function readAutosave(): AutosaveInfo | null {
  try {
    const note = readJson<(AutosaveMeta & { savedAt: number }) | null>(path.join(autosaveDir(), 'current.json'), null);
    if (!note || typeof note.savedAt !== 'number') return null;
    const bytes = new Uint8Array(fs.readFileSync(path.join(autosaveDir(), 'current.frameling')));
    let fileModifiedAt: number | null = null;
    if (note.filePath) {
      try {
        fileModifiedAt = fs.statSync(note.filePath).mtimeMs;
      } catch {
        fileModifiedAt = null;
      }
    }
    return { bytes, meta: { name: note.name, filePath: note.filePath ?? null, docId: note.docId }, savedAt: note.savedAt, fileModifiedAt };
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  for (const f of ['current.frameling', 'current.json']) {
    try {
      fs.rmSync(path.join(autosaveDir(), f), { force: true });
    } catch {
      // Already gone.
    }
  }
}

// ---------------------------------------------------------------- kept copies

/** How long a copy put aside by "Don't save" (or left by a crash) is kept. */
export const KEEP_DAYS = 7;
const keptDir = () => dataPath('autosave', 'kept');
const keptId = (docId: string) => String(docId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'doc';

/** Deletes kept copies older than a week. Run at start-up, and whenever the list is read. */
export function pruneKept(now = Date.now()): void {
  let names: string[];
  try {
    names = fs.readdirSync(keptDir());
  } catch {
    return;
  }
  for (const n of names.filter((x) => x.endsWith('.json'))) {
    const id = n.slice(0, -5);
    let keptAt = 0;
    try {
      keptAt = JSON.parse(fs.readFileSync(path.join(keptDir(), n), 'utf8')).keptAt;
    } catch {
      // A note nobody can read is as good as old.
    }
    if (typeof keptAt === 'number' && now - keptAt < KEEP_DAYS * 24 * 3600 * 1000) continue;
    for (const f of [`${id}.frameling`, `${id}.json`]) fs.rmSync(path.join(keptDir(), f), { force: true });
  }
  // Pictures with no note (a half-finished copy) are of no use either.
  for (const n of fs.readdirSync(keptDir()).filter((x) => x.endsWith('.frameling'))) {
    if (!fs.existsSync(path.join(keptDir(), n.replace(/\.frameling$/, '.json')))) fs.rmSync(path.join(keptDir(), n), { force: true });
  }
}

function sameFile(a: string, b: string): boolean {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
}

/** Puts the current autosave copy aside. One kept copy per drawing, so the newest wins. */
export function keepAutosave(thumb?: string, now = Date.now()): boolean {
  const note = readJson<(AutosaveMeta & { savedAt: number }) | null>(path.join(autosaveDir(), 'current.json'), null);
  if (!note || !fs.existsSync(path.join(autosaveDir(), 'current.frameling'))) return false;
  const id = keptId(note.docId);
  fs.mkdirSync(keptDir(), { recursive: true });
  // This very copy is already put aside (a crash copy kept at every start-up, say): leave its clock alone, and only
  // add the thumbnail if it had none.
  const had = readJson<KeptAutosave | null>(path.join(keptDir(), `${id}.json`), null);
  if (had && had.savedAt === note.savedAt && sameFile(path.join(keptDir(), `${id}.frameling`), path.join(autosaveDir(), 'current.frameling'))) {
    if (!had.thumb && typeof thumb === 'string' && thumb.startsWith('data:image/') && thumb.length < 200_000) writeFileAtomic(path.join(keptDir(), `${id}.json`), JSON.stringify({ ...had, thumb }));
    return true;
  }
  fs.copyFileSync(path.join(autosaveDir(), 'current.frameling'), path.join(keptDir(), `${id}.frameling`));
  const meta: KeptAutosave = { id, name: note.name, filePath: note.filePath ?? null, savedAt: note.savedAt, keptAt: now, ...(typeof thumb === 'string' && thumb.startsWith('data:image/') && thumb.length < 200_000 ? { thumb } : {}) };
  writeFileAtomic(path.join(keptDir(), `${id}.json`), JSON.stringify(meta));
  return true;
}

export function listKept(): KeptAutosave[] {
  pruneKept();
  let names: string[];
  try {
    names = fs.readdirSync(keptDir());
  } catch {
    return [];
  }
  const out: KeptAutosave[] = [];
  for (const n of names.filter((x) => x.endsWith('.json'))) {
    const m = readJson<KeptAutosave | null>(path.join(keptDir(), n), null);
    if (m && typeof m.id === 'string' && typeof m.keptAt === 'number' && fs.existsSync(path.join(keptDir(), `${keptId(m.id)}.frameling`))) out.push(m);
  }
  return out.sort((a, b) => b.keptAt - a.keptAt);
}

export function readKept(id: string): { bytes: Uint8Array; meta: AutosaveMeta } | null {
  const k = keptId(id);
  const m = readJson<KeptAutosave | null>(path.join(keptDir(), `${k}.json`), null);
  if (!m) return null;
  try {
    return { bytes: new Uint8Array(fs.readFileSync(path.join(keptDir(), `${k}.frameling`))), meta: { name: m.name, filePath: null, docId: k } };
  } catch {
    return null;
  }
}

export function removeKept(id: string): void {
  const k = keptId(id);
  for (const f of [`${k}.frameling`, `${k}.json`]) fs.rmSync(path.join(keptDir(), f), { force: true });
}
