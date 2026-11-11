// Everything the page can ask of the desktop side. Each handler answers a named message from preload.ts, and nothing
// else is reachable. The page can only write to places a person picked in a dialog (or a file they opened).
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AutosaveMeta, DocumentState, FileFilter, SaveChoice } from '../preload/api';
import { addRecent, clearAutosave, clearRecent, keepAutosave, lastDir, listKept, listRecent, readAutosave, readKept, rememberDir, removeKept, removeRecent, writeAutosave, writeFileAtomic } from './store';

const FILTERS: FileFilter[] = [{ name: 'Frameling drawings', extensions: ['frameling'] }];
const MAX_OPEN_BYTES = 1024 * 1024 * 1024;

export interface IpcHooks {
  window(): BrowserWindow | null;
  /** The file the app was started with, handed over once. */
  takeLaunchFile(): string | null;
  setDocumentState(s: DocumentState): void;
  saveBeforeCloseDone(ok: boolean): void;
  keepUnsavedDone(): void;
}

// Paths people picked in dialogs this session (or opened). Writes anywhere else are refused.
const granted = new Set<string>();
const grantedFolders = new Set<string>();
const key = (p: string) => path.resolve(p);

export function grantFile(p: string): void {
  granted.add(key(p));
}

/** A raw system error as a sentence a person can act on. */
function friendly(e: unknown, doing: string): string {
  const code = (e as NodeJS.ErrnoException)?.code;
  if (code === 'EACCES' || code === 'EPERM') return `Frameling isn't allowed to ${doing} there. Try a different folder.`;
  if (code === 'ENOSPC') return `There isn't enough space on that disk to ${doing}.`;
  if (code === 'ENOENT') return `Frameling couldn't find that file or folder.`;
  if (code === 'EBUSY') return `That file is in use by another program. Close it there and try again.`;
  return `Something went wrong while trying to ${doing}. Try a different place?`;
}

function readFile(p: string): { path: string; bytes: Uint8Array } | { error: string } {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return { error: `That isn't a file Frameling can open.` };
    if (st.size > MAX_OPEN_BYTES) return { error: 'That file is too big to open.' };
    grantFile(p);
    return { path: p, bytes: new Uint8Array(fs.readFileSync(p)) };
  } catch (e) {
    return { error: friendly(e, 'open that file') };
  }
}

/** Keeps a file name safe to write inside a folder: no folders, no characters Windows refuses. */
export function safeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/')).replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim();
  return base && base !== '.' && base !== '..' ? base : 'file';
}

// TEST AUTOMATION. Only when FRAMELING_AUTOMATION_DIR is set (scripts/e2e/*.cjs does that, nothing else ever does):
// the save dialogs are skipped and answer with a file inside that folder, named from the suggested name, so a script
// can run Save As and every export without anyone clicking. With the variable unset this returns null and the real
// dialogs run as normal. Names are cut down to a bare file name first, so nothing can point outside the folder.
function automationTarget(suggestedName: string, forceExt?: string): string | null {
  const dir = process.env.FRAMELING_AUTOMATION_DIR;
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  let name = safeFileName(suggestedName);
  if (forceExt && !name.toLowerCase().endsWith(forceExt)) name += forceExt;
  return path.join(path.resolve(dir), name);
}

export function registerIpc(hooks: IpcHooks): void {
  // Only our own window may ask.
  const trusted = (e: IpcMainInvokeEvent) => e.sender === hooks.window()?.webContents;
  const handle = (channel: string, fn: (e: IpcMainInvokeEvent, ...args: any[]) => unknown) => {
    ipcMain.handle(channel, (e, ...args) => {
      if (!trusted(e)) throw new Error('Not allowed');
      return fn(e, ...args);
    });
  };

  handle('files:open', async () => {
    const win = hooks.window();
    const r = await dialog.showOpenDialog(win!, { title: 'Open a drawing', defaultPath: lastDir(), properties: ['openFile'], filters: FILTERS });
    if (r.canceled || !r.filePaths[0]) return null;
    rememberDir(r.filePaths[0]);
    return readFile(r.filePaths[0]);
  });

  handle('files:read', (_e, p: string) => {
    if (typeof p !== 'string') return { error: 'That is not a file path.' };
    // Opened by double-click, a recent entry or a drop: anything that ends in .frameling, or that was picked before.
    if (!granted.has(key(p)) && path.extname(p).toLowerCase() !== '.frameling') return { error: 'Frameling only opens .frameling files.' };
    return readFile(p);
  });

  handle('files:save', async (_e, opts: { bytes: Uint8Array; path: string | null; suggestedName: string }) => {
    let target = opts.path;
    if (target && !granted.has(key(target))) target = null;
    if (!target) {
      const auto = automationTarget(opts.suggestedName.replace(/\.frameling$/i, '') + '.frameling');
      if (auto) {
        target = auto;
        grantFile(target);
      } else {
        const r = await dialog.showSaveDialog(hooks.window()!, {
          title: 'Save your drawing',
          defaultPath: path.join(lastDir(), safeFileName(opts.suggestedName).replace(/\.frameling$/i, '') + '.frameling'),
          filters: FILTERS,
        });
        if (r.canceled || !r.filePath) return null;
        target = /\.frameling$/i.test(r.filePath) ? r.filePath : r.filePath + '.frameling';
        grantFile(target);
        rememberDir(target);
      }
    }
    try {
      writeFileAtomic(target, Buffer.from(opts.bytes));
    } catch (e) {
      return { error: friendly(e, 'save') };
    }
    addRecent(target);
    return { path: target };
  });

  handle('files:pickExportFile', async (_e, opts: { suggestedName: string; filters: FileFilter[]; title?: string }) => {
    const exts = opts.filters.flatMap((f) => f.extensions);
    const auto = automationTarget(opts.suggestedName, exts[0] ? '.' + exts[0] : undefined);
    if (auto) {
      grantFile(auto);
      return auto;
    }
    const r = await dialog.showSaveDialog(hooks.window()!, {
      title: opts.title ?? 'Export',
      defaultPath: path.join(lastDir(), safeFileName(opts.suggestedName)),
      filters: opts.filters,
    });
    if (r.canceled || !r.filePath) return null;
    let file = r.filePath;
    if (exts.length && !exts.some((x) => file.toLowerCase().endsWith('.' + x.toLowerCase()))) file += '.' + exts[0];
    grantFile(file);
    rememberDir(file);
    return file;
  });

  handle('files:pickExportFolder', async (_e, opts: { title?: string }) => {
    // Automation (see automationTarget): the folder is the automation folder itself.
    const autoDir = process.env.FRAMELING_AUTOMATION_DIR;
    if (autoDir) {
      const folder = path.resolve(autoDir);
      fs.mkdirSync(folder, { recursive: true });
      grantedFolders.add(key(folder));
      return folder;
    }
    const r = await dialog.showOpenDialog(hooks.window()!, { title: opts.title ?? 'Choose a folder', defaultPath: lastDir(), properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Use this folder' });
    if (r.canceled || !r.filePaths[0]) return null;
    grantedFolders.add(key(r.filePaths[0]));
    rememberDir(path.join(r.filePaths[0], 'x'));
    return r.filePaths[0];
  });

  handle('files:write', (_e, p: string, bytes: Uint8Array) => {
    if (typeof p !== 'string' || !granted.has(key(p))) return { error: `Frameling can only save to a place you picked.` };
    try {
      writeFileAtomic(p, Buffer.from(bytes));
      return { ok: true };
    } catch (e) {
      return { error: friendly(e, 'save') };
    }
  });

  handle('files:writeMany', async (_e, folder: string, files: { name: string; bytes: Uint8Array }[]) => {
    if (typeof folder !== 'string' || !grantedFolders.has(key(folder))) return { error: `Frameling can only save to a folder you picked.` };
    const targets = files.map((f) => ({ file: path.join(folder, safeFileName(f.name)), bytes: f.bytes }));
    const existing = targets.filter((t) => fs.existsSync(t.file)).map((t) => path.basename(t.file));
    if (existing.length) {
      const r = await dialog.showMessageBox(hooks.window()!, {
        type: 'question',
        message: existing.length === 1 ? `There's already a file called "${existing[0]}" in that folder.` : `${existing.length} of these files are already in that folder.`,
        detail: 'Replace it with the new one?',
        buttons: ['Replace', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      });
      if (r.response !== 0) return null;
    }
    try {
      for (const t of targets) writeFileAtomic(t.file, Buffer.from(t.bytes));
    } catch (e) {
      return { error: friendly(e, 'save') };
    }
    return { paths: targets.map((t) => t.file) };
  });

  handle('files:showInFolder', (_e, p: string) => {
    if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p);
  });

  handle('recent:list', () => listRecent());
  handle('recent:add', (_e, p: string) => {
    if (typeof p === 'string') addRecent(p);
  });
  handle('recent:remove', (_e, p: string) => removeRecent(p));
  handle('recent:clear', () => clearRecent());

  handle('autosave:write', (_e, bytes: Uint8Array, meta: AutosaveMeta) => {
    try {
      writeAutosave(bytes, meta);
    } catch {
      // A failed autosave is not worth interrupting someone's drawing for.
    }
  });
  handle('autosave:read', () => readAutosave());
  handle('autosave:clear', () => clearAutosave());
  handle('autosave:keep', (_e, thumb?: string) => {
    try {
      keepAutosave(typeof thumb === 'string' ? thumb : undefined);
    } catch {
      // Putting a copy aside is a bonus; never let it stop a close.
    }
  });
  handle('autosave:listKept', () => listKept());
  handle('autosave:readKept', (_e, id: string) => (typeof id === 'string' ? readKept(id) : null));
  handle('autosave:removeKept', (_e, id: string) => {
    if (typeof id === 'string') removeKept(id);
  });

  handle('app:launchFile', () => hooks.takeLaunchFile());

  handle('app:askSaveChanges', async (_e, name: string): Promise<SaveChoice> => {
    const r = await dialog.showMessageBox(hooks.window()!, {
      type: 'question',
      message: `Save changes to "${String(name).slice(0, 80)}"?`,
      detail: `If you don't save, your latest changes will be lost.`,
      buttons: ['Save', `Don't save`, 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    return r.response === 0 ? 'save' : r.response === 1 ? 'discard' : 'cancel';
  });

  ipcMain.on('app:documentState', (e, s: DocumentState) => {
    if (e.sender !== hooks.window()?.webContents) return;
    hooks.setDocumentState({ dirty: !!s?.dirty, name: String(s?.name ?? 'Untitled'), filePath: typeof s?.filePath === 'string' ? s.filePath : null });
  });
  ipcMain.on('app:keepUnsavedDone', (e) => {
    if (e.sender !== hooks.window()?.webContents) return;
    hooks.keepUnsavedDone();
  });
  ipcMain.on('app:saveBeforeCloseDone', (e, ok: boolean) => {
    if (e.sender !== hooks.window()?.webContents) return;
    hooks.saveBeforeCloseDone(!!ok);
  });

  app.on('will-quit', () => {
    granted.clear();
    grantedFolders.clear();
  });
}
