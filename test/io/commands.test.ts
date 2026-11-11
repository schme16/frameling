import { describe, expect, it } from 'vitest';
import { getCommand, getHelp } from '../../src/core/registry';
import '../../src/io/commands';
import '../../src/io/help';
import '../../src/export/commands';
import '../../src/export/help';

describe('files and export commands', () => {
  it('registers the file commands with their shortcuts', () => {
    const keys = (id: string) => getCommand(id)?.keys;
    expect(keys('file.open')).toEqual(['Mod+O']);
    expect(keys('file.save')).toEqual(['Mod+S']);
    expect(keys('file.saveAs')).toEqual(['Mod+Shift+S']);
    expect(keys('file.export')).toEqual(['Mod+E']);
    expect(keys('file.exportAgain')).toEqual(['Mod+Shift+E']);
    expect(getCommand('file.openRecent')).toBeDefined();
    // file.new belongs to the ui area.
    expect(getCommand('file.new')).toBeUndefined();
  });

  it('gives every command a help topic that exists', () => {
    for (const id of ['file.open', 'file.openRecent', 'file.save', 'file.saveAs', 'file.export', 'file.exportAgain']) {
      const help = getCommand(id)!.help!;
      expect(getHelp(help), id).toBeDefined();
    }
    for (const t of ['saving-and-opening', 'autosave', 'exporting', 'export-video-gif-apng', 'export-sprite-sheets', 'export-godot', 'export-svg']) {
      expect(getHelp(t)?.body.length, t).toBeGreaterThan(100);
    }
  });
});
