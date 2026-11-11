/**
 * The shape of `window.frameling`: the page's whole window into the desktop side. Types only, shared by the preload
 * script (which builds it), the main process (which answers it) and the page (which calls it).
 */

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenedFile {
  path: string;
  bytes: Uint8Array;
}

export interface FileFailure {
  /** Friendly, ready to show. */
  error: string;
}

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

export interface DocumentState {
  dirty: boolean;
  name: string;
  filePath: string | null;
}

export interface AutosaveMeta {
  name: string;
  filePath: string | null;
  docId: string;
}

export interface AutosaveInfo {
  bytes: Uint8Array;
  meta: AutosaveMeta;
  savedAt: number;
  /** When the saved file was last changed, if the autosave belongs to a saved file that still exists. */
  fileModifiedAt: number | null;
}

/** An autosave copy kept after "Don't save" (or a crash), for a week. */
export interface KeptAutosave {
  id: string;
  name: string;
  filePath: string | null;
  /** When the copy was made, and when it was put aside. */
  savedAt: number;
  keptAt: number;
  /** A small picture of the first frame, as a data: URL, when one could be made. */
  thumb?: string;
}

export type SaveChoice = 'save' | 'discard' | 'cancel';

/** What the app keeps in its own folder: installed plugins and your templates. */
export type LibraryKind = 'plugins' | 'templates';

export interface LibraryEntry {
  id: string;
  size: number;
  modified: number;
}

/** A small store of files the app keeps for itself (desktop: a folder in the user data dir; web: IndexedDB). */
export interface LibraryApi {
  list(kind: LibraryKind): Promise<LibraryEntry[]>;
  read(kind: LibraryKind, id: string): Promise<Uint8Array | null>;
  write(kind: LibraryKind, id: string, bytes: Uint8Array): Promise<void>;
  remove(kind: LibraryKind, id: string): Promise<void>;
  /** Desktop only: shows the folder in the file manager, so files can be dropped in by hand. */
  showFolder?(kind: LibraryKind): Promise<void>;
}

export interface FramelingApi {
  /** Which kind of home the page has: the desktop app, or a web browser (src/platform). Missing means desktop. */
  kind?: 'desktop' | 'web';
  platform: string;
  versions: { app: string; electron: string; chrome: string };
  files: {
    /** Shows the Open dialog. null means they cancelled. */
    open(): Promise<OpenedFile | FileFailure | null>;
    /** Reads a `.frameling` file (a recent file, a file dropped on the app...). */
    read(path: string): Promise<OpenedFile | FileFailure>;
    /** Writes the bytes to `path`, or asks where first when `path` is null. null means they cancelled. */
    save(opts: { bytes: Uint8Array; path: string | null; suggestedName: string }): Promise<{ path: string } | FileFailure | null>;
    /** Asks where an export should go. null means they cancelled. */
    pickExportFile(opts: { suggestedName: string; filters: FileFilter[]; title?: string }): Promise<string | null>;
    /** `suggestedName` names the zip a browser without folder access downloads instead. */
    pickExportFolder(opts: { title?: string; suggestedName?: string }): Promise<string | null>;
    /** Writes to a path that pickExportFile returned. */
    write(path: string, bytes: Uint8Array): Promise<{ ok: true } | FileFailure>;
    /** Writes several files into a folder that pickExportFolder returned. null means they chose not to replace existing files. */
    writeMany(folder: string, files: { name: string; bytes: Uint8Array }[]): Promise<{ paths: string[] } | FileFailure | null>;
    showInFolder(path: string): Promise<void>;
    /** Shows the Open dialog for other kinds of file (a plugin, a template, an Interactives package). null means they cancelled. */
    openOther?(opts: { filters: FileFilter[]; title?: string }): Promise<OpenedFile | FileFailure | null>;
    /** Desktop only: pick a folder and read the files in it (a plugin being worked on). Small folders only. */
    readFolder?(opts: { title?: string }): Promise<{ path: string; files: { name: string; bytes: Uint8Array }[] } | FileFailure | null>;
    /** Lets Frameling write back to an Interactives package it opened, in later sessions too. */
    linkPlayable?(path: string): Promise<void>;
  };
  library?: LibraryApi;
  recent: {
    list(): Promise<RecentFile[]>;
    add(path: string): Promise<void>;
    remove(path: string): Promise<void>;
    clear(): Promise<void>;
  };
  autosave: {
    write(bytes: Uint8Array, meta: AutosaveMeta): Promise<void>;
    read(): Promise<AutosaveInfo | null>;
    clear(): Promise<void>;
    /** Puts the current autosave copy aside for 7 days (replacing an older one for the same drawing). */
    keep(thumb?: string): Promise<void>;
    listKept(): Promise<KeptAutosave[]>;
    readKept(id: string): Promise<{ bytes: Uint8Array; meta: AutosaveMeta } | null>;
    removeKept(id: string): Promise<void>;
  };
  app: {
    /** Tells the window about the document (title bar dot on macOS, "Save changes?" on close). */
    setDocumentState(state: DocumentState): void;
    /** The file the app was launched with, once. */
    getLaunchFile(): Promise<string | null>;
    /** Called when a `.frameling` file is opened while the app is already running. Returns an unsubscribe function. */
    onOpenFile(handler: (path: string) => void): () => void;
    /** Called when the window is closing with unsaved changes and they chose Save. Resolve true once saved, false to stay open. */
    onSaveBeforeClose(handler: () => Promise<boolean>): () => void;
    /** Called when the window is closing and they chose "Don't save": put the work aside, then resolve. */
    onKeepUnsaved(handler: () => Promise<void>): () => void;
    /** The "Save changes?" question as a native dialog. */
    askSaveChanges(name: string): Promise<SaveChoice>;
  };
}
