// Export > Godot importer add-on: saves the Godot 4 add-on (godot/addons/frameling_importer) as a zip that unpacks
// into a Godot project. With it switched on, Godot reads .flplay packages straight in and imports them again when
// they change. The add-on's own files are the source; they're bundled here as text.
import { strToU8, zipSync, type Zippable } from 'fflate';
import { baseName, desktop } from '../io/desktop';
import { notify } from '../io/notify';
import { can } from '../platform';
import pluginCfg from '../../godot/addons/frameling_importer/plugin.cfg?raw';
import pluginGd from '../../godot/addons/frameling_importer/plugin.gd?raw';
import flplayGd from '../../godot/addons/frameling_importer/flplay.gd?raw';
import framesGd from '../../godot/addons/frameling_importer/frames_importer.gd?raw';
import sceneGd from '../../godot/addons/frameling_importer/scene_importer.gd?raw';

export const GODOT_ADDON_DIR = 'addons/frameling_importer';

export const GODOT_ADDON_FILES: Record<string, string> = {
  'plugin.cfg': pluginCfg,
  'plugin.gd': pluginGd,
  'flplay.gd': flplayGd,
  'frames_importer.gd': framesGd,
  'scene_importer.gd': sceneGd,
};

/** The add-on as a zip, laid out so unzipping it in a Godot project's folder puts it in addons/frameling_importer. */
export function godotAddonZip(): Uint8Array {
  const files: Zippable = {};
  for (const [name, text] of Object.entries(GODOT_ADDON_FILES)) files[`${GODOT_ADDON_DIR}/${name}`] = strToU8(text);
  return zipSync(files);
}

export async function saveGodotAddon(): Promise<void> {
  const api = desktop();
  const bytes = godotAddonZip();
  if (!api) {
    // In a browser: hand it over as a download.
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'frameling_importer.zip' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const target = await api.files.pickExportFile({ suggestedName: 'frameling_importer.zip', filters: [{ name: 'Zip', extensions: ['zip'] }], title: 'Save the Godot importer add-on' });
  if (!target) return;
  const r = await api.files.write(target, bytes);
  if ('error' in r) return notify(r.error, 'error');
  notify(`Saved ${baseName(target)}. Unzip it into your Godot project, then switch it on in Project Settings, Plugins.`, 'success', can('showInFolder') ? { label: 'Show in folder', run: () => void api.files.showInFolder(target) } : undefined, 9000, 'cheer', 'exported');
}
