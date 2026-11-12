// @vitest-environment jsdom
// The "Aseprite keys" set: Aseprite's own keys for the commands we have, with the old id still working.
import { describe, expect, it } from 'vitest';
import { allCommands } from '../../src/core/registry';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { allConflicts, buildKeymap, effectiveKeys, layeredOverrides, normaliseCombo } from '../../src/ui/keys';
import { isKeymapSet, keymapSet, KEYMAP_SETS } from '../../src/ui/keymapSets';
import '../../src/renderer/features';

const cmds = () => (syncDynamicCommands(), allCommands());
const keymap = () => buildKeymap(cmds(), layeredOverrides('pixel', cmds(), {}));
/** The command ids a key runs in the set, on a pixel layer. */
const runs = (key: string) => (keymap().get(normaliseCombo(key)) ?? []).filter((c) => !c.layers || c.layers.includes('pixel')).map((c) => c.id);

describe('Aseprite keys', () => {
  it('is the old pixel set under its new name', () => {
    expect(isKeymapSet('pixel')).toBe(true);
    expect(keymapSet('pixel').label).toBe('Aseprite keys');
    expect(KEYMAP_SETS.filter((s) => s.label.includes('Aseprite')).map((s) => s.id)).toEqual(['pixel']);
  });

  it.each([
    // tools
    ['b', 'tools.pencil'],
    ['e', 'tools.eraser'],
    ['g', 'tools.fill'],
    ['i', 'tools.eyedropper'],
    ['l', 'tools.line'],
    ['u', 'tools.rect'],
    ['Shift+U', 'tools.ellipse'],
    ['Shift+D', 'tools.polygon'],
    ['m', 'tools.pixel-select'],
    ['v', 'tools.pixel-select'],
    ['q', 'select.lasso'],
    ['w', 'select.wand'],
    ['Shift+Alt+M', 'pixel.mirror'],
    // colours, size, palette
    ['x', 'colors.swap'],
    ['[', 'pixel.previousColor'],
    [']', 'pixel.nextColor'],
    ['+', 'pixel.sizeUp'],
    ['=', 'pixel.sizeUp'],
    ['-', 'pixel.sizeDown'],
    // zoom and panels
    ['1', 'pixel.zoom1'],
    ['2', 'pixel.zoom2'],
    ['3', 'pixel.zoom3'],
    ['4', 'pixel.zoom4'],
    ['5', 'pixel.zoom5'],
    ['6', 'pixel.zoom6'],
    ['Mod+0', 'view.fit'],
    ['Tab', 'view.hidePanels'],
    // frames
    ['Alt+ArrowLeft', 'timeline.prevFrame'],
    ['Alt+ArrowRight', 'timeline.nextFrame'],
    ['ArrowLeft', 'select.nudgeLeft'],
    ['ArrowRight', 'select.nudgeRight'],
    ['ArrowUp', 'select.nudgeUp'],
    ['Shift+ArrowDown', 'select.nudgeDownMore'],
    ['Alt+N', 'timeline.duplicateKey'],
    ['Alt+B', 'timeline.newKey'],
    ['Alt+M', 'timeline.insertFrame'],
    ['Alt+D', 'timeline.duplicateKey'],
    ['Alt+C', 'timeline.removeFrame'],
    ['Home', 'timeline.firstFrame'],
    ['End', 'timeline.lastFrame'],
    ['Enter', 'timeline.play'],
    ['F3', 'timeline.toggleOnion'],
    // view, sprite, files
    ["Mod+Shift+'", 'view.pixelGrid'],
    ['Mod+E', 'file.export'],
    ['Mod+Shift+X', 'file.exportAgain'],
    ['c', 'document.settings'],
    ['Shift+H', 'pixel.flipH'],
    ['Shift+V', 'pixel.flipV'],
  ])('%s runs %s', (key, id) => {
    expect(runs(key)).toEqual([id]);
  });

  it('shares no key between two commands that work in the same place', () => {
    expect([...allConflicts(cmds(), layeredOverrides('pixel', cmds(), {})).keys()]).toEqual([]);
  });

  it('leaves no command without a key that had one', () => {
    const o = layeredOverrides('pixel', cmds(), {});
    expect(cmds().filter((c) => c.keys?.length && effectiveKeys(c, o).length === 0).map((c) => c.id)).toEqual([]);
  });

  it('every command it names exists', () => {
    const ids = new Set(cmds().map((c) => c.id));
    for (const id of Object.keys(keymapSet('pixel').keys)) expect(ids.has(id), id).toBe(true);
  });

  it('Frameling and Flash get the habit keys too, except = and - that already add and remove frames', () => {
    for (const set of ['frameling', 'flash']) {
      const km = buildKeymap(cmds(), layeredOverrides(set, cmds(), {}));
      const at = (k: string) => (km.get(normaliseCombo(k)) ?? []).map((c) => c.id);
      expect(at('+'), set).toEqual(['pixel.sizeUp']);
      expect(at('['), set).toEqual(['pixel.previousColor']);
      expect(at(']'), set).toEqual(['pixel.nextColor']);
      for (let i = 1; i <= 6; i++) expect(at(String(i)), `${set} ${i}`).toEqual([`pixel.zoom${i}`]);
      expect(at('-'), set).not.toContain('pixel.sizeDown');
      expect(at('ArrowLeft'), set).toEqual(['select.nudgeLeft']);
    }
    expect(buildKeymap(cmds(), layeredOverrides('frameling', cmds(), {})).get('-')?.map((c) => c.id)).toEqual(['timeline.removeFrame']);
  });
});
