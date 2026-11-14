/**
 * Backing up everything you have set: themes, preferences, remembered choices, shortcuts, pen settings, workspaces
 * and the rest. It all lives in the browser's storage under `frameling.`, so the backup is simply those entries in
 * one small file, and restoring puts them back and starts Frameling again so every part picks them up.
 */
import { desktop } from '../io/desktop';

const PREFIX = 'frameling.';
/** What a settings file looks like, so an older or foreign file can be turned away kindly. */
export const SETTINGS_FORMAT = { app: 'frameling', kind: 'settings', version: 1 } as const;

export interface SettingsFile {
  app: string;
  kind: string;
  version: number;
  savedAt: string;
  /** Storage key to its text, exactly as Frameling keeps it. */
  items: Record<string, string>;
}

/** Everything Frameling has saved about how you like things, from this computer's storage. */
export function collectSettings(storage: Storage | null = safeStorage()): SettingsFile {
  const items: Record<string, string> = {};
  if (storage) {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const v = storage.getItem(k);
      if (v !== null) items[k] = v;
    }
  }
  return { ...SETTINGS_FORMAT, savedAt: new Date().toISOString(), items };
}

/** How many settings a file holds, or why it is not one. */
export function readSettings(raw: unknown): { ok: true; file: SettingsFile; count: number } | { ok: false; why: string } {
  const f = raw as Partial<SettingsFile> | null;
  if (!f || typeof f !== 'object' || f.app !== SETTINGS_FORMAT.app || f.kind !== SETTINGS_FORMAT.kind) {
    return { ok: false, why: "That isn't a Frameling settings file." };
  }
  if (typeof f.version !== 'number' || f.version > SETTINGS_FORMAT.version) {
    return { ok: false, why: 'That file was saved by a newer Frameling than this one.' };
  }
  const items = f.items && typeof f.items === 'object' ? f.items : null;
  if (!items) return { ok: false, why: 'That settings file looks damaged.' };
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(items)) if (k.startsWith(PREFIX) && typeof v === 'string') clean[k] = v;
  if (!Object.keys(clean).length) return { ok: false, why: 'That settings file has nothing in it.' };
  return { ok: true, file: { ...(f as SettingsFile), items: clean }, count: Object.keys(clean).length };
}

/** Puts the settings back. Everything of Frameling's own goes first, so what was in the file is all that is left. */
export function applySettings(file: SettingsFile, storage: Storage | null = safeStorage()): number {
  if (!storage) return 0;
  for (const k of Object.keys(collectSettings(storage).items)) storage.removeItem(k);
  let n = 0;
  for (const [k, v] of Object.entries(file.items)) {
    try {
      storage.setItem(k, v);
      n++;
    } catch {
      // Storage full or blocked: the rest still go in.
    }
  }
  return n;
}

export const settingsFileName = (now = new Date()): string => `frameling-settings-${now.toISOString().slice(0, 10)}.json`;

export type SaveResult = 'saved' | 'cancelled' | 'failed';

/** Shows the Save dialog and writes the backup. In a plain browser tab it downloads the file instead. */
export async function saveSettingsFile(): Promise<SaveResult> {
  const name = settingsFileName();
  const bytes = new TextEncoder().encode(JSON.stringify(collectSettings(), null, 2));
  const api = desktop();
  if (api) {
    try {
      const target = await api.files.pickExportFile({ suggestedName: name, filters: [{ name: 'Frameling settings', extensions: ['json'] }], title: 'Save your settings' });
      if (!target) return 'cancelled';
      const r = await api.files.write(target, bytes);
      return 'error' in r ? 'failed' : 'saved';
    } catch {
      return 'failed';
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

/** Reads a settings file the person picks. `null` means they cancelled. */
export async function pickSettingsFile(): Promise<{ ok: true; file: SettingsFile; count: number } | { ok: false; why: string } | null> {
  const bytes = await pickBytes();
  if (!bytes) return bytes === null ? null : { ok: false, why: 'That file could not be read.' };
  try {
    return readSettings(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return { ok: false, why: 'That file could not be read.' };
  }
}

async function pickBytes(): Promise<Uint8Array | null | undefined> {
  const api = desktop();
  if (api?.files.openOther) {
    const r = await api.files.openOther({ filters: [{ name: 'Frameling settings', extensions: ['json'] }], title: 'Open your settings' });
    if (!r) return null;
    return 'error' in r ? undefined : r.bytes;
  }
  return new Promise<Uint8Array | null | undefined>((done) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return done(null);
      void f.arrayBuffer().then((b) => done(new Uint8Array(b)), () => done(undefined));
    };
    input.oncancel = () => done(null);
    input.click();
  });
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
