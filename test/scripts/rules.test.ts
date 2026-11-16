import { describe, expect, it } from 'vitest';
import { cleanAppSet, isRunnable } from '../../src/plugins/appRules';

describe('what a script may press', () => {
  it('may press the drawing commands', () => {
    for (const id of ['edit.duplicate', 'select.all', 'select.nudgeRightMore', 'layers.addVector', 'timeline.newKey', 'arrange.group', 'effects.addBlur']) expect(isRunnable(id), id).toBe(true);
  });

  it('may not press what reaches outside the drawing', () => {
    for (const id of ['file.save', 'file.open', 'file.exportPdf', 'file.importSvg', 'app.restart', 'plugins.install', 'plugin.x.y', 'script.sabc12', 'scripts.open', 'audience.start', 'streamdoor.roll', 'stream.obsLink', 'twitch.connect', 'review.join', 'help.checkUpdates', 'help.sendReport', 'help.about', 'settings.reset', 'edit.undo', 'edit.redo', 'history.back', 'pixel.new', 'keys.set.flash', 'features.streamingOff', 'quests.open', 'perf.copyReport', 'view.preferences', 'popout.toggle', 'capture.start', 'timelapse.start']) expect(isRunnable(id), id).toBe(false);
  });

  it('refuses ids that are not ids at all', () => {
    for (const id of ['', ' ', 'a b', '../x', 'x'.repeat(81), '__proto__ ', 'file.save\n']) expect(isRunnable(id), JSON.stringify(id)).toBe(false);
  });
});

describe('what a script may choose', () => {
  it('keeps the known fields', () => {
    expect(cleanAppSet({ frame: 3.4, layerId: 'l1', selection: ['a', 'b', 'a'], color: '#ff0000', fillColor: null, bogus: 1 })).toEqual({ frame: 3, layerId: 'l1', selection: ['a', 'b'], color: '#ff0000', fillColor: null });
  });

  it('says what is wrong in plain words', () => {
    expect(() => cleanAppSet({ frame: -1 })).toThrow(/frame/);
    expect(() => cleanAppSet({ layerId: 5 })).toThrow(/layerId/);
    expect(() => cleanAppSet({ selection: 'a' })).toThrow(/selection/);
    expect(() => cleanAppSet({ selection: [1] })).toThrow(/selection/);
    expect(() => cleanAppSet({ selection: Array.from({ length: 5001 }, (_, i) => `s${i}`) })).toThrow(/up to 5000/);
    expect(() => cleanAppSet({ color: 'red' })).toThrow(/color/);
    expect(() => cleanAppSet({ fillColor: 'nope' })).toThrow(/fillColor/);
  });
});
