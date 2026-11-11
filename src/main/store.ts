// The small things the desktop side remembers between runs, kept as plain JSON in the user's data folder: the recent
// files list, the folder the last dialog was in, and the autosave copy.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AutosaveInfo, AutosaveMeta, RecentFile } from '../preload/api';

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

export function listRecent(): RecentFile[] {
  const p = loadPrefs();
  const alive = p.recent.filter((r) => fs.existsSync(r.path));
  if (alive.length !== p.recent.length) savePrefs({ ...p, recent: alive });
  return alive;
}

export function addRecent(file: string): void {
  const p = loadPrefs();
  const recent = [{ path: file, name: path.basename(file, path.extname(file)), openedAt: Date.now() }, ...p.recent.filter((r) => r.path !== file)].slice(0, MAX_RECENT);
  savePrefs({ ...p, recent });
  try {
    app.addRecentDocument(file);
  } catch {
    // Only some systems have a system-wide recent list.
  }
}

export function removeRecent(file: string): void {
  const p = loadPrefs();
  savePrefs({ ...p, recent: p.recent.filter((r) => r.path !== file) });
}

export function clearRecent(): void {
  const p = loadPrefs();
  savePrefs({ ...p, recent: [] });
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
