// The host's side of one running plugin. It answers the plugin's messages, and checks every one of them: the plugin
// can send anything at all down its port, so nothing it says is trusted. It knows nothing about the DOM or the app;
// the manager hands it a transport (the sandbox) and hooks (the store, registries and toasts).
import type { Doc } from '../core/format';
import { encodePng } from '../io/png';
import type { Permission, PluginManifest } from './manifest';
import { sanitizeUi, type UiNode } from './ui-schema';

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

export interface ExportInfo {
  name: string;
  fps: number;
  width: number;
  height: number;
  scale: number;
  /** The document frame each picture is (the range may not start at 0). */
  frameNumbers: number[];
  clips: { name: string; start: number; end: number; loop: boolean }[];
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
}

const LIMITS = { commands: 50, exporters: 10, panels: 5, files: 1000, bytes: 1024 * 1024 * 1024 };
const NEEDS: Record<string, Permission | null> = {
  'document.get': 'document.read',
  'ui.state': 'document.read',
  'document.edit': 'document.edit',
  'ui.notify': null,
};

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
  private waiting = new Map<number, Waiting>();
  private nextId = 1;
  private stopped = false;
  private problems = 0;

  constructor(
    readonly manifest: PluginManifest,
    readonly granted: Permission[],
    private transport: Transport,
    private hooks: HostHooks,
  ) {
    transport.onMessage((m) => void this.receive(m));
  }

  private can(p: Permission): boolean {
    return this.granted.includes(p) && this.manifest.permissions.includes(p);
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
    }
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
      if (!this.can('export')) return this.problem('It tried to add an export, but it did not ask for that permission.');
      if (this.exporters.size >= LIMITS.exporters && !this.exporters.has(id)) return;
      const ext = typeof d.extension === 'string' && /^[A-Za-z0-9]{1,10}$/.test(d.extension) ? d.extension.toLowerCase() : 'bin';
      const def: PluginExporterDef = { id, label: cleanText(d.label, 60) || id, ...(d.description ? { description: cleanText(d.description, 200) } : {}), extension: ext, multiple: !!d.multiple, transparent: d.transparent !== false };
      this.exporters.set(id, def);
      this.hooks.addExporter(def);
    } else if (m.kind === 'panel') {
      if (!this.can('panels')) return this.problem('It tried to add a panel, but it did not ask for that permission.');
      if (this.panels.size >= LIMITS.panels && !this.panels.has(id)) return;
      const def: PluginPanelDef = { id, title: cleanText(d.title, 40) || this.manifest.name };
      this.panels.set(id, def);
      this.hooks.addPanel(def, sanitizeUi(m.ui));
    }
  }

  private async answer(m: Record<string, any>): Promise<void> {
    const reply = (ok: boolean, value?: unknown, error?: string, transfer?: Transferable[]) => this.send({ t: 'reply', id: m.id, ok, value, error }, transfer);
    const method = typeof m.method === 'string' ? m.method : '';
    if (!(method in NEEDS)) return reply(false, undefined, `Frameling has no "${method.slice(0, 40)}".`);
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
        case 'ui.notify': {
          const kind = a.kind === 'success' || a.kind === 'warn' || a.kind === 'error' ? a.kind : 'info';
          this.hooks.notify(cleanText(a.message, 200), kind);
          return reply(true, null);
        }
      }
    } catch (e) {
      reply(false, undefined, e instanceof Error ? e.message : 'That did not work.');
    }
  }

  /** Asks the plugin to do something, and waits for its answer. */
  private request(method: string, args: unknown, transfer?: Transferable[], signal?: AbortSignal): Promise<unknown> {
    if (this.stopped) return Promise.reject(new Error('The plugin is off.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      signal?.addEventListener('abort', () => {
        if (this.waiting.delete(id)) reject(new DOMException('Cancelled', 'AbortError'));
      });
      this.send({ t: 'call', id, method, args }, transfer);
    });
  }

  async runCommand(id: string): Promise<void> {
    try {
      await this.request('command', { id });
    } catch (e) {
      this.problem(e instanceof Error ? e.message : String(e));
    }
  }

  /** Hands frames to an exporter (they move over, so the caller must not use them after) and gets its files back. */
  async runExport(id: string, frames: ExportFrame[], info: ExportInfo, signal?: AbortSignal): Promise<OutFile[]> {
    const ex = this.exporters.get(id);
    if (!ex) throw new Error('That export is not there any more.');
    const transfer = frames.map((f) => f.data.buffer as ArrayBuffer);
    const raw = await this.request('export', { id, frames, info }, transfer, signal);
    return normalizeFiles(raw, `${safeName(info.name, 'export')}.${ex.extension}`);
  }

  panelEvent(panelId: string, id: string, value: unknown): void {
    void this.request('panelEvent', { panelId, id, value }).catch((e) => this.problem(e instanceof Error ? e.message : String(e)));
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const w of this.waiting.values()) w.reject(new Error('The plugin was turned off.'));
    this.waiting.clear();
    this.transport.close();
  }

  get running(): boolean {
    return !this.stopped;
  }
}
