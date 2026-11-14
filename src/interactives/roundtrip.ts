// The Interactives round trip, in the app: open a .flplay to edit the drawing inside it, and have Save put the changes
// back into the same .flplay (the "Update the Interactives file" toggle, remembered per drawing).
import { choose, type ChoiceDef } from '../core/choices';
import { store } from '../core/store';
import { sceneOf } from '../core/symbols';
import { baseName, desktop } from '../io/desktop';
import { clearAutosaveCopy, loadBytes, registerOpener, registerSaveHook } from '../io/document';
import { FileProblem, saveFile } from '../io/file';
import { notify } from '../io/notify';
import { defaultSettings } from '../export/plan';
import { getLink, readPlayable, setLink, type PlayableLink } from './link';

export const PLAYABLE_FILTERS = [{ name: 'Interactives animations', extensions: ['flplay'] }];
export const isPlayablePath = (p: string): boolean => /\.flplay$/i.test(p);

const saveTarget: ChoiceDef<'flplay' | 'both'> = {
  id: 'interactives.saveTarget',
  title: 'Saving a drawing from Interactives',
  question: 'This drawing came from an Interactives file (.flplay). The editable drawing travels inside it. Where should Save put your changes?',
  category: 'Files',
  help: 'edit-in-frameling',
  default: 'flplay',
  mustAsk: true,
  options: [
    { value: 'flplay', label: 'Just update the Interactives file', detail: 'One file to look after. Interactives picks up the changes next time it loads.' },
    { value: 'both', label: 'Also keep a .frameling file', detail: 'Asks where to save a .frameling the first time, then updates both.' },
  ],
};
export const interactivesChoices = [saveTarget];

/** Opens the drawing inside a .flplay. Resolves true when it's open. */
export async function openPlayableBytes(bytes: Uint8Array, path: string): Promise<boolean> {
  let p;
  try {
    p = readPlayable(bytes);
  } catch (e) {
    notify(e instanceof FileProblem ? e.message : 'Frameling could not open that file.', 'error');
    return false;
  }
  if (!p.source) {
    notify(`"${baseName(path)}" was exported without the editable drawing, so there's nothing to edit. Next time, tick "Include the editable drawing" when exporting for Interactives.`, 'warn', undefined, 10000);
    return false;
  }
  if (!(await loadBytes(p.source, null))) return false;
  const doc = store().get().doc;
  const old = getLink(doc.id);
  setLink(doc.id, { path, update: old && old.path === path ? old.update : true, scale: p.manifest.scale, transparent: p.manifest.background === null });
  void desktop()?.files.linkPlayable?.(path).catch(() => undefined);
  notify(`Editing the drawing from ${baseName(path)}. Saving updates it.`, 'info', undefined, 6000);
  return true;
}

export async function openPlayable(): Promise<boolean> {
  const api = desktop();
  if (!api?.files.openOther) {
    notify('Opening Interactives files needs the Frameling app.', 'info');
    return false;
  }
  const r = await api.files.openOther({ filters: PLAYABLE_FILTERS, title: 'Open an Interactives file' });
  if (!r) return false;
  if ('error' in r) {
    notify(r.error, 'error');
    return false;
  }
  return openPlayableBytes(r.bytes, r.path);
}

/** The link for the open drawing, if it came from a .flplay. */
export const currentLink = (): PlayableLink | null => getLink(store().get().doc.id);

export function toggleUpdate(): void {
  const doc = store().get().doc;
  const l = getLink(doc.id);
  if (!l) return;
  setLink(doc.id, { ...l, update: !l.update });
  notify(l.update ? `Saving won't change ${baseName(l.path)} now.` : `Saving updates ${baseName(l.path)} too.`, 'info', undefined, 3000);
  // Menus and the palette read the tick from the store; nudge them.
  store().setUi({});
}

/** Writes the drawing back into its .flplay, with the package's own size and see-through choice. */
export async function updatePlayable(link: PlayableLink): Promise<boolean> {
  const api = desktop();
  if (!api) return false;
  const st = store().get();
  const { doc, frame } = sceneOf(st.doc, st.ui.frame);
  try {
    const settings = { ...defaultSettings(doc), format: 'interactives' as const, range: 'all' as const, clipId: null, scale: link.scale, transparent: link.transparent, includeSource: true };
    const { runExport } = await import('../export/run');
    const r = await runExport({ doc, settings, currentFrame: frame, signal: new AbortController().signal, onProgress: () => undefined, appVersion: api.versions.app });
    if (r.kind !== 'file') throw new Error('unexpected');
    const w = await api.files.write(link.path, r.bytes);
    if ('error' in w) throw new FileProblem(w.error);
    notify(`Updated ${baseName(link.path)}.`, 'success', undefined, 2500);
    return true;
  } catch (e) {
    notify(`${baseName(link.path)} wasn't updated${e instanceof FileProblem ? `: ${e.message}` : '. Try File > Export > Export for Interactives.'}`, 'error', undefined, 9000);
    return false;
  }
}

/** Hooks Save and Open into the round trip. Run it as the feature (see index.ts) so turning the feature off takes them away. */
export function registerRoundTrip(): void {
  registerSaveHook({
    // No .frameling yet: the first time, ask where Save should go.
    instead: async () => {
      const link = currentLink();
      if (!link?.update) return null;
      if ((await choose('interactives.saveTarget')) === 'both') return null;
      const doc = store().rootDoc();
      if (!(await updatePlayable(link))) return false;
      if (store().rootDoc() === doc) store().setUi({ dirty: false });
      void clearAutosaveCopy();
      return true;
    },
    after: async (doc) => {
      const link = getLink(doc.id);
      if (link?.update) await updatePlayable(link);
    },
  });

  registerOpener(isPlayablePath, openPlayableBytes);
}

// Used by tests: the editable drawing as it would go back into the package.
export const sourceBytes = (): Uint8Array => saveFile(store().rootDoc());
