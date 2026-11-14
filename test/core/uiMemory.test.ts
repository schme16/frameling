// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BRUSH, newDoc } from '../../src/core/doc';
import { setChoice } from '../../src/core/choices';
import { initialUi, resetStore, store } from '../../src/core/store';
import { applyRemembered, MAX_ONION_FRAMES, readRemembered, rememberedOf, sameRemembered, REMEMBERED_KEYS } from '../../src/core/uiMemory';
import { DEFAULT_TOOL_SETTINGS, getToolSettings, setToolSettings } from '../../src/tools/settings';
import { forgetDrawingSettings, startRememberingUi } from '../../src/tools/rememberUi';

const base = () => rememberedOf(initialUi(newDoc({ width: 100, height: 100 })));

beforeEach(() => {
  localStorage.clear();
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  setChoice('memory.onion', undefined);
  resetStore(newDoc({ width: 100, height: 100 }));
});

describe('reading what was saved', () => {
  it('takes good values, keeps the rest at the starting values', () => {
    const got = readRemembered({ color: '#ff0000', fillColor: null, strokeOn: false, loopPlayback: false, brush: { size: 30 }, onion: { enabled: true, before: 4 } }, base());
    expect(got.color).toBe('#ff0000');
    expect(got.fillColor).toBeNull();
    expect(got.strokeOn).toBe(false);
    expect(got.loopPlayback).toBe(false);
    expect(got.brush).toEqual({ ...DEFAULT_BRUSH, size: 30 });
    expect(got.onion).toMatchObject({ enabled: true, before: 4, after: 1, opacity: 0.35, tint: true });
  });

  it('drops values of the wrong kind and holds numbers to their range', () => {
    const got = readRemembered({ color: 'red', fillColor: 12, strokeOn: 'yes', brush: { size: 9999999, thinning: -5, streamline: 'a' }, onion: { before: 99, after: -3, opacity: 2, beforeColor: 'nope' } }, base());
    expect(got.color).toBeUndefined();
    expect(got.fillColor).toBeUndefined();
    expect(got.strokeOn).toBeUndefined();
    expect(got.brush?.size).toBe(100000);
    expect(got.brush?.thinning).toBe(-1);
    expect(got.brush?.streamline).toBe(DEFAULT_BRUSH.streamline);
    expect(got.onion?.before).toBe(MAX_ONION_FRAMES);
    expect(got.onion?.after).toBe(0);
    expect(got.onion?.opacity).toBe(1);
    expect(got.onion?.beforeColor).toBe('#ff6f91');
  });

  it('keeps a big brush across a restart, as big as the number box takes', () => {
    expect(readRemembered({ brush: { size: 4400 } }, base()).brush?.size).toBe(4400);
    expect(readRemembered({ brush: { size: 0.2 } }, base()).brush?.size).toBe(1);
  });

  it('copes with nothing, junk and old files', () => {
    expect(readRemembered(null, base())).toEqual({});
    expect(readRemembered('hello', base())).toEqual({});
    expect(readRemembered([], base())).toEqual({});
    expect(readRemembered({}, base())).toEqual({});
  });

  it('round trips what it keeps', () => {
    const ui = { ...initialUi(newDoc({ width: 10, height: 10 })), color: '#abcdef', loopPlayback: false, pingPong: true };
    const saved = JSON.parse(JSON.stringify(rememberedOf(ui)));
    expect(readRemembered(saved, base())).toEqual(rememberedOf(ui));
  });
});

describe('what is kept and what is not', () => {
  it('keeps the brush, colours, looping and onion, and never the playhead, selection or zoom', () => {
    expect([...REMEMBERED_KEYS].sort()).toEqual(['brush', 'color', 'fillColor', 'loopPlayback', 'onion', 'pingPong', 'strokeOn']);
    const ui = { ...initialUi(newDoc({ width: 10, height: 10 })), frame: 7, zoom: 3, playing: true, selection: ['a'] };
    expect(Object.keys(rememberedOf(ui))).not.toContain('frame');
    expect(Object.keys(rememberedOf(ui))).not.toContain('playing');
    expect(Object.keys(rememberedOf(ui))).not.toContain('zoom');
    expect(Object.keys(rememberedOf(ui))).not.toContain('selection');
  });

  it('applies saved values and can start with the onion off', () => {
    const ui = initialUi(newDoc({ width: 10, height: 10 }));
    const saved = readRemembered({ onion: { enabled: true, before: 3 }, color: '#00ff00' }, base());
    expect(applyRemembered(ui, saved).onion.enabled).toBe(true);
    const fresh = applyRemembered(ui, saved, false);
    expect(fresh.onion).toMatchObject({ enabled: false, before: 3 });
    expect(fresh.color).toBe('#00ff00');
    expect(fresh.frame).toBe(ui.frame);
  });

  it('knows when nothing kept has changed', () => {
    const ui = initialUi(newDoc({ width: 10, height: 10 }));
    expect(sameRemembered(rememberedOf(ui), rememberedOf({ ...ui, frame: 4 }))).toBe(true);
    expect(sameRemembered(rememberedOf(ui), rememberedOf({ ...ui, color: '#000000' }))).toBe(false);
  });
});

describe('across a launch', () => {
  const change = () => {
    const s = store();
    s.setUi({ color: '#123456', fillColor: '#654321', strokeOn: false, loopPlayback: false, brush: { ...s.get().ui.brush, size: 33, taperEnd: 12 }, onion: { ...s.get().ui.onion, enabled: true, before: 5, after: 3, opacity: 0.6 } });
  };

  it('saves a change, and a fresh launch has it all back', () => {
    const stop = startRememberingUi();
    change();
    store().setUi({ frame: 9, zoom: 2.5 });
    stop();
    // The next launch: a new store, and what was saved reloaded from the browser's storage.
    const saved = JSON.parse(localStorage.getItem('frameling.toolSettings') ?? '{}').remembered;
    setToolSettings({ remembered: saved });
    const next = resetStore(newDoc({ width: 100, height: 100 }));
    expect(next.get().ui.color).toBe('#1d1b26');
    startRememberingUi();
    const ui = next.get().ui;
    expect(ui.color).toBe('#123456');
    expect(ui.fillColor).toBe('#654321');
    expect(ui.strokeOn).toBe(false);
    expect(ui.loopPlayback).toBe(false);
    expect(ui.brush).toMatchObject({ size: 33, taperEnd: 12 });
    expect(ui.onion).toMatchObject({ enabled: true, before: 5, after: 3, opacity: 0.6 });
    expect(ui.frame).toBe(0);
    expect(ui.zoom).toBe(1);
  });

  it('does not write anything for a change that is not kept', () => {
    const stop = startRememberingUi();
    store().setUi({ frame: 3 });
    store().setUi({ zoom: 2 });
    expect(getToolSettings().remembered).toBeNull();
    stop();
  });

  it('starts the onion off when asked, and keeps the rest of it', () => {
    const stop = startRememberingUi();
    change();
    stop();
    setChoice('memory.onion', 'fresh');
    const next = resetStore(newDoc({ width: 100, height: 100 }));
    startRememberingUi();
    expect(next.get().ui.onion).toMatchObject({ enabled: false, before: 5, after: 3 });
    expect(next.get().ui.color).toBe('#123456');
  });

  it('survives damaged saved settings by starting from the usual values', () => {
    setToolSettings({ remembered: { color: 42, brush: 'big', onion: [] } as never });
    const next = resetStore(newDoc({ width: 100, height: 100 }));
    startRememberingUi();
    expect(next.get().ui.color).toBe('#1d1b26');
    expect(next.get().ui.brush).toEqual(DEFAULT_BRUSH);
  });

  it('puts everything back to the start on request', () => {
    const stop = startRememberingUi();
    change();
    forgetDrawingSettings();
    expect(store().get().ui.color).toBe('#1d1b26');
    expect(store().get().ui.onion.enabled).toBe(false);
    expect(store().get().ui.loopPlayback).toBe(true);
    stop();
  });

  it('keeps the loop and onion when another document is opened in the same session', () => {
    const s = resetStore(newDoc({ width: 100, height: 100 }));
    change();
    s.load(newDoc({ width: 50, height: 50 }));
    expect(s.get().ui.loopPlayback).toBe(false);
    expect(s.get().ui.onion).toMatchObject({ enabled: true, before: 5 });
    expect(s.get().ui.playing).toBe(false);
  });
});
