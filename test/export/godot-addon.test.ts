import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { GODOT_ADDON_DIR, GODOT_ADDON_FILES, godotAddonZip } from '../../src/export/godot-addon';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../godot/addons/frameling_importer');

describe('the Godot importer add-on zip', () => {
  it('carries every file of the add-on, unchanged, under addons/frameling_importer', () => {
    const files = unzipSync(godotAddonZip());
    const onDisk = readdirSync(dir).filter((f) => !f.endsWith('.uid')).sort();
    expect(Object.keys(GODOT_ADDON_FILES).sort()).toEqual(onDisk);
    expect(Object.keys(files).sort()).toEqual(onDisk.map((f) => `${GODOT_ADDON_DIR}/${f}`));
    for (const f of onDisk) expect(strFromU8(files[`${GODOT_ADDON_DIR}/${f}`]).replace(/\r\n/g, '\n'), f).toBe(readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n'));
  });

  it('names its plugin script in plugin.cfg', () => {
    expect(GODOT_ADDON_FILES['plugin.cfg']).toMatch(/script="plugin.gd"/);
  });
});
