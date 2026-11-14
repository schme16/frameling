// @vitest-environment jsdom
// The saved brushes in use: picking, saving, the changed marker, delete with undo, "save every change", the commands.
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import { followTarget, startBrushPresets, type BrushEdits } from '../../src/brushes/presets';
import { DEFAULT_BRUSH, newDoc } from '../../src/core/doc';
import { _resetChoicesForTests, setChoice } from '../../src/core/choices';
import { allCommands, getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { STARTERS, sameBrush } from '../../src/brushes/model';
import * as P from '../../src/brushes/presets';
import { toasts } from '../../src/ui/toast';

let stop: () => void = () => {};
beforeEach(() => {
  stop();
  localStorage.clear();
  _resetChoicesForTests();
  resetStore(newDoc());
  for (const p of [...P.myBrushes()]) {
    P.applyPreset(p.id);
    P.deleteActive();
  }
  toasts.set(() => []);
  stop = startBrushPresets();
});

const brushNow = () => store().get().ui.brush;
const setSize = (size: number) => store().setUi((u) => ({ brush: { ...u.brush, size } }));

describe('picking', () => {
  it('puts a starter brush into the brush in use and lights it', () => {
    expect(P.applyPreset(STARTERS[1].id)).toBe(true);
    expect(sameBrush(brushNow(), STARTERS[1].brush)).toBe(true);
    expect(P.currentBrushState()).toEqual({ activeId: STARTERS[1].id, changed: false });
  });
  it('says no to a brush that is gone', () => {
    expect(P.applyPreset('nope')).toBe(false);
  });
  it('has one command per brush, and drops it when the brush goes', () => {
    expect(getCommand(`brush.pick.${STARTERS[0].id}`)?.label).toBe('Brush: Ink');
    setSize(33);
    const mine = P.saveCurrentAs('Shading')!;
    expect(getCommand(`brush.pick.${mine.id}`)?.label).toBe('Brush: Shading');
    P.deleteActive();
    expect(getCommand(`brush.pick.${mine.id}`)).toBeUndefined();
  });
  it('picks from the palette command and moves to the brush tool', () => {
    store().setUi({ tool: 'eraser' });
    void getCommand(`brush.pick.${STARTERS[3].id}`)!.run();
    expect(store().get().ui.tool).toBe('brush');
    expect(sameBrush(brushNow(), STARTERS[3].brush)).toBe(true);
  });
});

describe('saving your own', () => {
  it('keeps the brush in use under a name, lights it, and keeps it across a reload of the list', () => {
    setSize(41);
    const p = P.saveCurrentAs('  Soft shading ')!;
    expect(p.name).toBe('Soft shading');
    expect(P.currentBrushState().activeId).toBe(p.id);
    const stored = JSON.parse(localStorage.getItem('frameling.brushPresets')!);
    expect(stored.presets).toEqual([expect.objectContaining({ name: 'Soft shading', tool: 'brush', brush: expect.objectContaining({ size: 41 }) })]);
  });
  it('warns on an empty name and saves nothing', () => {
    expect(P.saveCurrentAs('   ')).toBeNull();
    expect(P.myBrushes()).toHaveLength(0);
    expect(toasts.get().at(-1)?.kind).toBe('warn');
  });
  it('shows the picked brush as changed after a slider moves, and Update keeps the change', () => {
    setSize(30);
    const p = P.saveCurrentAs('Mine')!;
    setSize(31);
    expect(P.currentBrushState()).toEqual({ activeId: p.id, changed: true });
    expect(P.myBrushes()[0].brush.size).toBe(30);
    expect(P.updateActive()).toBe(true);
    expect(P.myBrushes()[0].brush.size).toBe(31);
    expect(P.currentBrushState().changed).toBe(false);
  });
  it('Revert goes back to the saved brush', () => {
    setSize(30);
    P.saveCurrentAs('Mine');
    setSize(60);
    expect(P.revertActive()).toBe(true);
    expect(brushNow().size).toBe(30);
  });
  it('cannot update or delete a starter', () => {
    P.applyPreset(STARTERS[0].id);
    setSize(99);
    expect(P.updateActive()).toBe(false);
    expect(P.deleteActive()).toBe(false);
    expect(P.activeOwn()).toBeUndefined();
  });
  it('renames the lit brush', () => {
    setSize(30);
    P.saveCurrentAs('Mine');
    expect(P.renameActive('Better')).toBe(true);
    expect(P.myBrushes()[0].name).toBe('Better');
    expect(P.renameActive('  ')).toBe(false);
  });
  it('deletes, and Undo on the toast puts it back where it was', () => {
    setSize(30);
    P.saveCurrentAs('A');
    setSize(31);
    P.saveCurrentAs('B');
    P.applyPreset(P.myBrushes()[0].id);
    expect(P.deleteActive()).toBe(true);
    expect(P.myBrushes().map((p) => p.name)).toEqual(['B']);
    toasts.get().at(-1)!.action!.run();
    expect(P.myBrushes().map((p) => p.name)).toEqual(['A', 'B']);
    expect(P.currentBrushState().activeId).toBe(P.myBrushes()[0].id);
  });
});

describe('steps and commands', () => {
  it('steps through the row and wraps', () => {
    P.applyPreset(STARTERS[0].id);
    P.stepBrush(1);
    expect(P.currentBrushState().activeId).toBe(STARTERS[1].id);
    P.stepBrush(-1);
    P.stepBrush(-1);
    expect(P.currentBrushState().activeId).toBe(P.everyBrush().at(-1)!.id);
  });
  it('registers the commands with help, and their keys do not need the mouse', () => {
    for (const id of ['brush.saveAs', 'brush.update', 'brush.rename', 'brush.delete', 'brush.next', 'brush.previous', 'brush.saveFile', 'brush.copyText', 'brush.addFile', 'brush.pasteText']) {
      expect(getCommand(id)?.help).toBe('brush-presets');
    }
    expect(allCommands().filter((c) => c.id.startsWith('brush.pick.'))).toHaveLength(STARTERS.length);
  });
  it('Update and Delete are greyed out until a saved brush of yours is lit', () => {
    P.applyPreset(STARTERS[0].id);
    expect(getCommand('brush.update')!.enabled!(store().get())).toBe(false);
    expect(getCommand('brush.delete')!.enabled!(store().get())).toBe(false);
    setSize(20);
    P.saveCurrentAs('X');
    expect(getCommand('brush.delete')!.enabled!(store().get())).toBe(true);
    expect(getCommand('brush.update')!.enabled!(store().get())).toBe(false);
    setSize(21);
    expect(getCommand('brush.update')!.enabled!(store().get())).toBe(true);
  });
});

describe('Changing a saved brush', () => {
  const own = { id: 'a', name: 'A', tool: 'brush' as const, brush: DEFAULT_BRUSH };
  it('only follows when the choice says so, for a saved brush that differs', () => {
    const moved = { ...DEFAULT_BRUSH, size: 3 };
    expect(followTarget('keep' as BrushEdits, own, moved)).toBeNull();
    expect(followTarget('follow', undefined, moved)).toBeNull();
    expect(followTarget('follow', own, DEFAULT_BRUSH)).toBeNull();
    expect(followTarget('follow', own, moved)).toEqual(moved);
  });
  it('keeps the saved brush as saved by default', () => {
    setSize(30);
    P.saveCurrentAs('Mine');
    setSize(44);
    expect(P.myBrushes()[0].brush.size).toBe(30);
  });
  it('saves every change into the picked brush when set to follow, never into a starter', () => {
    setChoice('brushes.edits', 'follow');
    setSize(30);
    P.saveCurrentAs('Mine');
    setSize(44);
    expect(P.myBrushes()[0].brush.size).toBe(44);
    expect(P.currentBrushState().changed).toBe(false);
    P.applyPreset(STARTERS[0].id);
    setSize(70);
    expect(STARTERS[0].brush.size).not.toBe(70);
    expect(P.myBrushes()[0].brush.size).toBe(44);
  });
});

describe('adding shared brushes', () => {
  it('adds from text and says how many', () => {
    const text = JSON.stringify({ format: 'frameling-brushes', version: 1, presets: [{ name: 'Fur', brush: { size: 12 } }, { name: 'Fur', brush: { size: 14 } }] });
    expect(P.addBrushesFromText(text)).toBe(true);
    expect(P.myBrushes().map((p) => p.name)).toEqual(['Fur', 'Fur 2']);
    expect(toasts.get().at(-1)!.message).toMatch(/Added 2 brushes/);
  });
  it('refuses nonsense with a message and changes nothing', () => {
    expect(P.addBrushesFromText('hello')).toBe(false);
    expect(P.myBrushes()).toHaveLength(0);
    expect(toasts.get().at(-1)!.kind).toBe('warn');
  });
});
