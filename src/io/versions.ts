// Version history: copies of the open drawing taken now and then (and when you ask), kept in the app's own library
// (a folder in the user data dir on the desktop, IndexedDB in a browser), so you can look back and bring one back.
// Each drawing (by its document id) has its own list. The files are ordinary .frameling files; a small JSON index per
// drawing holds names, times and thumbnails. The keep-or-drop rule is in version-rules.ts.
import type { Doc } from '../core/format';
import { uid } from '../core/doc';
import { registerChoice, withChoice } from '../core/choices';
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { rootDoc } from '../core/symbols';
import { library } from '../platform/library';
import { desktop } from './desktop';
import { askAboutUnsavedChanges } from './document';
import { loadFile, saveFileAsync } from './file';
import { notify } from './notify';
import { thumbnailOf } from './thumb';
import { createStore } from '../ui/mini';
import { parseIndex, pruneVersions, safeDocKey, VERSION_EVERY_MS, versionFileId, versionLabel, type VersionMeta } from './version-rules';
import { choiceWord } from '../words/choices';

export type { VersionMeta } from './version-rules';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Bumped whenever a drawing's list changes, so an open Versions dialog can look again. */
export const versionsChanged = createStore(0);

// One job at a time, so two writers never race on an index.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const p = queue.then(job, job);
  queue = p.catch(() => undefined);
  return p;
}

async function readIndex(docId: string): Promise<VersionMeta[]> {
  const b = await library.read('versions-index', safeDocKey(docId));
  return parseIndex(b ? dec.decode(b) : null);
}

async function writeIndex(docId: string, list: VersionMeta[]): Promise<void> {
  const key = safeDocKey(docId);
  if (!list.length) return library.remove('versions-index', key);
  await library.write('versions-index', key, enc.encode(JSON.stringify({ versions: list })));
}

/** The drawing's versions, newest first. */
export async function listVersions(docId: string): Promise<VersionMeta[]> {
  try {
    const list = await readIndex(docId);
    return list.filter((v) => v.docId === docId).sort((a, b) => b.takenAt - a.takenAt);
  } catch {
    return [];
  }
}

/** The saved file of a version, or null when it has gone. */
export async function readVersion(v: VersionMeta): Promise<Uint8Array | null> {
  try {
    return await library.read('versions', v.id);
  } catch {
    return null;
  }
}

// What the last version (or the opened file) looked like, so an unchanged drawing never gets another copy.
let baseline: { doc: Doc; at: number } | null = null;

/** Says the drawing as it is now needs no automatic version (just opened, or one was just taken). */
export function markVersionBaseline(doc: Doc = store().rootDoc(), at = Date.now()): void {
  baseline = { doc, at };
}

/**
 * Takes a version of the open drawing. Named ones are kept until deleted; automatic ones are pruned. Resolves with
 * the new version, or null if it couldn't be made.
 */
export function takeVersion(opts: { name?: string; reason?: VersionMeta['reason']; now?: number; doc?: Doc } = {}): Promise<VersionMeta | null> {
  // `doc` keeps an earlier state of the drawing (a step from the History panel) rather than how it is now.
  const open = opts.doc ?? store().rootDoc();
  const now = opts.now ?? Date.now();
  return serial(async () => {
    try {
      const doc = rootDoc(open);
      const bytes = await saveFileAsync(doc, desktop()?.versions.app ?? '', new Date(), { reuse: true });
      const id = versionFileId(doc.id, now, Math.random().toString(36).slice(2, 5));
      await library.write('versions', id, bytes);
      const meta: VersionMeta = {
        id,
        docId: doc.id,
        takenAt: now,
        size: bytes.length,
        frames: doc.length,
        width: doc.width,
        height: doc.height,
        thumb: await thumbnailOf(doc, 160),
      };
      const name = opts.name?.trim();
      if (name) meta.name = name.slice(0, 80);
      else meta.reason = opts.reason ?? 'timer';
      const list = [...(await readIndex(doc.id)), meta];
      const { keep, drop } = pruneVersions(list, now);
      for (const d of drop) await library.remove('versions', d.id).catch(() => undefined);
      await writeIndex(doc.id, keep);
      if (!opts.doc && store().rootDoc() === open) markVersionBaseline(open, now);
      versionsChanged.set((n) => n + 1);
      return meta;
    } catch {
      return null;
    }
  });
}

/** Renames a version (an empty name makes it automatic again, so it can be pruned). */
export function renameVersion(v: VersionMeta, name: string): Promise<void> {
  return serial(async () => {
    const list = await readIndex(v.docId);
    const it = list.find((x) => x.id === v.id);
    if (!it) return;
    const n = name.trim().slice(0, 80);
    if (n) {
      it.name = n;
      delete it.reason;
    } else {
      delete it.name;
      it.reason = it.reason ?? 'timer';
    }
    await writeIndex(v.docId, list);
    versionsChanged.set((x) => x + 1);
  });
}

export function deleteVersion(v: VersionMeta): Promise<void> {
  return serial(async () => {
    await library.remove('versions', v.id).catch(() => undefined);
    await writeIndex(
      v.docId,
      (await readIndex(v.docId)).filter((x) => x.id !== v.id),
    );
    versionsChanged.set((x) => x + 1);
  });
}

/** An automatic version when the drawing changed since the last one and it's been long enough. */
export async function maybeTakeTimedVersion(now = Date.now()): Promise<VersionMeta | null> {
  const doc = store().rootDoc();
  if (!baseline || baseline.doc.id !== doc.id) {
    markVersionBaseline(doc, now);
    return null;
  }
  if (baseline.doc === doc || now - baseline.at < VERSION_EVERY_MS) return null;
  return takeVersion({ reason: 'timer', now });
}

// ---------------------------------------------------------------- restoring

export type RestoreChoice = 'in-place' | 'copy';

registerChoice<RestoreChoice>({
  id: 'versions.restore',
  title: choiceWord('choice.versions.restore.title'),
  question: choiceWord('choice.versions.restore.question'),
  options: [
    { value: 'in-place', label: choiceWord('choice.versions.restore.in-place.label'), detail: choiceWord('choice.versions.restore.in-place.detail') },
    { value: 'copy', label: choiceWord('choice.versions.restore.copy.label'), detail: choiceWord('choice.versions.restore.copy.detail') },
  ],
  default: 'in-place',
  mustAsk: true,
  category: 'Files',
  help: 'version-history',
});

/** Puts a version back, the way the person chose (asked the first time). Resolves true when it did. */
export function restoreVersion(v: VersionMeta, how?: RestoreChoice): Promise<boolean> {
  return new Promise((resolve) => {
    const go = (c: RestoreChoice) => void (c === 'copy' ? openVersionAsCopy(v) : restoreInPlace(v)).then(resolve, () => resolve(false));
    if (how) go(how);
    else withChoice<RestoreChoice>('versions.restore', go);
  });
}

function decode(bytes: Uint8Array | null): Doc | null {
  if (!bytes) return null;
  try {
    return loadFile(bytes).doc;
  } catch {
    return null;
  }
}

/** Replaces the open drawing with the version, as one undo step. Keeps a version of how it was first. */
export async function restoreInPlace(v: VersionMeta): Promise<boolean> {
  const s = store();
  if (s.nestedTag() || s.get().doc.editing?.length) {
    notify('Finish editing the symbol or tile first (press Done), then bring the version back.', 'info');
    return false;
  }
  const doc = decode(await readVersion(v));
  if (!doc) {
    notify('That version could not be read, so nothing was changed.', 'error');
    return false;
  }
  if (baseline?.doc !== s.rootDoc()) await takeVersion({ reason: 'restore' });
  const label = `Bring back version (${versionLabel(v)})`;
  s.update(label, (draft) => {
    const d = draft as unknown as Record<string, unknown>;
    const next = { ...(doc as unknown as Record<string, unknown>), id: draft.id };
    for (const k of Object.keys(d)) if (!(k in next)) delete d[k];
    for (const [k, val] of Object.entries(next)) d[k] = val;
  });
  const after = s.get();
  if (after.ui.frame >= after.doc.length) s.setUi({ frame: Math.max(0, after.doc.length - 1) });
  if (after.ui.activeLayerId && !after.doc.layers.some((l) => l.id === after.ui.activeLayerId)) s.setUi({ activeLayerId: after.doc.layers[after.doc.layers.length - 1]?.id ?? null, selection: [] });
  else s.setUi({ selection: [] });
  notify('Version brought back. Press Ctrl+Z to undo it.', 'success', { label: 'Undo', run: () => store().undo() });
  return true;
}

/** Opens the version as a new unsaved drawing with its own history. */
export async function openVersionAsCopy(v: VersionMeta): Promise<boolean> {
  const doc = decode(await readVersion(v));
  if (!doc) {
    notify('That version could not be read.', 'error');
    return false;
  }
  if (!(await askAboutUnsavedChanges())) return false;
  doc.id = uid('d');
  doc.name = `${doc.name || 'Untitled'} (${versionLabel(v).toLowerCase() === 'automatic' ? 'earlier version' : versionLabel(v)})`;
  store().load(doc, null);
  store().setUi({ dirty: true });
  markVersionBaseline(doc);
  return true;
}

// ---------------------------------------------------------------- running

let timer: ReturnType<typeof setInterval> | null = null;

/** Checks every minute whether an automatic version is due, and takes one after every save that changed something. */
export function startVersionHistory(): void {
  if (timer) return;
  markVersionBaseline();
  let lastId = store().get().doc.id;
  store().subscribe(() => {
    const doc = store().get().doc;
    // A different drawing was opened: it starts clean.
    if (doc.id !== lastId && !doc.editing?.length && !store().nestedTag()) {
      lastId = doc.id;
      markVersionBaseline(store().rootDoc());
    }
  });
  timer = setInterval(() => void maybeTakeTimedVersion(), 60_000);
}

/** After a save: a version, when the drawing changed since the last one. */
export async function versionOnSave(doc: Doc): Promise<void> {
  if (baseline && baseline.doc === doc) return;
  if (store().rootDoc() !== doc) return;
  await takeVersion({ reason: 'save' });
}

registerCommands([
  {
    id: 'file.saveVersion',
    label: 'Save a version...',
    category: 'File',
    keys: ['Mod+Alt+S'],
    description: 'Keep a named copy of your drawing as it is right now, to come back to later.',
    help: 'version-history',
    keywords: ['version', 'snapshot', 'checkpoint', 'milestone', 'history', 'backup'],
    run: () => void import('./VersionsDialog').then((m) => m.openSaveVersionDialog()),
  },
  {
    id: 'file.versions',
    label: 'Versions...',
    category: 'File',
    description: 'Look back at earlier versions of this drawing and bring one back.',
    help: 'version-history',
    keywords: ['version history', 'history', 'restore', 'go back', 'earlier', 'older', 'time machine', 'snapshot', 'lost', 'revert'],
    run: () => void import('./VersionsDialog').then((m) => m.openVersionsDialog()),
  },
]);
