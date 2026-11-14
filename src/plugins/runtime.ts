// The host's side of one running plugin. It answers the plugin's messages, and checks every one of them: the plugin
// can send anything at all down its port, so nothing it says is trusted. It knows nothing about the DOM or the app;
// the manager hands it a transport (the sandbox) and hooks (the store, registries and toasts).
import { cleanRepeat, clipDirection } from '../core/clipPlay';
import type { Clip, ClipDirection, Doc } from '../core/format';
import { encodePng } from '../io/png';
import { plainProps, sanitizeDrawList, type DrawList } from './drawlist';
import { EventGate, MAX_UNANSWERED, type PluginEventName } from './events';
import type { Permission, PluginManifest } from './manifest';
import { cleanValues, sanitizeOptions, type ExportOption, type OptionValues } from './options';
import { sanitizeUi, type UiNode } from './ui-schema';
import { Watchdog, type Trip } from './watchdog';
import { Diagnostics, type PluginDiag } from './diagnostics';

export interface Transport {
  post(msg: unknown, transfer?: Transferable[]): void;
  onMessage(fn: (msg: unknown) => void): void;
  close(): void;
}

export interface PluginCommandDef {
  id: string;
  label: string;
  description?: string;
  keys?: string[];
}

export interface PluginExporterDef {
  id: string;
  label: string;
  description?: string;
  /** The file extension of what it makes, without the dot. */
  extension: string;
  /** Makes several files (saved into a folder). */
  multiple: boolean;
  /** Wants frames with a see-through background. */
  transparent: boolean;
  /** Version 2: what it asks in the Export dialog. */
  options: ExportOption[];
}

/** A tool a plugin adds to the toolbox (version 2, needs the `tools` power). */
export interface PluginToolDef {
  id: string;
  label: string;
  icon: string;
  /** The layer kinds it works on. */
  layers: ('vector' | 'pixel')[];
  /** Points come to it pulled onto Frameling's snap lines (the person's snapping choices; Ctrl or Cmd bypasses them). Off unless asked for. */
  snap: boolean;
  /** Named keys it listens for. Each is a command in Keyboard settings with no key to start with; pressing it while the tool is picked sends a `key` event. */
  keys: PluginToolKey[];
}

export interface PluginToolKey {
  id: string;
  label: string;
}

export const MAX_TOOL_KEYS = 8;

/** A kind of shape a plugin draws (version 2, needs the `shapes` power). */
export interface PluginShapeDef {
  kind: string;
  label: string;
  /** Version 2: the settings Properties shows for a shape of this kind (a number, a choice, a switch or text each). */
  options: ExportOption[];
}

/** What a tool hears: where the pointer is, in stage coordinates, and what it was doing. */
export interface ToolEvent {
  type: 'down' | 'move' | 'up' | 'hover' | 'cancel' | 'leave' | 'key';
  /** Stage coordinates; pulled onto the snap lines when the tool asked for `snap` (`rawX`, `rawY` are where the pointer really is). */
  x: number;
  y: number;
  rawX?: number;
  rawY?: number;
  /** The handle of the tool's last picture that the pointer is over, or is dragging (a drag keeps this id from the press to the release). */
  handle?: string;
  /** For `type: 'key'`: which of the tool's named keys was pressed. */
  key?: string;
  pressure: number;
  shift: boolean;
  alt: boolean;
  mod: boolean;
  button: number;
  frame: number;
  drawingId: string | null;
  /** Screen pixels per stage pixel, so handles can keep their size on screen. */
  zoom: number;
}

export interface ShapePlacement {
  pluginId: string;
  kind: string;
  /** What the plugin keeps to draw it again (plain data). */
  props: Record<string, unknown>;
  drawn: DrawList;
  at: { x?: number; y?: number };
  /** Redraw this one instead of adding a new one. */
  inst?: string;
  drawingId?: string | null;
}

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
}

export interface PluginPanelDef {
  id: string;
  title: string;
}

export interface ExportFrame {
  width: number;
  height: number;
  /** RGBA, 4 bytes a pixel, row by row. */
  data: Uint8ClampedArray;
}

/**
 * A clip as a plugin's exporter sees it. `direction` and `repeat` were added after the first version (the plugin API
 * version did not change): a plugin that does not read them keeps working. The frames it gets are the range in order,
 * unbaked, so a plugin that wants the play order builds it from these.
 */
export interface ExportClip {
  name: string;
  start: number;
  end: number;
  /** Plays for ever. */
  loop: boolean;
  /** Which way it plays: 'forward', 'reverse', 'pingpong' (0 to n-1 and back) or 'pingpong-reverse'. */
  direction: ClipDirection;
  /** How many times it plays when `loop` is false (1 = once; back and forth counts each direction: 2 is there and back). Not used when `loop` is true. */
  repeat: number;
}

/** The clips of a document as an exporter plugin is told about them. */
export function exportClips(clips: Pick<Clip, 'name' | 'start' | 'end' | 'loop' | 'direction' | 'repeat'>[]): ExportClip[] {
  return clips.map((c) => ({ name: c.name, start: c.start, end: c.end, loop: c.loop, direction: clipDirection(c), repeat: cleanRepeat(c.repeat) ?? 1 }));
}

export interface ExportInfo {
  name: string;
  fps: number;
  width: number;
  height: number;
  scale: number;
  /** The document frame each picture is (the range may not start at 0). */
  frameNumbers: number[];
  clips: ExportClip[];
  markers: { name: string; frame: number }[];
}

export interface OutFile {
  name: string;
  bytes: Uint8Array;
}

export interface HostHooks {
  getDoc(): Doc;
  getState(): { frame: number; activeLayerId: string | null; selection: string[]; drawingId: string | null };
  /** Applies a batch of ops as one undo step. Throws with a message fit to send back. */
  edit(label: string, ops: unknown): void;
  notify(message: string, kind: 'info' | 'success' | 'warn' | 'error'): void;
  addCommand(def: PluginCommandDef): void;
  addExporter(def: PluginExporterDef): void;
  addPanel(def: PluginPanelDef, ui: UiNode): void;
  updatePanel(id: string, ui: UiNode): void;
  /** The plugin hit a problem (an error in its code). */
  problem(message: string, loading: boolean): void;
  loaded?(): void;
  // Version 2. Each is only called when the person allowed that power.
  addTool?(def: PluginToolDef): void;
  addShapeKind?(def: PluginShapeDef): void;
  /** Sets what the plugin's guide on the canvas (`target` 'canvas') or one of its tools (`tool:<id>`) shows. An empty list takes it away. */
  setOverlay?(target: string, list: DrawList): void;
  /** Adds or redraws one of its shapes as one undo step. Resolves the shape's instance id. */
  placeShape?(p: ShapePlacement): string;
  /** Asks the person to pick a file (nothing else is ever readable). null means they cancelled. */
  pickFile?(opts: { extensions: string[]; title: string }): Promise<PickedFile | null>;
  /** The set of events the plugin listens to changed. */
  subscriptionsChanged?(): void;
  /** The plugin got stuck or used too much memory (see watchdog.ts). Turning it off is the host's job. Without this, nobody watches. */
  watchdog?(trip: Trip): void;
  /** How much memory the plugin's sandbox holds right now, or null where that can't be seen (the web version). */
  memory?(): Promise<number | null>;
  /** Whether "Measure plugins' memory and speed" is on. Off (or missing), nothing is counted and no memory is looked at. */
  diagnostics?(): boolean;
}

const LIMITS = { commands: 50, exporters: 10, panels: 5, files: 1000, bytes: 1024 * 1024 * 1024, tools: 5, shapeKinds: 10, overlaysPerSecond: 30, shapesPerSecond: 20, pickBytes: 50 * 1024 * 1024, notifiesPerTenSeconds: 10, pickCooldownMs: 10_000, pickCooldownMaxMs: 60_000, messagesPerSecond: 600, messageBytesPerSecond: 24 * 1024 * 1024, progressStep: 0.005 };
/** How long the host waits for a plugin to answer, so one that hangs cannot hold things up. */
export const TIMEOUTS = { toolEvent: 2000, shapeDraw: 5000, tooSlowInARow: 3 };
const NEEDS: Record<string, Permission | null> = {
  'document.get': 'document.read',
  'ui.state': 'document.read',
  'document.edit': 'document.edit',
  'ui.notify': null,
  'files.pick': 'files.read',
  'shapes.place': 'shapes',
  'shapes.update': 'shapes',
  permissions: null,
};

/** What a message from a plugin costs to handle, roughly and cheaply: strings, numbers and binary data, looking at only so many parts. */
export function approxBytes(v: unknown, budget = { nodes: 2000 }): number {
  if (typeof v === 'string') return v.length * 2;
  if (typeof v !== 'object' || v === null) return 8;
  if (ArrayBuffer.isView(v)) return v.byteLength;
  if (v instanceof ArrayBuffer) return v.byteLength;
  if (--budget.nodes < 0) return 0;
  if (Array.isArray(v)) {
    // A long list of numbers (pixels, points) is counted by its length rather than walked.
    if (v.length > 16 && typeof v[0] === 'number') return v.length * 8;
    let n = 16;
    for (const x of v) {
      n += approxBytes(x, budget);
      if (budget.nodes < 0) break;
    }
    return n;
  }
  let n = 16;
  for (const k of Object.keys(v)) {
    n += k.length * 2 + approxBytes((v as Record<string, unknown>)[k], budget);
    if (budget.nodes < 0) break;
  }
  return n;
}

/** The kinds of message that ask the host to do work. Answers to the host's own requests, heartbeats and error reports are not counted. */
const COSTLY = new Set(['register', 'panel', 'call', 'subscribe', 'unsubscribe', 'overlay', 'progress']);

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const cleanId = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : null);
const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

/** A file name that stays a plain name: no folders, nothing Windows refuses. */
export function safeName(v: unknown, fallback: string): string {
  const s = cleanText(v, 120)
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/^\.+/, '');
  return s || fallback;
}

/** Whatever an exporter handed back, as files. Text becomes UTF-8 and pictures become PNGs. Throws in plain words. */
export function normalizeFiles(raw: unknown, fallbackName: string): OutFile[] {
  if (!Array.isArray(raw)) throw new Error('The exporter should hand back a list of files.');
  if (raw.length > LIMITS.files) throw new Error('The exporter made too many files.');
  const out: OutFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const [i, f] of raw.entries()) {
    if (!isObj(f)) throw new Error('Each file should be { name, bytes } (or text, or image).');
    let name = safeName(f.name, i ? `${fallbackName}-${i + 1}` : fallbackName);
    while (seen.has(name.toLowerCase())) name = name.replace(/(\.[^.]*)?$/, (ext) => `_${ext}`);
    seen.add(name.toLowerCase());
    let bytes: Uint8Array;
    if (f.bytes instanceof Uint8Array || f.bytes instanceof Uint8ClampedArray) bytes = new Uint8Array(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength);
    else if (f.bytes instanceof ArrayBuffer) bytes = new Uint8Array(f.bytes);
    else if (typeof f.text === 'string') bytes = new TextEncoder().encode(f.text);
    else if (isObj(f.image)) {
      const { width, height } = f.image;
      const data = f.image.data ?? f.image.pixels;
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16384 || height > 16384 || !(data instanceof Uint8ClampedArray || data instanceof Uint8Array) || data.length !== width * height * 4)
        throw new Error(`The picture for "${name}" isn't the right size (it needs width x height x 4 bytes).`);
      bytes = encodePng({ width, height, pixels: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) });
    } else throw new Error(`"${name}" has nothing in it. Give it bytes, text or an image.`);
    total += bytes.length;
    if (total > LIMITS.bytes) throw new Error('The exported files are too big.');
    out.push({ name, bytes });
  }
  if (!out.length) throw new Error('The exporter made no files.');
  return out;
}

interface Waiting {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

export class PluginRuntime {
  readonly commands = new Map<string, PluginCommandDef>();
  readonly exporters = new Map<string, PluginExporterDef>();
  readonly panels = new Map<string, PluginPanelDef>();
  readonly tools = new Map<string, PluginToolDef>();
  readonly shapeKinds = new Map<string, PluginShapeDef>();
  /** The events it listens to (each one it also listed in its manifest). */
  readonly subscribed = new Set<PluginEventName>();
  private gate: EventGate;
  private unanswered = 0;
  private slowInARow = 0;
  private overlayWindow = { start: 0, count: 0 };
  private shapeWindow = { start: 0, count: 0 };
  private notifyWindow = { start: 0, count: 0 };
  /** The file picker is a window the person must answer: one at a time, and a plugin that keeps asking after a cancel is made to wait. */
  private picking = false;
  private pickCancels = 0;
  private pickBlockedUntil = 0;
  private waiting = new Map<number, Waiting>();
  private nextId = 1;
  private stopped = false;
  private problems = 0;
  private watch: Watchdog | null = null;
  private measured = new Diagnostics();
  /** Commands and exports being waited for: honest work that may keep the worker busy for a while. */
  private heavy = 0;
  /** The furthest progress reported in the job running now (a report must beat it to count), and who wants to see it. */
  private lastDone = -1;
  /** The job's own size (the first one reported: a plugin cannot keep making the goal bigger), and how far a report last bought it more time. */
  private jobTotal = 0;
  private creditedDone = -1;
  /** What this second's messages from the plugin have cost so far, and whether it has been told off for it. */
  private inbound = { start: 0, count: 0, bytes: 0 };
  private flooded = false;
  private onProgress: ((done: number, total: number) => void) | null = null;

  constructor(
    readonly manifest: PluginManifest,
    readonly granted: Permission[],
    private transport: Transport,
    private hooks: HostHooks,
  ) {
    this.gate = new EventGate((name, payload) => this.sendEvent(name, payload));
    transport.onMessage((m) => void this.receive(m));
    if (hooks.watchdog) {
      this.watch = new Watchdog({
        ping: (n) => this.send({ t: 'ping', n }),
        trip: (t) => hooks.watchdog!(t),
        busy: () => this.heavy > 0,
        memory: hooks.memory ? () => (hooks.diagnostics?.() ? hooks.memory!() : Promise.resolve(null)) : undefined,
        onPong: (ms) => {
          if (hooks.diagnostics?.()) this.measured.latency(Date.now(), ms);
        },
      });
      this.watch.start();
    }
  }

  /** What the heartbeat has seen of this plugin over the last minute (memory is added by the caller). */
  diag(memoryBytes: number | null = null): PluginDiag {
    return this.measured.snapshot(Date.now(), memoryBytes);
  }

  private can(p: Permission): boolean {
    return this.granted.includes(p) && this.manifest.permissions.includes(p);
  }

  /**
   * Whether it may use a power. A plugin that never asked for it gets a problem (it is a mistake in the plugin); one the
   * person said no to just has that part left out, quietly.
   */
  private allow(p: Permission, what: string): boolean {
    if (this.can(p)) return true;
    if (!this.manifest.permissions.includes(p)) this.problem(`It tried to ${what}, but it did not ask for that permission.`);
    return false;
  }

  private send(msg: unknown, transfer?: Transferable[]): void {
    if (!this.stopped) this.transport.post(msg, transfer);
  }

  private problem(message: string, loading = false): void {
    // A broken plugin could shout in a loop: say it a few times at most.
    if (++this.problems > 3 && !loading) return;
    this.hooks.problem(cleanText(message, 300) || 'Something went wrong.', loading);
  }

  private async receive(m: unknown): Promise<void> {
    if (this.stopped || !isObj(m)) return;
    if (COSTLY.has(m.t as string) && !this.admit(m)) return;
    if (this.hooks.diagnostics?.() && (m.t === 'call' || m.t === 'panel' || m.t === 'overlay')) this.measured.op(Date.now(), m.t === 'overlay' && Array.isArray(m.list) ? m.list.length : 0);
    switch (m.t) {
      case 'register':
        return this.register(m);
      case 'panel': {
        const id = cleanId(m.id);
        if (id && this.panels.has(id)) this.hooks.updatePanel(id, sanitizeUi(m.ui));
        return;
      }
      case 'call':
        return this.answer(m);
      case 'reply': {
        const w = this.waiting.get(m.id);
        if (!w) return;
        this.waiting.delete(m.id);
        if (m.ok) w.resolve(m.value);
        else w.reject(new Error(cleanText(m.error, 300) || 'The plugin hit a problem.'));
        return;
      }
      case 'error':
        return this.problem(String(m.message ?? ''), !!m.loading);
      case 'loaded':
        this.hooks.loaded?.();
        return;
      case 'subscribe':
        return this.subscribe(m.event);
      case 'unsubscribe':
        if (this.subscribed.delete(m.event as PluginEventName)) this.hooks.subscriptionsChanged?.();
        return;
      case 'pong':
        this.watch?.pong(m.n);
        return;
      case 'evAck':
        this.unanswered = Math.max(0, this.unanswered - 1);
        return;
      case 'overlay':
        return this.canvasOverlay(m.list);
      case 'progress':
        return this.reportProgress(m.done, m.total);
    }
  }

  /** Keeps what a plugin can ask of the host in one second bounded, in how many messages and how big they are. Over it, the message is dropped (a call is answered with a refusal). */
  private admit(m: Record<string, any>): boolean {
    const now = Date.now();
    if (now - this.inbound.start >= 1000) this.inbound = { start: now, count: 0, bytes: 0 };
    this.inbound.count++;
    this.inbound.bytes += this.inbound.count > LIMITS.messagesPerSecond ? 0 : approxBytes(m);
    if (this.inbound.count <= LIMITS.messagesPerSecond && this.inbound.bytes <= LIMITS.messageBytesPerSecond) return true;
    if (!this.flooded) {
      this.flooded = true;
      this.problem('It is sending messages faster than Frameling can deal with, so some were skipped.');
    }
    if (m.t === 'call' && typeof m.id === 'number') this.send({ t: 'reply', id: m.id, ok: false, error: 'Too many requests at once. Slow down.' });
    return false;
  }

  private subscribe(event: unknown): void {
    if (typeof event !== 'string') return;
    if (!this.manifest.events.includes(event as PluginEventName)) return this.problem(`It tried to listen for "${event.slice(0, 40)}", but its manifest does not list that event.`);
    if (this.subscribed.has(event as PluginEventName)) return;
    this.subscribed.add(event as PluginEventName);
    this.hooks.subscriptionsChanged?.();
  }

  /** Progress from a long command or export: it only counts while one is running, and only when it moves forward. */
  private reportProgress(done: unknown, total: unknown): void {
    if (this.heavy <= 0 || typeof done !== 'number' || typeof total !== 'number' || !Number.isFinite(done) || !Number.isFinite(total) || total <= 0 || done < 0) return;
    if (!this.jobTotal) this.jobTotal = total;
    const d = Math.min(done, this.jobTotal);
    if (d <= this.lastDone) return;
    this.lastDone = d;
    // Only a real step forward (half a percent of the job) buys more time: a plugin cannot keep itself alive with tiny increases.
    if (d - this.creditedDone >= this.jobTotal * LIMITS.progressStep) {
      this.creditedDone = d;
      this.watch?.progress();
    }
    this.onProgress?.(d, this.jobTotal);
  }

  private canvasOverlay(list: unknown): void {
    if (!this.allow('canvas', 'draw on the canvas')) return;
    // A plugin that sends a new picture every moment gets the first few; the rest are dropped.
    const now = Date.now();
    if (now - this.overlayWindow.start >= 1000) this.overlayWindow = { start: now, count: 0 };
    if (++this.overlayWindow.count > LIMITS.overlaysPerSecond) return;
    this.hooks.setOverlay?.('canvas', sanitizeDrawList(list));
  }

  /** Tells the plugin about something, if it listens for it. Summaries only; ids of the selection only with `document.read`. */
  emit(name: PluginEventName, payload: Record<string, unknown> | (() => Record<string, unknown>)): void {
    if (this.stopped || !this.subscribed.has(name)) return;
    // Built only when it is about to be sent, so a burst of changes costs one summary.
    this.gate.offer(name, () => {
      const body = typeof payload === 'function' ? payload() : payload;
      return name === 'selection.changed' && !this.can('document.read') ? { count: body.count } : body;
    });
  }

  private sendEvent(name: PluginEventName, payload: unknown): void {
    if (this.unanswered >= MAX_UNANSWERED) {
      if (this.unanswered === MAX_UNANSWERED) {
        this.unanswered++;
        this.problem('It is not keeping up with what is happening, so Frameling stopped telling it.');
      }
      return;
    }
    this.unanswered++;
    this.send({ t: 'event', name, payload: typeof payload === 'function' ? (payload as () => unknown)() : payload });
  }

  private register(m: Record<string, any>): void {
    const d = isObj(m.def) ? m.def : {};
    const id = cleanId(d.id);
    if (!id) return;
    if (m.kind === 'command') {
      if (this.commands.size >= LIMITS.commands && !this.commands.has(id)) return;
      const keys = Array.isArray(d.keys) ? d.keys.filter((k: unknown) => typeof k === 'string' && k.length < 30).slice(0, 2) : undefined;
      const def: PluginCommandDef = { id, label: cleanText(d.label, 60) || id, ...(d.description ? { description: cleanText(d.description, 200) } : {}), ...(keys?.length ? { keys } : {}) };
      this.commands.set(id, def);
      this.hooks.addCommand(def);
    } else if (m.kind === 'exporter') {
      if (!this.allow('export', 'add an export')) return;
      if (this.exporters.size >= LIMITS.exporters && !this.exporters.has(id)) return;
      const ext = typeof d.extension === 'string' && /^[A-Za-z0-9]{1,10}$/.test(d.extension) ? d.extension.toLowerCase() : 'bin';
      // The manifest's description of the options wins; a plugin may also give them as it registers (version 2).
      const options = this.manifest.exporterOptions[id] ?? (this.manifest.apiVersion >= 2 ? sanitizeOptions(d.options) : []);
      const def: PluginExporterDef = { id, label: cleanText(d.label, 60) || id, ...(d.description ? { description: cleanText(d.description, 200) } : {}), extension: ext, multiple: !!d.multiple, transparent: d.transparent !== false, options };
      this.exporters.set(id, def);
      this.hooks.addExporter(def);
    } else if (m.kind === 'panel') {
      if (!this.allow('panels', 'add a panel')) return;
      if (this.panels.size >= LIMITS.panels && !this.panels.has(id)) return;
      const def: PluginPanelDef = { id, title: cleanText(d.title, 40) || this.manifest.name };
      this.panels.set(id, def);
      this.hooks.addPanel(def, sanitizeUi(m.ui));
    } else if (m.kind === 'tool') {
      if (!this.allow('tools', 'add a tool')) return;
      if (this.tools.size >= LIMITS.tools && !this.tools.has(id)) return;
      const layers = (Array.isArray(d.layers) ? d.layers : ['vector']).filter((l: unknown): l is 'vector' | 'pixel' => l === 'vector' || l === 'pixel');
      const keys: PluginToolKey[] = [];
      for (const k of Array.isArray(d.keys) ? d.keys : []) {
        const kid = isObj(k) ? cleanId(k.id) : null;
        if (kid && !keys.some((x) => x.id === kid) && keys.length < MAX_TOOL_KEYS) keys.push({ id: kid, label: cleanText(k.label, 40) || kid });
      }
      const def: PluginToolDef = { id, label: cleanText(d.label, 40) || id, icon: typeof d.icon === 'string' ? d.icon.slice(0, 40) : 'plugin', layers: layers.length ? layers : ['vector'], snap: d.snap === true, keys };
      this.tools.set(id, def);
      this.hooks.addTool?.(def);
    } else if (m.kind === 'shape') {
      if (!this.allow('shapes', 'add a kind of shape')) return;
      if (this.shapeKinds.size >= LIMITS.shapeKinds && !this.shapeKinds.has(id)) return;
      const def: PluginShapeDef = { kind: id, label: cleanText(d.label, 40) || id, options: this.manifest.apiVersion >= 2 ? sanitizeOptions(d.options) : [] };
      this.shapeKinds.set(id, def);
      this.hooks.addShapeKind?.(def);
    }
  }

  private async answer(m: Record<string, any>): Promise<void> {
    const reply = (ok: boolean, value?: unknown, error?: string, transfer?: Transferable[]) => this.send({ t: 'reply', id: m.id, ok, value, error }, transfer);
    const method = typeof m.method === 'string' ? m.method : '';
    if (!Object.hasOwn(NEEDS, method)) return reply(false, undefined, `Frameling has no "${method.slice(0, 40)}".`);
    const need = NEEDS[method];
    if (need && !this.can(need)) return reply(false, undefined, `This plugin did not ask for permission to ${need === 'document.edit' ? 'change' : 'see'} the drawing.`);
    try {
      const a = isObj(m.args) ? m.args : {};
      switch (method) {
        case 'document.get':
          return reply(true, this.hooks.getDoc());
        case 'ui.state':
          return reply(true, this.hooks.getState());
        case 'document.edit':
          this.hooks.edit(cleanText(a.label, 60), a.ops);
          return reply(true, null);
        case 'permissions':
          return reply(true, { granted: this.manifest.permissions.filter((p) => this.granted.includes(p)) });
        case 'files.pick': {
          const exts = (Array.isArray(a.extensions) ? a.extensions : []).filter((e: unknown): e is string => typeof e === 'string' && /^[A-Za-z0-9]{1,10}$/.test(e)).slice(0, 10);
          if (this.picking) return reply(false, undefined, 'It is already asking for a file.');
          if (Date.now() < this.pickBlockedUntil) return reply(false, undefined, 'The person just said no to a file. Wait a while before asking again.');
          this.picking = true;
          let file: PickedFile | null;
          try {
            file = (await this.hooks.pickFile?.({ extensions: exts, title: cleanText(a.title, 80) || 'Pick a file' })) ?? null;
          } finally {
            this.picking = false;
          }
          if (!file) {
            this.pickBlockedUntil = Date.now() + Math.min(LIMITS.pickCooldownMaxMs, LIMITS.pickCooldownMs * ++this.pickCancels);
            return reply(true, null);
          }
          this.pickCancels = 0;
          if (file.bytes.length > LIMITS.pickBytes) return reply(false, undefined, 'That file is too big for a plugin to read.');
          const copy = file.bytes.slice();
          return reply(true, { name: safeName(file.name, 'file'), bytes: copy }, undefined, [copy.buffer as ArrayBuffer]);
        }
        case 'shapes.place':
        case 'shapes.update':
          return reply(true, await this.placeShape(a, method === 'shapes.update'));
        case 'ui.notify': {
          // A message on screen (and a sound for the sad ones) is the person's attention: a plugin cannot take it over.
          const now = Date.now();
          if (now - this.notifyWindow.start >= 10_000) this.notifyWindow = { start: now, count: 0 };
          if (++this.notifyWindow.count > LIMITS.notifiesPerTenSeconds) return reply(true, null);
          const kind = a.kind === 'success' || a.kind === 'warn' || a.kind === 'error' ? a.kind : 'info';
          this.hooks.notify(cleanText(a.message, 200), kind);
          return reply(true, null);
        }
      }
    } catch (e) {
      reply(false, undefined, e instanceof Error ? e.message : 'That did not work.');
    }
  }

  /** Adds one of the plugin's shapes (or redraws one): the plugin draws it from its props, Frameling checks it and puts it in the drawing. */
  private async placeShape(a: Record<string, any>, redraw: boolean): Promise<string> {
    const kind = typeof a.kind === 'string' ? a.kind : '';
    if (!this.shapeKinds.has(kind)) throw new Error(`This plugin has no kind of shape called "${kind.slice(0, 40)}".`);
    if (!this.hooks.placeShape) throw new Error('Shapes are not available here.');
    // Each one is an undo step and a drawing job: a plugin cannot add them faster than this.
    const now = Date.now();
    if (now - this.shapeWindow.start >= 1000) this.shapeWindow = { start: now, count: 0 };
    if (++this.shapeWindow.count > LIMITS.shapesPerSecond) throw new Error('That is too many shapes at once. Slow down.');
    const props = plainProps(a.props);
    if (!props) throw new Error('The shape\'s settings must be plain data (text, numbers, true or false, lists and objects) and not too big.');
    const inst = redraw ? (typeof a.inst === 'string' ? a.inst.slice(0, 60) : '') : undefined;
    if (redraw && !inst) throw new Error('Say which shape to redraw (its inst).');
    const x = typeof a.x === 'number' && Number.isFinite(a.x) ? a.x : undefined;
    const y = typeof a.y === 'number' && Number.isFinite(a.y) ? a.y : undefined;
    const drawn = sanitizeDrawList(await this.request('shapeDraw', { kind, props }, undefined, undefined, TIMEOUTS.shapeDraw));
    return this.hooks.placeShape({ pluginId: this.manifest.id, kind, props, drawn, at: { x, y }, ...(inst ? { inst } : {}), drawingId: typeof a.drawingId === 'string' ? a.drawingId : null });
  }

  /** Draws one of its shapes again from new settings, as if the plugin had asked (Properties uses this). Throws in plain words. */
  async redrawShape(a: { kind: string; inst: string; props: unknown; drawingId?: string | null }): Promise<string> {
    if (this.stopped || !this.can('shapes')) throw new Error('This plugin is not able to draw shapes right now.');
    return this.placeShape({ kind: a.kind, inst: a.inst, props: a.props, drawingId: a.drawingId ?? null }, true);
  }

  /** Asks the plugin to do something, and waits for its answer (for `timeoutMs` at most, when given). */
  private request(method: string, args: unknown, transfer?: Transferable[], signal?: AbortSignal, timeoutMs?: number): Promise<unknown> {
    if (this.stopped) return Promise.reject(new Error('The plugin is off.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs
        ? setTimeout(() => {
            if (this.waiting.delete(id)) reject(new Error('The plugin took too long to answer.'));
          }, timeoutMs)
        : null;
      this.waiting.set(id, {
        resolve: (v) => (timer && clearTimeout(timer), resolve(v)),
        reject: (e) => (timer && clearTimeout(timer), reject(e)),
      });
      signal?.addEventListener('abort', () => {
        if (this.waiting.delete(id)) {
          if (timer) clearTimeout(timer);
          reject(new DOMException('Cancelled', 'AbortError'));
        }
      });
      this.send({ t: 'call', id, method, args }, transfer);
    });
  }

  /**
   * Tells a tool of the plugin where the pointer is. Its answer (edits and a picture to show) is checked and used
   * here. Resolves a short message to show the person, if the plugin or the checks have one.
   */
  async toolEvent(toolId: string, event: ToolEvent): Promise<string | undefined> {
    if (!this.tools.has(toolId) || !this.can('tools')) return undefined;
    // A tool that keeps missing its deadline is left alone for the rest of the session.
    if (this.slowInARow >= TIMEOUTS.tooSlowInARow) return undefined;
    let raw: unknown;
    try {
      raw = await this.request('toolEvent', { toolId, event }, undefined, undefined, TIMEOUTS.toolEvent);
      this.slowInARow = 0;
    } catch {
      if (++this.slowInARow >= TIMEOUTS.tooSlowInARow) this.problem('One of its tools is not answering, so Frameling stopped using it. Turn the plugin off and on to try again.');
      return undefined;
    }
    if (!isObj(raw)) return undefined;
    let hint = typeof raw.hint === 'string' ? cleanText(raw.hint, 120) || undefined : undefined;
    if (raw.overlay !== undefined) this.hooks.setOverlay?.(`tool:${toolId}`, sanitizeDrawList(raw.overlay));
    if (raw.ops !== undefined) {
      if (!this.can('document.edit')) hint = "This tool can't change your drawing (it wasn't allowed to).";
      else {
        try {
          this.hooks.edit(cleanText(raw.label, 60) || this.tools.get(toolId)!.label, raw.ops);
        } catch (e) {
          hint = e instanceof Error ? e.message.slice(0, 120) : 'That did not work.';
        }
      }
    }
    return hint;
  }

  async runCommand(id: string): Promise<void> {
    this.begin();
    try {
      await this.request('command', { id });
    } catch (e) {
      this.problem(e instanceof Error ? e.message : String(e));
    } finally {
      this.end();
    }
  }

  private begin(): void {
    if (this.heavy++ === 0) {
      this.lastDone = -1;
      this.creditedDone = -1;
      this.jobTotal = 0;
    }
  }

  private end(): void {
    this.heavy--;
  }

  /** Hands frames to an exporter (they move over, so the caller must not use them after) and gets its files back. */
  async runExport(id: string, frames: ExportFrame[], info: ExportInfo, signal?: AbortSignal, options?: unknown, onProgress?: (done: number, total: number) => void): Promise<OutFile[]> {
    const ex = this.exporters.get(id);
    if (!ex) throw new Error('That export is not there any more.');
    const transfer = frames.map((f) => f.data.buffer as ArrayBuffer);
    // Whatever the dialog sent, the plugin only gets values that fit the options it described.
    const values: OptionValues = cleanValues(ex.options, options);
    this.begin();
    this.onProgress = onProgress ?? null;
    let raw: unknown;
    try {
      raw = await this.request('export', { id, frames, info, options: values }, transfer, signal);
    } finally {
      this.onProgress = null;
      this.end();
    }
    return normalizeFiles(raw, `${safeName(info.name, 'export')}.${ex.extension}`);
  }

  panelEvent(panelId: string, id: string, value: unknown): void {
    void this.request('panelEvent', { panelId, id, value }).catch((e) => this.problem(e instanceof Error ? e.message : String(e)));
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.watch?.stop();
    this.gate.stop();
    for (const w of this.waiting.values()) w.reject(new Error('The plugin was turned off.'));
    this.waiting.clear();
    this.transport.close();
  }

  get running(): boolean {
    return !this.stopped;
  }
}
