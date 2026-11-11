// Picking a plugin to install: a .zip from anywhere, or (desktop) a folder being worked on.
import { desktop } from '../io/desktop';
import { notify } from '../io/notify';
import { installFrom } from './manager';

export const PLUGIN_FILTERS = [{ name: 'Frameling plugins', extensions: ['zip', 'flplugin'] }];

export async function installFromFile(): Promise<boolean> {
  const api = desktop();
  if (!api?.files.openOther) {
    notify('Installing plugins needs the Frameling app.', 'info');
    return false;
  }
  const r = await api.files.openOther({ filters: PLUGIN_FILTERS, title: 'Install a plugin' });
  if (!r) return false;
  if ('error' in r) {
    notify(r.error, 'error');
    return false;
  }
  return installFrom(r.bytes);
}

export const canInstallFolder = (): boolean => !!desktop()?.files.readFolder;

export async function installFromFolder(): Promise<boolean> {
  const api = desktop();
  if (!api?.files.readFolder) return false;
  const r = await api.files.readFolder({ title: 'Install a plugin from its folder' });
  if (!r) return false;
  if ('error' in r) {
    notify(r.error, 'error');
    return false;
  }
  return installFrom(Object.fromEntries(r.files.map((f) => [f.name, f.bytes])));
}
