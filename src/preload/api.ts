/**
 * The shape of `window.frameling`: the page's whole window into the desktop side. Types only, shared by the preload
 * script (which builds it), the main process (which answers it) and the page (which calls it).
 */

import type { CpuInfo } from '../gpu/cpu';
import type { SaveChoice } from '../shared/saveQuestion';

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
  /** The file has gone (a drive unplugged, moved). It stays on the list so it can be removed or found again. */
  missing?: boolean;
}

/** What to show for a recent drawing: its little picture, nothing (an older file, or one that can't be read), or "the file has gone". */
export type RecentPreview = { state: 'picture'; url: string } | { state: 'none' } | { state: 'missing' };

export interface DocumentState {
  dirty: boolean;
  name: string;
  filePath: string | null;
  /** Stream-safe is on: keep the file's path out of the window's title bar (the Mac icon). */
  hidePath?: boolean;
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

export type { SaveChoice };

/** What the app keeps in its own folder: installed plugins, your templates, version history and the pictures of a timelapse. */
export type LibraryKind = 'plugins' | 'templates' | 'versions' | 'versions-index' | 'timelapse';

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

/** What the desktop side knows about a crash it found when Frameling started. Plain facts, nothing about what was drawn. */
export interface CrashNotes {
  /** `killed`: stopped without closing properly. `window`: the drawing window crashed. `both`: the window crashed, then the app stopped without closing. */
  how: 'killed' | 'window' | 'both';
  /** When the run that crashed began (milliseconds since 1970). */
  startedAt: number;
  version: string;
  platform: string;
  /** Plain lines about what went wrong, such as how the window crashed. */
  events: string[];
  /** What was cheap to note about how that run ended. Absent in notes from older versions. */
  facts?: RunFacts;
}

/** Whole numbers and one yes or no about a run that ended badly, enough to tell a power cut from the system running out of memory. */
export interface RunFacts {
  /** About how many minutes the run lasted, up to the last sign of life. */
  ranMinutes?: number;
  /** The computer itself started again after the last sign of life (a restart or a power cut). */
  restarted?: boolean;
  /** The most Frameling used in that run, in MB, to the nearest 50. */
  peakMB?: number;
  /** The least memory the computer had free in that run, in MB, to the nearest 50. */
  lowestFreeMB?: number;
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

/** Going live with OBS (src/streamsafe/obsLink.ts, src/main/obs.ts): the connection lives on the desktop side, and so does the password, which never comes up to the page. */
export interface ObsBridge {
  /** Whether a password can be kept safely on this computer, and whether there is one (saved or for this session). */
  status(): Promise<{ canSave: boolean; hasPassword: boolean }>;
  /** Hands over the password, or null to forget it. `remember` keeps it across restarts where the computer has a real key store. */
  setPassword(password: string | null, remember: boolean): Promise<{ hasPassword: boolean; saved: boolean }>;
  /** Tries to reach OBS. Never throws: a missing OBS is an answer, not an error. */
  connect(address: string): Promise<{ ok: true; streaming: boolean; recording: boolean } | { ok: false; why: 'unreachable' | 'password' | 'refused' | 'address' }>;
  disconnect(): Promise<void>;
  /** Streaming or recording started or stopped, or OBS went away. Returns the way to stop listening. */
  onEvent(handler: (e: { type: 'output'; kind: 'stream' | 'record'; active: boolean } | { type: 'closed' }) => void): () => void;
}

/** Sending a drawing with a code over the peer network (src/share, src/main/share.ts). The network lives on the desktop side. */
export interface ShareBridge {
  /** Makes a code and waits for somebody to use it. Everything after that arrives as events. */
  send(bytes: Uint8Array, opts: { minutes: number }): Promise<{ ok: boolean }>;
  /** Looks for the sender by the code and checks the secret words with them. `ok` is false when the words are not a code. */
  receive(code: string): Promise<{ ok: boolean }>;
  /** Stops whatever is running and lets the network go. */
  cancel(): Promise<void>;
  /** What is happening, as it happens. Returns the way to stop listening. */
  onEvent(handler: (e: import('../share/types').ShareEvent) => void): () => void;
}

/** Live review (src/review, src/main/review*.ts): a reviewer follows your drawing and sends a pointer and notes back. The link, the port and the reviewer's window are on the desktop side. */
export interface ReviewBridge {
  /** Makes a code and waits. `name` is the drawing's name, told to a reviewer who comes in. Everything after arrives as events. */
  start(name: string): Promise<{ ok: boolean }>;
  stop(): Promise<void>;
  /** Let in somebody who knocked (`conn` is from their knock event). */
  admit(conn: number): Promise<void>;
  refuse(conn: number): Promise<void>;
  /** Send a reviewer away. */
  remove(seat: number): Promise<void>;
  /** Your pointer, in stage pixels. Fire and forget: it is allowed to be dropped. */
  pointer(x: number, y: number, off?: boolean): Promise<void>;
  /** These things of a reviewer's are safe in the inbox. */
  ack(seat: number, ids: string[]): Promise<void>;
  /** Opens a review window for somebody else's code. `ok` is false when the words are not a code. */
  join(code: string, name: string): Promise<{ ok: boolean }>;
  /** The code from a frameling://review link that is waiting to be asked about, once. It joins nothing: ask the person first, then `join`. */
  takeLink(): Promise<string | null>;
  /** Called when a review link has come in (then call `takeLink`). Returns an unsubscribe function. */
  onLink(handler: () => void): () => void;
  onEvent(handler: (e: import('../main/reviewHost').HostUiEvent) => void): () => void;
}

/** Connecting to Twitch (src/twitch, src/main/twitch*.ts). The sign-in and the connection live on the desktop side; no token ever comes up to the page, and no viewer's name unless `listen` is asked for names (a Quill welcome link is on). Missing in the web build. */
export interface TwitchBridge {
  status(): Promise<import('../shared/twitch').TwitchStatus>;
  /** Starts signing in for these kinds of event. Resolves once there is a code to approve; the approval finishes by itself and arrives as a status. */
  signIn(kinds: import('../shared/twitch').TwitchKind[]): Promise<import('../shared/twitch').TwitchStatus>;
  /** The code to show while a sign-in waits. Only asked for when it is about to be drawn, and never while stream-safe mode is on. */
  code(): Promise<{ userCode: string; expiresAt: number } | null>;
  /** Opens Twitch's approval page (with the code filled in) in the browser. */
  openApproval(): Promise<boolean>;
  /** Copies that page's address, so it can be pasted into a browser on a screen that is not being shared. */
  copyApproval(): Promise<boolean>;
  cancelSignIn(): Promise<void>;
  /** Tells Twitch to cancel the sign-in and forgets it here. `revoked` is false when Twitch could not be reached. */
  signOut(): Promise<{ revoked: boolean }>;
  /** Starts listening (the audience switch does this through the door). */
  /** `names`: also read each viewer's display name (only when a Quill welcome link is on and names are allowed). */
  listen(kinds: import('../shared/twitch').TwitchKind[], names?: boolean): Promise<import('../shared/twitch').TwitchStatus>;
  stop(): Promise<void>;
  rewards(): Promise<import('../shared/twitch').TwitchRewardsAnswer>;
  /** Signs in with the streamer's own Twitch app instead (a client id), or null for this build's own. */
  setApp(clientId: string | null): Promise<import('../shared/twitch').TwitchStatus>;
  onStatus(handler: (s: import('../shared/twitch').TwitchStatus) => void): () => void;
  onEvent(handler: (e: import('../shared/twitch').TwitchEvent) => void): () => void;
}

/** Looking for a newer release and putting it in (src/main/update.ts, src/update). Missing in the web build. */
export interface UpdateBridge {
  /** What this copy is and how an update would be put in. */
  facts(): Promise<import('../update/logic').UpdateFacts>;
  /** This project's releases from GitHub. Only asked when the switch is on (or you pressed Check for updates). */
  releases(): Promise<{ ok: true; releases: import('../update/logic').Release[] } | { ok: false; message: string }>;
  /** Update now: gets the file for that release and puts it in. Nothing is downloaded before this. */
  install(tag: string): Promise<{ ok: true; next: 'restart' | 'installer' } | { ok: false; message: string }>;
  /** Opens a release's page in the browser. */
  openPage(url: string): Promise<void>;
  /** The installer is open: close so it can finish. (A swapped AppImage restarts through app.restart instead.) */
  finish(): Promise<void>;
  /** How far the download has got, 0 to 100. Returns an unsubscribe function. */
  onProgress(handler: (pct: number) => void): () => void;
}

/** The actions door: a little web server on this computer that Streamer.bot, Firebot or a Stream Deck can call (src/main/actionsDoor.ts, src/streamdoor). Missing in the web build. */
export interface DoorBridge {
  /** Opens the door on a port. With `fallback` a busy port moves on to the next free one. */
  open(port: number, fallback: boolean): Promise<import('../shared/streamDoor').DoorStatus>;
  close(): Promise<void>;
  status(): Promise<import('../shared/streamDoor').DoorStatus>;
  /** The key a tool must send. Only the settings screen asks, when the person reveals or copies it. */
  key(): Promise<string>;
  /** Makes a new key; the old one stops working at once. */
  roll(): Promise<string>;
  /** Called with each question the door has for the page. Answer it with `answer`. Returns an unsubscribe function. */
  onAsk(handler: (id: number, op: import('../shared/streamDoor').DoorAsk) => void): () => void;
  answer(id: number, answer: unknown): Promise<void>;
}

/** The stream overlay: a page on the actions door's server that OBS loads as a browser source (src/main/overlayHandler.ts, src/streamoverlay). Missing in the web build. */
export interface OverlayBridge {
  /** Says whether the overlay is wanted. Off, every overlay address answers as if it were not there. */
  setOn(on: boolean): Promise<void>;
  /** What is going on, for the overlay to show. Cleaned again on the desktop side before it is ever served. */
  push(state: unknown): Promise<void>;
  /** The full address (with its token), or '' while the actions door is closed. */
  url(): Promise<string>;
  /** Makes a new token. The old address stops working at once. */
  roll(): Promise<void>;
}

/** One graphics card the computer has, as Electron reports it. */
export interface GpuDevice {
  vendorId: number;
  deviceId: number;
  /** The one drawing the window. */
  active: boolean;
  name?: string;
  driver?: string;
  /** A card with its own memory, as opposed to the onboard one (known on Linux; NVIDIA counts everywhere). */
  discrete?: boolean;
  /** The system has the card set aside (for a virtual machine, say), so nothing on this computer can draw on it. */
  reserved?: boolean;
}

/** What the desktop side found out about drawing, raw. src/gpu/describe.ts turns it into plain words. */
export interface GpuReport {
  platform: string;
  arch: string;
  electron: string;
  chromium: string;
  devices: GpuDevice[];
  glRenderer?: string;
  /** What a page's own WebGL says it is drawing on. The one answer that cannot be stale; the card in use is read from it. */
  liveRenderer?: string;
  /** What Frameling asked the system for about which card to use, in plain words, when it asked for anything. */
  asked?: string;
  glVendor?: string;
  glVersion?: string;
  /** For example "(gl=egl-angle,angle=vulkan)": which way the browser engine talks to the card. */
  glImplementation?: string;
  skia?: string;
  /** The engine's own verdict per job: "enabled_on", "disabled_software", "disabled_off" and so on. */
  features: Record<string, string>;
  hardwareAcceleration: boolean;
  /** The command line switches that matter for drawing, as they were given. */
  flags: string[];
  off: { file: boolean; env: boolean; path: string };
  /** Memory the graphics process holds, and all of Frameling's processes together, in kilobytes. */
  gpuKb: number;
  appKb: number;
  /** The card's own memory, when the system says (Linux with an AMD card). */
  vramBytes?: number;
  /** The processor: model, cores, threads, architecture (src/gpu/cpu.ts). */
  cpu?: CpuInfo;
  /** How much memory the computer has in all, not what Frameling holds. */
  memoryBytes?: number;
}

/** The graphics page of Preferences. Missing in the web build, where the browser decides how to draw. */
export interface GpuBridge {
  report(): Promise<GpuReport>;
  /** Writes or removes the gpu-off file. Takes effect at the next start. */
  setHardware(on: boolean): Promise<{ ok: true; path: string } | FileFailure>;
}

/** The system clipboard, for pictures and text. Missing in a plain browser tab, where the page's own clipboard is used. */
export interface ClipboardBridge {
  /** The picture on the clipboard as PNG bytes, or null when there isn't one. `ours` is true when this app put it there. */
  readPicture(): Promise<{ png: Uint8Array; ours: boolean } | null>;
  writePicture(png: Uint8Array): Promise<boolean>;
  writeText(text: string): Promise<boolean>;
}

export interface PopoutBridge {
  /**
   * Opens the picture window, or brings it forward when it is already open. A fresh link to the drawing arrives as a window
   * message. With `capture` it is the capture view (no title bar, a name that does not show the drawing's); asking again with
   * another `size` resizes it. Anything missing means the plain second window.
   */
  open(o?: { capture?: boolean; size?: { width: number; height: number } | null; background?: string }): Promise<void>;
  /** Called with `capture` or `second` each time a link arrives, so the drawing window knows which kind of window it is talking to. */
  onMode(handler: (mode: 'capture' | 'second') => void): () => void;
  close(): Promise<void>;
  isOpen(): Promise<boolean>;
  /** Called when the picture window has gone, however it went. Returns an unsubscribe function. */
  onClosed(handler: () => void): () => void;
}

/** The Stream control board: a window of buttons for a second screen. The link to the drawing window is a message port, handed over as a window message (see src/streamboard/link.ts). */
export interface StreamboardBridge {
  /** Opens the board, or brings it forward. `top` keeps it above other windows. */
  open(top: boolean): Promise<void>;
  close(): Promise<void>;
  isOpen(): Promise<boolean>;
  /** Brings the drawing window forward, for a button that opens a setup dialog there. */
  raiseMain(): Promise<void>;
  /** True while the board is on a different screen from the drawing window. */
  apart(): Promise<boolean>;
  /** Called when the board moves to another screen, or back. Returns an unsubscribe function. */
  onApart(handler: (apart: boolean) => void): () => void;
  /** Called when the board has gone, however it went. Returns an unsubscribe function. */
  onClosed(handler: () => void): () => void;
}

export interface FramelingApi {
  /** Which kind of home the page has: the desktop app, or a web browser (src/platform). Missing means desktop. */
  kind?: 'desktop' | 'web';
  platform: string;
  versions: { app: string; electron: string; chrome: string };
  /** Linux only: which kind of desktop session this is, for the pen report (pens reach the app differently on Wayland and X11). */
  session?: { type: string; desktop: string; wayland: boolean; x11: boolean; ozone: string };
  /** Switches read from the environment once at start-up, for measuring (see src/export/readback.ts). Missing means every default. */
  tuning?: { exportReadback?: boolean };
  files: {
    /** Shows the Open dialog. null means they cancelled. */
    open(): Promise<OpenedFile | FileFailure | null>;
    /** Reads a `.frameling` file (a recent file, a file dropped on the app...). */
    read(path: string): Promise<OpenedFile | FileFailure>;
    /** Writes the bytes to `path`, or asks where first when `path` is null. null means they cancelled. */
    save(opts: { bytes: Uint8Array; path: string | null; suggestedName: string; copy?: { avoid: string | null } }): Promise<{ path: string } | FileFailure | null>;
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
    /** The little picture of a drawing on the list. Reads a few KB from the file, never the drawing. Optional: web and older builds. */
    preview?(path: string): Promise<RecentPreview>;
    /** Keeps a picture for a drawing that had none of its own (an older file), so the list can show it. Only for files on the list. */
    keepPreview?(path: string, png: Uint8Array): Promise<void>;
  };
  autosave: {
    /** Resolves false when the copy could not be written. */
    write(bytes: Uint8Array, meta: AutosaveMeta): Promise<boolean | void>;
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
  /** Watching OBS for going live (desktop only). */
  obs?: ObsBridge;
  /** Send and receive a drawing with a code (desktop only). */
  share?: ShareBridge;
  /** Live review (desktop only). */
  review?: ReviewBridge;
  /** Connect Twitch (desktop only). */
  twitch?: TwitchBridge;
  /** Looking for a newer Frameling on GitHub, and putting it in when you say so (desktop only). */
  update?: UpdateBridge;
  /** The local actions door for stream tools (desktop only). */
  door?: DoorBridge;
  /** The stream overlay page for OBS, on the door's server (desktop only). */
  overlay?: OverlayBridge;
  /** Pictures and text to and from the system clipboard (desktop only). */
  clipboard?: ClipboardBridge;
  /** What the app found out about the graphics card, and the switch for hardware drawing (Preferences > Performance). */
  gpu?: GpuBridge;
  /** The picture window: a second window that shows the drawing big (desktop only). The link between the two pages is a message port, handed over as a window message (see src/popout/link.ts). */
  popout?: PopoutBridge;
  /** The Stream control board, a window of buttons for a second screen (desktop only). */
  streamboard?: StreamboardBridge;
  app: {
    /** How big the whole interface is drawn, 0.5 to 3 (1 is the usual size). Everything stays crisp. */
    setUiScale?(factor: number): void;
    /** The notes of the last crash found, and whether Quill has offered them yet. Null when there has been none. Missing in the web build. */
    getLastCrash?(): Promise<{ notes: CrashNotes; offered: boolean } | null>;
    /** Quill has offered the notes (or said what happened), so he won't turn up for them again. */
    crashOffered?(): void;
    /** The screen the window is on right now. */
    getDisplay?(): Promise<DisplayInfo | null>;
    /** Called when the window is dragged onto another screen, or a screen changes size. Returns an unsubscribe function. */
    onDisplayChanged?(handler: (d: DisplayInfo) => void): () => void;
    /** Tells the window about the document (title bar dot on macOS, "Save changes?" on close). */
    setDocumentState(state: DocumentState): void;
    /** The file the app was launched with, once. */
    getLaunchFile(): Promise<string | null>;
    /**
     * Restart: closes and opens again with the drawing and the window as they were. `view` is where the person is in the
     * drawing. `carry` says the unsaved work is already safe in the autosave copy: then nothing is asked and it comes back
     * still unsaved. Without it, it closes the way closing does (asking about unsaved work first). Says no, in plain words, when this copy can't open
     * itself again; then nothing is closed. Use `restartFrameling()` in src/io/restart.ts, not this.
     */
    restart(view: { frame?: number; layerId?: string; zoom?: number; panX?: number; panY?: number; hadUndo?: boolean }, carry?: boolean): Promise<{ ok: true; carried: boolean } | { ok: false; message: string }>;
    /** What a restart left for this start (the drawing and where the person was in it), once. Null on an ordinary start. */
    getRestore(): Promise<{ file: string | null; view: { frame?: number; layerId?: string; zoom?: number; panX?: number; panY?: number; hadUndo?: boolean }; carry?: boolean } | null>;
    /** Called when a `.frameling` file is opened while the app is already running. Returns an unsubscribe function. */
    onOpenFile(handler: (path: string) => void): () => void;
    /** Called when the window is closing with unsaved changes and they chose Save. Resolve true once saved, false to stay open. */
    onSaveBeforeClose(handler: () => Promise<boolean>): () => void;
    /** Called when the window is closing and they chose "Don't save": put the work aside, then resolve. */
    onKeepUnsaved(handler: () => Promise<void>): () => void;
    /** The "Save changes?" question as the system's own box. The page uses it only when it can't show Quill's dialog. */
    askSaveChanges(name: string, neverSaved?: boolean): Promise<SaveChoice>;
    /**
     * Called when the window is being closed (the window button, Quit) with unsaved changes. The page asks with its own
     * dialog and resolves the answer. Call `shown` as soon as the dialog is on screen: if it hasn't been within a
     * couple of seconds the desktop side asks with the system box instead, and `onWithdraw` takes a function to run so
     * the page can take its dialog down. (A function, not an AbortSignal: only plain values cross the bridge.) Throw (or reject) when the page can't ask, and the system box is used at once.
     */
    /** Asks the desktop to hear the audience Stop key from any window, while on air. Resolves whether it could. Best effort: some desktops say no. */
    setPanicKey(on: boolean): Promise<boolean>;
    /** Called when that key is pressed. Returns an unsubscribe function. */
    onPanicKey(handler: () => void): () => void;
    onCloseQuestion(handler: (q: { name: string; neverSaved: boolean }, shown: () => void, onWithdraw: (fn: () => void) => void) => Promise<SaveChoice>): () => void;
  };
}
