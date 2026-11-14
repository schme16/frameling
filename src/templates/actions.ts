// What people do with their templates: save the open drawing as one, import one someone shared, share one, remove one.
import { rootDoc } from '../core/symbols';
import { withoutNotes } from '../notes/model';
import { store } from '../core/store';
import { baseName, desktop } from '../io/desktop';
import { FileProblem } from '../io/file';
import { notify, notifySaved } from '../io/notify';
import { can } from '../platform';
import { ask } from '../platform/ask';
import { fileSafe } from '../export/plan';
import { importUserTemplate, removeUserTemplate, saveUserTemplate, userTemplateBytes } from './user';
import type { TemplateMeta } from './community';

export const TEMPLATE_FILTERS = [{ name: 'Frameling templates', extensions: ['frameling'] }];

const KEY = 'frameling.templates.you';

/** The author and licence used last time, so they don't need typing again. */
export function rememberedAuthor(): { author: string; licence: string } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { author: typeof v.author === 'string' ? v.author : '', licence: typeof v.licence === 'string' ? v.licence : 'CC-BY-4.0' };
  } catch {
    return { author: '', licence: 'CC-BY-4.0' };
  }
}

function rememberAuthor(author: string, licence: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ author, licence }));
  } catch {
    // A nicety.
  }
}

/** The drawing to keep: as saved (no symbol open), with whatever is being edited inside it. */
export const templateDoc = () => withoutNotes(rootDoc(store().rootDoc()));

export async function saveTemplate(meta: TemplateMeta, share: boolean): Promise<boolean> {
  const doc = templateDoc();
  rememberAuthor(meta.author, meta.licence);
  let id: string;
  try {
    id = await saveUserTemplate(doc, meta, desktop()?.versions.app ?? '');
  } catch {
    notify("Frameling couldn't keep that template. Please try again.", 'error');
    return false;
  }
  notify(`"${meta.name}" is in Your templates. Find it under File > New.`, 'success', undefined, 5000, 'cheer');
  if (share) await shareTemplate(id, meta.name);
  return true;
}

/** Saves a copy of one of your templates as a file to share. */
export async function shareTemplate(cardId: string, name: string): Promise<void> {
  const api = desktop();
  const bytes = await userTemplateBytes(cardId);
  if (!api || !bytes) return;
  const target = await api.files.pickExportFile({ suggestedName: `${fileSafe(name, 'template')}.frameling`, filters: TEMPLATE_FILTERS, title: 'Save the template to share' });
  if (!target) return;
  const w = await api.files.write(target, bytes);
  if ('error' in w) return notify(w.error, 'error');
  notifySaved(`Saved ${baseName(target)}. Anyone can add it with Import template.`, 'success', can('showInFolder') ? { label: 'Show in folder', run: () => void api.files.showInFolder(target) } : undefined, 8000);
}

export async function importTemplate(): Promise<boolean> {
  const api = desktop();
  if (!api?.files.openOther) {
    notify('Importing templates needs the Frameling app.', 'info');
    return false;
  }
  const r = await api.files.openOther({ filters: TEMPLATE_FILTERS, title: 'Import a template' });
  if (!r) return false;
  if ('error' in r) {
    notify(r.error, 'error');
    return false;
  }
  try {
    const t = await importUserTemplate(r.bytes, baseName(r.path));
    notify(`"${t.name}" is in Your templates.`, 'success', undefined, 4000, 'cheer');
    return true;
  } catch (e) {
    notify(e instanceof FileProblem ? e.message : "That template couldn't be read.", 'error');
    return false;
  }
}

export async function removeTemplate(cardId: string, name: string): Promise<void> {
  const answer = await ask({
    title: 'Remove template',
    message: `Remove "${name}" from your templates?`,
    detail: 'Drawings you started from it stay as they are.',
    buttons: [
      { value: 'remove', label: 'Remove', primary: true },
      { value: 'cancel', label: 'Cancel' },
    ],
    cancel: 'cancel',
  });
  if (answer !== 'remove') return;
  await removeUserTemplate(cardId);
}
