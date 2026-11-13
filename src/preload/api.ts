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
  /** A small picture of the drawing. Only the web version sends one: a closing tab has no time to draw it when the work is put aside. */
  thumb?: string;
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

/** What the app keeps in its own folder: installed plugins, your templates, and version history. */
export type LibraryKind = 'plugins' | 'templates' | 'versions' | 'versions-index';

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

/** A screen as the computer reports it: sizes in its own units (before any interface size), and its scale factor. */
export interface DisplayInfo {
  id: number;
  width: number;
  height: number;
  scaleFactor: number;
  /** The part of the screen windows can use (without taskbars and docks). */
  workWidth: number;
  workHeight: number;
  windowWidth: number;
  windowHeight: number;
}

/** One request to the board that beta reports go to, made by the desktop side so a failure comes back with its real reason. */
export interface BetaBridge {
  request(req: { url: string; method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }): Promise<{ status: number; type: string; text: string } | { code: string; message?: string }>;
}

export interface FramelingApi {
  /** Which kind of home the page has: the desktop app, or a web browser (src/platform). Missing means desktop. */
  kind?: 'desktop' | 'web';
  platform: string;
  versions: { app: string; electron: string; chrome: string };
  /** Linux only: which kind of desktop session this is, for the pen report (pens reach the app differently on Wayland and X11). */
  session?: { type: string; desktop: string; wayland: boolean; x11: boolean; ozone: string };
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
  /** Video helpers that need programs on the computer (missing in a browser). */
  media?: {
    /** Whether ffmpeg is there to turn a video's sound into AAC. */
    aacAvailable(): Promise<boolean>;
    /** An MP4 with its sound turned into AAC (the picture untouched), or null when it couldn't be done. */
    toAac(bytes: Uint8Array): Promise<Uint8Array | null>;
  };
  library?: LibraryApi;
  /** Desktop only: what the plugin watchdog can see. */
  plugins?: {
    /** Bytes of memory held by each running plugin's sandbox, by plugin id (a plugin without a process of its own is left out). */
    memory(): Promise<Record<string, number>>;
    /** Whether this run gives each plugin's sandbox its own process (only after a restart with "Measure plugins' memory and speed" on). */
    isolated?(): Promise<boolean>;
    /** Remembers the "Measure plugins' memory and speed" choice for the next start. */
    setDiagnostics?(on: boolean): Promise<void>;
  };
  /** Desktop only: the fonts installed on this computer. */
  fonts?: {
    /** The PostScript name of each font (family, weight 100 to 900, slant) as installed here, null where it is not installed. */
    psNames(wants: { family: string; weight: number; italic: boolean }[]): Promise<(string | null)[]>;
  };
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
  /** Video made by FFmpeg on this computer (desktop only; missing in the web version). */
  video?: {
    /** Whether FFmpeg is here and can make ProRes, and if not why, in plain words. */
    probe(): Promise<{ ok: boolean; reason?: string; version?: string }>;
    /** Starts a ProRes 4444 .mov at a path pickExportFile returned. Frames are raw RGBA, `width * height * 4` bytes. */
    start(path: string, opts: { width: number; height: number; fps: number; alpha: boolean }): Promise<{ id: number } | FileFailure>;
    frame(id: number, rgba: Uint8Array): Promise<{ ok: true } | FileFailure>;
    finish(id: number): Promise<{ ok: true } | FileFailure>;
    cancel(id: number): Promise<void>;
  };
  /** Sends beta reports (src/beta). Missing in the web build, which uses the page's own fetch. */
  beta?: BetaBridge;
  app: {
    /** How big the whole interface is drawn, 0.5 to 3 (1 is the usual size). Everything stays crisp. */
    setUiScale?(factor: number): void;
    /** The screen the window is on right now. */
    getDisplay?(): Promise<DisplayInfo | null>;
    /** Called when the window is dragged onto another screen, or a screen changes size. Returns an unsubscribe function. */
    onDisplayChanged?(handler: (d: DisplayInfo) => void): () => void;
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
