// The app's own small library of files (installed plugins, your templates), whichever home it has: a folder in the
// user data dir on the desktop, IndexedDB in a browser. Without a bridge, or when a call fails (screenshot runs,
// tests), it falls back to memory for the visit, so features still work and nothing throws at people.
import type { LibraryApi, LibraryEntry, LibraryKind } from '../preload/api';
import { desktop } from '../io/desktop';

const memory = new Map<string, { bytes: Uint8Array; modified: number }>();

export const memoryLibrary: LibraryApi = {
  async list(kind) {
    const out: LibraryEntry[] = [];
    for (const [k, v] of memory) if (k.startsWith(`${kind}/`)) out.push({ id: k.slice(kind.length + 1), size: v.bytes.length, modified: v.modified });
    return out;
  },
  async read(kind, id) {
    return memory.get(`${kind}/${id}`)?.bytes ?? null;
  },
  async write(kind, id, bytes) {
    memory.set(`${kind}/${id}`, { bytes, modified: Date.now() });
  },
  async remove(kind, id) {
    memory.delete(`${kind}/${id}`);
  },
};

let override: LibraryApi | null = null;

/** For tests: use this library instead of the bridge's. */
export function setLibraryForTests(l: LibraryApi | null): void {
  override = l;
}

function real(): LibraryApi | null {
  return override ?? desktop()?.library ?? null;
}

/** The library, with a quiet fallback to memory when the real one isn't there or fails. */
export const library: Required<Pick<LibraryApi, 'list' | 'read' | 'write' | 'remove'>> & { showFolder?: (kind: LibraryKind) => Promise<void>; persistent(): boolean } = {
  async list(kind) {
    const r = real();
    if (!r) return memoryLibrary.list(kind);
    try {
      const mem = await memoryLibrary.list(kind);
      const got = await r.list(kind);
      return [...got, ...mem.filter((m) => !got.some((g) => g.id === m.id))];
    } catch {
      return memoryLibrary.list(kind);
    }
  },
  async read(kind, id) {
    const r = real();
    if (r) {
      try {
        const b = await r.read(kind, id);
        if (b) return b;
      } catch {
        // Fall through to memory.
      }
    }
    return memoryLibrary.read(kind, id);
  },
  async write(kind, id, bytes) {
    const r = real();
    if (r) {
      try {
        await r.write(kind, id, bytes);
        return;
      } catch {
        // Keep it for this visit at least.
      }
    }
    await memoryLibrary.write(kind, id, bytes);
  },
  async remove(kind, id) {
    await memoryLibrary.remove(kind, id);
    try {
      await real()?.remove(kind, id);
    } catch {
      // Already gone.
    }
  },
  get showFolder() {
    const r = real();
    return r?.showFolder ? (kind: LibraryKind) => r.showFolder!(kind).catch(() => undefined) : undefined;
  },
  persistent: () => !!real(),
};

/** A library id from a name: lower case letters, numbers and dashes. */
export function idFromName(name: string, fallback = 'item'): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || fallback;
}
