/**
 * The desktop bridge (FramelingApi) built in the page, for the web build. Files go through the File System Access
 * API where the browser has it (Chrome, Edge) and through downloads and an upload picker where it doesn't (Firefox,
 * Safari). Recent files, browser copies of files and the autosave copies live in IndexedDB.
 *
 * Paths are made up here, `<kind>:/<id>/<file name>`, so the rest of the app can keep treating them as paths
 * (baseName gives the file name). The id finds the file handle or the browser's copy.
 */
import { zipSync } from 'fflate';
import type { AutosaveInfo, AutosaveMeta, DocumentState, FileFilter, FramelingApi, KeptAutosave, LibraryApi, LibraryEntry, LibraryKind, RecentFile, SaveChoice } from '../../preload/api';
import type { Question } from '../ask';
import { memoryDb, type Db } from './idb';

// ---------------------------------------------------------------- the bits of the browser it uses

/** The parts of FileSystemFileHandle used here (typed locally, as the pickers aren't in TypeScript's DOM types). */
export interface FileHandleLike {
  kind: 'file';
  name: string;
  isSameEntry?(other: FileHandleLike | DirHandleLike): Promise<boolean>;
  getFile(): Promise<Blob & { lastModified?: number }>;
  createWritable(): Promise<{ write(data: Uint8Array | Blob): Promise<void>; close(): Promise<void> }>;
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export interface DirHandleLike {
  kind: 'directory';
  name: string;
  isSameEntry?(other: FileHandleLike | DirHandleLike): Promise<boolean>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

export interface Pickers {
  showOpenFilePicker?: (opts: { types?: PickerType[]; excludeAcceptAllOption?: boolean; id?: string }) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (opts: { suggestedName?: string; types?: PickerType[]; id?: string }) => Promise<FileHandleLike>;
  showDirectoryPicker?: (opts: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<DirHandleLike>;
}

export interface WebEnv {
  db: Db | Promise<Db>;
  pickers: Pickers;
  /** Hands the bytes to the browser as a download. */
  download(name: string, bytes: Uint8Array): void;
  /** The upload picker (an <input type=file>). null when they cancel. */
  pickUpload(accept: string): Promise<File | null>;
  ask(q: Question): Promise<string>;
  appVersion: string;
  /** `darwin`, `win32` or `linux`, guessed from the browser, so shortcuts show Cmd on a Mac. */
  platform: string;
  now?: () => number;
  /** Called after a safety copy is written to the browser's storage (the moment to ask the browser to keep it). */
  onSaved?: () => void;
  /** Where page events come from (beforeunload, pagehide). Left out in tests. */
  events?: Pick<Window, 'addEventListener'>;
}

// ---------------------------------------------------------------- paths

export type PathKind = 'file' | 'copy' | 'download' | 'folder' | 'zip';

export function makePath(kind: PathKind, id: string, name: string): string {
  return `${kind}:/${id}/${name}`;
}

export function parsePath(p: string): { kind: PathKind; id: string; name: string } | null {
  const m = /^(file|copy|download|folder|zip):\/([^/]+)\/(.*)$/.exec(p);
  return m ? { kind: m[1] as PathKind, id: m[2], name: m[3] } : null;
}

/** Plain words for where a made-up path lives, for the recent files list. */
export function describeWebPath(p: string): string | null {
  const k = parsePath(p)?.kind;
  if (k === 'file') return 'on this computer';
  if (k === 'copy' || k === 'download') return 'kept in this browser';
  return null;
}

let counter = 0;
const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const MAX_RECENT = 12;
export const KEEP_DAYS = 7;
const DAY = 24 * 3600 * 1000;
const keptId = (docId: string) => String(docId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'doc';

const FRAMELING_TYPE: PickerType = { description: 'Frameling drawing', accept: { 'application/x-frameling': ['.frameling'] } };
const ASEPRITE_TYPE: PickerType = { description: 'Aseprite file', accept: { 'application/x-aseprite': ['.aseprite', '.ase'] } };

const MIME: Record<string, string> = {
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  apng: 'image/apng',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  json: 'application/json',
  zip: 'application/zip',
  txt: 'text/plain',
  gpl: 'text/plain',
  hex: 'text/plain',
  pal: 'text/plain',
};

export function pickerTypes(filters: FileFilter[]): PickerType[] {
  return filters
    .filter((f) => f.extensions.length && !f.extensions.includes('*'))
    .map((f) => {
      const accept: Record<string, string[]> = {};
      for (const e of f.extensions) {
        const mime = MIME[e.toLowerCase()] ?? 'application/octet-stream';
        (accept[mime] ??= []).push(`.${e}`);
      }
      return { description: f.name, accept };
    });
}

const isAbort = (e: unknown) => e instanceof Error && (e.name === 'AbortError' || e.name === 'NotAllowedError');

function friendly(e: unknown, what: 'open' | 'save'): string {
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotFoundError') return `Frameling can't find that file any more. It may have been moved or deleted.`;
  if (name === 'NotAllowedError' || name === 'SecurityError') return `The browser didn't let Frameling ${what} that file. Try again, and choose Allow if it asks.`;
  if (name === 'QuotaExceededError') return `There isn't enough room in this browser's storage to ${what} that.`;
  return what === 'open' ? 'Frameling could not open that file.' : 'Frameling could not save that file.';
}

async function bytesOf(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

async function allowed(h: FileHandleLike | DirHandleLike, mode: 'read' | 'readwrite'): Promise<boolean> {
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode })) === 'granted') return true;
  return !!h.requestPermission && (await h.requestPermission({ mode })) === 'granted';
}

async function writeHandle(h: FileHandleLike, bytes: Uint8Array): Promise<void> {
  const w = await h.createWritable();
  await w.write(bytes);
  await w.close();
}

// ---------------------------------------------------------------- the bridge

export interface WebApi extends FramelingApi {
  /** Runs once storage is open and leftovers are tidied: what a crash left is put aside, old copies go. */
  ready: Promise<void>;
  /** Files handed over by the system (an installed web app opened with a .frameling file). */
  receiveFiles(handles: FileHandleLike[]): Promise<void>;
  /** A file dropped on the page that the browser gave no handle for: kept as the browser's own copy, then opened. */
  receiveFile(file: Blob & { name: string }): Promise<void>;
}

export function createWebApi(env: WebEnv): WebApi {
  const now = env.now ?? Date.now;
  let dbp: Promise<Db> = Promise.resolve(env.db);
  // Handles picked during this visit. IndexedDB keeps them across visits too, where the browser allows it.
  const handles = new Map<string, FileHandleLike | DirHandleLike>();
  let docState: DocumentState = { dirty: false, name: 'Untitled', filePath: null };
  const openFileHandlers = new Set<(path: string) => void>();
  const keepHandlers = new Set<() => Promise<void>>();
  let launchFile: string | null = null;

  const db = () => dbp;

  /**
   * Gives a picked handle a path. Drawings (`keep`) are stored so Open recent works on the next visit, and a file
   * that already has a path gets the same one back, so it isn't listed twice.
   */
  async function remember(kind: 'file' | 'folder', h: FileHandleLike | DirHandleLike, keep = false): Promise<string> {
    if (keep && h.isSameEntry) {
      const known = new Map(handles);
      try {
        const d = await db();
        for (const id of await d.keys('handles')) if (!known.has(id)) known.set(id, (await d.get<FileHandleLike>('handles', id))!);
      } catch {
        // Only this visit's handles, then.
      }
      for (const [id, other] of known) {
        try {
          if (other?.kind === h.kind && (await h.isSameEntry(other as FileHandleLike))) {
            handles.set(id, h);
            return makePath(kind, id, h.name);
          }
        } catch {
          // A stale handle; carry on looking.
        }
      }
    }
    const id = newId();
    handles.set(id, h);
    if (keep) {
      try {
        await (await db()).put('handles', id, h);
      } catch {
        // Some browsers can't store handles. They still work until the page closes.
      }
    }
    return makePath(kind, id, h.name);
  }

  async function handleFor(id: string): Promise<FileHandleLike | DirHandleLike | undefined> {
    const h = handles.get(id) ?? (await (await db()).get<FileHandleLike | DirHandleLike>('handles', id));
    if (h && typeof (h as FileHandleLike).name === 'string') handles.set(id, h);
    return h;
  }

  async function keepCopy(path: string, bytes: Uint8Array): Promise<void> {
    await (await db()).put('copies', path, bytes);
  }

  // ------------------------------------------------ autosave

  type Note = AutosaveMeta & { savedAt: number };

  async function keepCurrent(thumb?: string): Promise<void> {
    const d = await db();
    const cur = await d.get<{ bytes: Uint8Array; note: Note }>('autosave', 'current');
    if (!cur) return;
    const id = keptId(cur.note.docId);
    // The picture drawn with the last autosave stands in when the page is closing and has no time to draw a new one.
    const given = thumb ?? cur.note.thumb;
    const goodThumb = typeof given === 'string' && given.startsWith('data:image/') && given.length < 200_000 ? given : undefined;
    const had = await d.get<{ meta: KeptAutosave; bytes: Uint8Array }>('kept', id);
    // The same copy already put aside (kept at every start-up, say): leave its clock alone, only add a missing thumbnail.
    if (had && had.meta.savedAt === cur.note.savedAt) {
      if (!had.meta.thumb && goodThumb) await d.put('kept', id, { ...had, meta: { ...had.meta, thumb: goodThumb } });
      return;
    }
    const meta: KeptAutosave = { id, name: cur.note.name, filePath: cur.note.filePath ?? null, savedAt: cur.note.savedAt, keptAt: now(), ...(goodThumb ? { thumb: goodThumb } : {}) };
    await d.put('kept', id, { meta, bytes: cur.bytes });
  }

  async function pruneKept(): Promise<void> {
    const d = await db();
    for (const id of await d.keys('kept')) {
      const k = await d.get<{ meta: KeptAutosave }>('kept', id);
      if (!k || typeof k.meta?.keptAt !== 'number' || now() - k.meta.keptAt >= KEEP_DAYS * DAY) await d.delete('kept', id);
    }
  }

  // ------------------------------------------------ recent files

  async function forgetFile(path: string): Promise<void> {
    const d = await db();
    await d.delete('recent', path);
    await d.delete('copies', path);
    const p = parsePath(path);
    if (p?.kind === 'file') {
      handles.delete(p.id);
      await d.delete('handles', p.id);
    }
  }

  async function exists(path: string): Promise<boolean> {
    const p = parsePath(path);
    if (!p) return false;
    if (p.kind === 'file') return !!(await handleFor(p.id));
    return !!(await (await db()).get('copies', path));
  }

  async function addRecent(path: string): Promise<void> {
    const p = parsePath(path);
    if (!p) return;
    try {
      const d = await db();
      await d.put('recent', path, { path, name: p.name.replace(/\.[^.]+$/, ''), openedAt: now() } satisfies RecentFile);
      const all = (await d.all<RecentFile>('recent')).sort((a, b) => b.openedAt - a.openedAt);
      for (const r of all.slice(MAX_RECENT)) await forgetFile(r.path);
    } catch {
      // The list is a convenience.
    }
  }

  // ------------------------------------------------ startup

  const ready = (async () => {
    try {
      await dbp;
    } catch {
      // No IndexedDB here (some private windows): keep things for this visit only.
      dbp = Promise.resolve(memoryDb());
    }
    try {
      // Whatever the last visit left behind unsaved is put aside, the same as a crash in the desktop app.
      await keepCurrent();
      await pruneKept();
    } catch {
      // Tidying is a bonus.
    }
  })();

  // ------------------------------------------------ page events

  env.events?.addEventListener('beforeunload', (e: Event) => {
    if (!docState.dirty) return;
    // The browser shows its own "Leave site?" question. It can't offer Save, so the work is put aside below.
    e.preventDefault();
    (e as BeforeUnloadEvent).returnValue = '';
  });
  env.events?.addEventListener('pagehide', () => {
    if (!docState.dirty) return;
    for (const fn of keepHandlers) void fn().catch(() => undefined);
  });

  const libKey = (kind: LibraryKind, id: string) => `${kind}/${id}`;
  const library: LibraryApi = {
    async list(kind) {
      await ready;
      const d = await db();
      const out: LibraryEntry[] = [];
      for (const k of await d.keys('library')) {
        if (!k.startsWith(`${kind}/`)) continue;
        const v = await d.get<{ bytes: Uint8Array; modified: number }>('library', k);
        if (v) out.push({ id: k.slice(kind.length + 1), size: v.bytes.length, modified: v.modified });
      }
      return out;
    },
    async read(kind, id) {
      await ready;
      const v = await (await db()).get<{ bytes: Uint8Array }>('library', libKey(kind, id));
      return v ? new Uint8Array(v.bytes) : null;
    },
    async write(kind, id, bytes) {
      await ready;
      await (await db()).put('library', libKey(kind, id), { bytes, modified: now() });
    },
    async remove(kind, id) {
      await ready;
      await (await db()).delete('library', libKey(kind, id));
    },
  };

  const api: WebApi = {
    kind: 'web',
    library,
    platform: env.platform,
    versions: { app: env.appVersion, electron: '', chrome: '' },
    ready,
    async receiveFile(f) {
      const path = makePath('copy', newId(), f.name);
      await keepCopy(path, await bytesOf(f)).catch(() => undefined);
      if (openFileHandlers.size) for (const fn of openFileHandlers) fn(path);
      else launchFile = path;
    },
    async receiveFiles(list) {
      const h = list.find((x) => x?.kind === 'file');
      if (!h) return;
      const path = await remember('file', h, true);
      if (openFileHandlers.size) for (const fn of openFileHandlers) fn(path);
      else launchFile = path;
    },
    files: {
      async open() {
        await ready;
        if (env.pickers.showOpenFilePicker) {
          let h: FileHandleLike | undefined;
          try {
            [h] = await env.pickers.showOpenFilePicker({ types: [FRAMELING_TYPE, ASEPRITE_TYPE], id: 'frameling' });
          } catch (e) {
            if (isAbort(e)) return null;
            return { error: friendly(e, 'open') };
          }
          if (!h) return null;
          try {
            const bytes = await bytesOf(await h.getFile());
            return { path: await remember('file', h, true), bytes };
          } catch (e) {
            return { error: friendly(e, 'open') };
          }
        }
        const f = await env.pickUpload('.frameling,.aseprite,.ase');
        if (!f) return null;
        const bytes = await bytesOf(f);
        const path = makePath('copy', newId(), f.name);
        await keepCopy(path, bytes).catch(() => undefined);
        return { path, bytes };
      },
      async openOther({ filters }) {
        await ready;
        const exts = filters.flatMap((f) => f.extensions.map((e) => `.${e}`));
        if (env.pickers.showOpenFilePicker) {
          let h: FileHandleLike | undefined;
          try {
            [h] = await env.pickers.showOpenFilePicker({ types: pickerTypes(filters), id: 'other' });
          } catch (e) {
            if (isAbort(e)) return null;
            return { error: friendly(e, 'open') };
          }
          if (!h) return null;
          try {
            const bytes = await bytesOf(await h.getFile());
            return { path: await remember('file', h, true), bytes };
          } catch (e) {
            return { error: friendly(e, 'open') };
          }
        }
        const f = await env.pickUpload(exts.join(','));
        if (!f) return null;
        // Writing back to an uploaded file can only be a download.
        return { path: makePath('download', newId(), f.name), bytes: await bytesOf(f) };
      },
      async linkPlayable() {
        // The file handle is already kept (remember), which is all a browser can do.
      },
      async read(path) {
        await ready;
        const p = parsePath(path);
        if (!p) return { error: `Frameling can't find that file any more.` };
        try {
          if (p.kind === 'file') {
            const h = await handleFor(p.id);
            if (!h || h.kind !== 'file') return { error: `Frameling can't find that file any more. Open it again with File > Open.` };
            if (!(await allowed(h, 'read'))) return { error: `The browser didn't let Frameling open "${h.name}". Try again, and choose Allow if it asks.` };
            return { path, bytes: await bytesOf(await h.getFile()) };
          }
          const bytes = await (await db()).get<Uint8Array>('copies', path);
          if (!bytes) return { error: `This browser no longer has a copy of "${p.name}". Open it again with File > Open.` };
          return { path, bytes: new Uint8Array(bytes) };
        } catch (e) {
          return { error: friendly(e, 'open') };
        }
      },
      async save({ bytes, path, suggestedName }) {
        await ready;
        const p = path ? parsePath(path) : null;
        const fileName = `${suggestedName.replace(/\.frameling$/i, '')}.frameling`;
        try {
          if (p?.kind === 'file') {
            const h = await handleFor(p.id);
            if (h?.kind === 'file' && (await allowed(h, 'readwrite'))) {
              await writeHandle(h, bytes);
              await addRecent(path!);
              return { path: path! };
            }
          }
          if (env.pickers.showSaveFilePicker) {
            let h: FileHandleLike;
            try {
              h = await env.pickers.showSaveFilePicker({ suggestedName: fileName, types: [FRAMELING_TYPE], id: 'frameling' });
            } catch (e) {
              if (isAbort(e)) return null;
              throw e;
            }
            await writeHandle(h, bytes);
            const saved = await remember('file', h, true);
            await addRecent(saved);
            return { path: saved };
          }
          // No way to write a file in place: download it, and keep a copy so Open recent still works.
          const target = p && (p.kind === 'copy' || p.kind === 'download') ? path! : makePath('copy', newId(), fileName);
          env.download(parsePath(target)!.name, bytes);
          await keepCopy(target, bytes).catch(() => undefined);
          await addRecent(target);
          return { path: target };
        } catch (e) {
          return { error: friendly(e, 'save') };
        }
      },
      async pickExportFile({ suggestedName, filters }) {
        if (env.pickers.showSaveFilePicker) {
          try {
            const h = await env.pickers.showSaveFilePicker({ suggestedName, types: pickerTypes(filters), id: 'export' });
            return await remember('file', h);
          } catch (e) {
            if (isAbort(e)) return null;
            // A type the picker doesn't like: try once more without the types.
            try {
              const h = await env.pickers.showSaveFilePicker({ suggestedName, id: 'export' });
              return await remember('file', h);
            } catch (e2) {
              if (isAbort(e2)) return null;
            }
          }
        }
        return makePath('download', newId(), suggestedName);
      },
      async pickExportFolder({ suggestedName }) {
        if (env.pickers.showDirectoryPicker) {
          try {
            const h = await env.pickers.showDirectoryPicker({ mode: 'readwrite', id: 'export' });
            return await remember('folder', h);
          } catch (e) {
            if (isAbort(e)) return null;
          }
        }
        const base = (suggestedName ?? 'frameling-export').replace(/[\\/:*?"<>|]+/g, '').trim() || 'frameling-export';
        return makePath('zip', newId(), `${base}.zip`);
      },
      async write(path, bytes) {
        const p = parsePath(path);
        if (!p) return { error: 'Frameling can only save to a place you picked.' };
        try {
          if (p.kind === 'download') {
            env.download(p.name, bytes);
            return { ok: true };
          }
          if (p.kind !== 'file') return { error: 'Frameling can only save to a place you picked.' };
          const h = await handleFor(p.id);
          if (h?.kind !== 'file') return { error: 'Frameling can only save to a place you picked.' };
          if (!(await allowed(h, 'readwrite'))) return { error: friendly(Object.assign(new Error(), { name: 'NotAllowedError' }), 'save') };
          await writeHandle(h, bytes);
          return { ok: true };
        } catch (e) {
          return { error: friendly(e, 'save') };
        }
      },
      async writeMany(folder, files) {
        const p = parsePath(folder);
        if (!p || (p.kind !== 'folder' && p.kind !== 'zip')) return { error: 'Frameling can only save to a folder you picked.' };
        const names = files.map((f) => f.name.replace(/[\\/]/g, '_'));
        try {
          if (p.kind === 'zip') {
            const zip = zipSync(Object.fromEntries(files.map((f, i) => [names[i], f.bytes])), { level: 6 });
            env.download(p.name, zip);
            return { paths: [folder] };
          }
          const dir = await handleFor(p.id);
          if (dir?.kind !== 'directory') return { error: 'Frameling can only save to a folder you picked.' };
          if (!(await allowed(dir, 'readwrite'))) return { error: friendly(Object.assign(new Error(), { name: 'NotAllowedError' }), 'save') };
          const existing: string[] = [];
          for (const n of names) {
            try {
              await dir.getFileHandle(n);
              existing.push(n);
            } catch {
              // Not there yet, which is the usual case.
            }
          }
          if (existing.length) {
            const r = await env.ask({
              title: 'Replace files?',
              message: existing.length === 1 ? `There's already a file called "${existing[0]}" in that folder.` : `${existing.length} of these files are already in that folder.`,
              detail: 'Replace it with the new one?',
              buttons: [
                { value: 'replace', label: 'Replace', primary: true },
                { value: 'cancel', label: 'Cancel' },
              ],
              cancel: 'cancel',
            });
            if (r !== 'replace') return null;
          }
          for (let i = 0; i < files.length; i++) await writeHandle(await dir.getFileHandle(names[i], { create: true }), files[i].bytes);
          return { paths: names.map((n) => makePath('folder', p.id, `${dir.name}/${n}`)) };
        } catch (e) {
          return { error: friendly(e, 'save') };
        }
      },
      // A browser can't show a file in its folder.
      showInFolder: async () => undefined,
    },
    recent: {
      async list() {
        await ready;
        const d = await db();
        const all = (await d.all<RecentFile>('recent')).filter((r) => r && typeof r.path === 'string');
        const alive: RecentFile[] = [];
        for (const r of all.sort((a, b) => b.openedAt - a.openedAt)) {
          if (await exists(r.path)) alive.push(r);
          else await forgetFile(r.path);
        }
        return alive;
      },
      async add(path) {
        await ready;
        await addRecent(path);
      },
      async remove(path) {
        await ready;
        await forgetFile(path);
      },
      async clear() {
        await ready;
        const d = await db();
        for (const r of await d.all<RecentFile>('recent')) await forgetFile(r.path);
        await d.clear('recent');
      },
    },
    autosave: {
      async write(bytes: Uint8Array, meta: AutosaveMeta) {
        await ready;
        try {
          await (await db()).put('autosave', 'current', { bytes, note: { ...meta, savedAt: now() } });
          env.onSaved?.();
        } catch {
          // A failed autosave is not worth interrupting someone's drawing for.
        }
      },
      async read(): Promise<AutosaveInfo | null> {
        await ready;
        const cur = await (await db()).get<{ bytes: Uint8Array; note: Note }>('autosave', 'current');
        if (!cur || typeof cur.note?.savedAt !== 'number') return null;
        let fileModifiedAt: number | null = null;
        const p = cur.note.filePath ? parsePath(cur.note.filePath) : null;
        if (p?.kind === 'file') {
          try {
            const h = await handleFor(p.id);
            // Only look without asking: a permission prompt at start-up would be confusing.
            if (h?.kind === 'file' && (!h.queryPermission || (await h.queryPermission({ mode: 'read' })) === 'granted')) fileModifiedAt = (await h.getFile()).lastModified ?? null;
          } catch {
            fileModifiedAt = null;
          }
        }
        return { bytes: new Uint8Array(cur.bytes), meta: { name: cur.note.name, filePath: cur.note.filePath ?? null, docId: cur.note.docId }, savedAt: cur.note.savedAt, fileModifiedAt };
      },
      async clear() {
        await ready;
        await (await db()).delete('autosave', 'current');
      },
      async keep(thumb) {
        await ready;
        try {
          await keepCurrent(thumb);
        } catch {
          // Never stop anything over a safety copy.
        }
      },
      async listKept() {
        await ready;
        await pruneKept();
        const all = await (await db()).all<{ meta: KeptAutosave }>('kept');
        return all.map((k) => k.meta).sort((a, b) => b.keptAt - a.keptAt);
      },
      async readKept(id) {
        await ready;
        const k = await (await db()).get<{ meta: KeptAutosave; bytes: Uint8Array }>('kept', keptId(id));
        return k ? { bytes: new Uint8Array(k.bytes), meta: { name: k.meta.name, filePath: null, docId: keptId(id) } } : null;
      },
      async removeKept(id) {
        await ready;
        await (await db()).delete('kept', keptId(id));
      },
    },
    app: {
      setDocumentState(state) {
        docState = state;
      },
      async getLaunchFile() {
        const f = launchFile;
        launchFile = null;
        return f;
      },
      onOpenFile(handler) {
        openFileHandlers.add(handler);
        if (launchFile) {
          const f = launchFile;
          launchFile = null;
          queueMicrotask(() => handler(f));
        }
        return () => void openFileHandlers.delete(handler);
      },
      // A browser tab can't hold a close open long enough to save, so nothing calls this.
      onSaveBeforeClose: () => () => undefined,
      onKeepUnsaved(handler) {
        keepHandlers.add(handler);
        return () => void keepHandlers.delete(handler);
      },
      async askSaveChanges(name): Promise<SaveChoice> {
        const r = await env.ask({
          title: 'Unsaved changes',
          message: `Save changes to "${String(name).slice(0, 80)}"?`,
          detail: `If you don't save, your latest changes will be lost.`,
          buttons: [
            { value: 'save', label: 'Save', primary: true },
            { value: 'discard', label: `Don't save` },
            { value: 'cancel', label: 'Cancel' },
          ],
          cancel: 'cancel',
        });
        return r === 'save' || r === 'discard' ? r : 'cancel';
      },
    },
  };
  return api;
}
