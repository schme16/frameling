// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getCommand, allHelp } from '../../src/core/registry';
import { getChoiceDef } from '../../src/core/choices';
import { drawingAt } from '../../src/core/doc';
import { MENUS, SUBMENUS } from '../../src/ui/menus';
import '../../src/aseprite';
import { asepriteDoc } from '../../src/aseprite/convert';
import { parseAseprite } from '../../src/aseprite/parse';

describe('Aseprite import in the app', () => {
  it('registers its commands, help topic and drop choice', () => {
    for (const id of ['file.openAseprite', 'file.importAseprite', 'palette.fromAseprite']) {
      const c = getCommand(id);
      expect(c, id).toBeDefined();
      expect(c!.help).toBe('aseprite-import');
    }
    expect(allHelp().some((t) => t.id === 'aseprite-import')).toBe(true);
    expect(getChoiceDef('aseprite.drop')?.default).toBe('open');
  });

  it('puts them in the File > Import submenu and the Pixel menu', () => {
    expect(MENUS.find((m) => m.label === 'File')!.items).toContain('sub:import');
    expect(SUBMENUS.import.items).toContain('file.importAseprite');
    expect(MENUS.find((m) => m.label === 'Pixel')!.items).toContain('palette.fromAseprite');
  });

  it('opens the help sample made by the real Aseprite', () => {
    const bytes = new Uint8Array(readFileSync(path.resolve(__dirname, '../../scripts/docs/help/assets/slime-bounce.aseprite')));
    const { doc, notes } = asepriteDoc(parseAseprite(bytes), 'slime');
    expect(notes).toEqual([]);
    expect(doc.layers.map((l) => l.name)).toEqual(['Shadow', 'Slime']);
    expect(doc.fps).toBe(10);
    expect(doc.length).toBe(7);
    expect(doc.clips.map((c) => [c.name, c.start, c.end])).toEqual([
      ['squash', 0, 3],
      ['jump', 4, 6],
    ]);
    expect(doc.palette!.colors).toHaveLength(6);
    expect(drawingAt(doc, doc.layers[1], 0)).toBeDefined();
  });
});
