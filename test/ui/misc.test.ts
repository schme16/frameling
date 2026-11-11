// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { getPrefs, resetPrefs, setPrefs, effectiveTheme } from '../../src/ui/prefs';
import { clearToasts, dismissToast, toast, toasts } from '../../src/ui/toast';
import { docFromCustom, docFromPreset, PRESETS } from '../../src/ui/presets';
import { allQuests, getQuest, questProgress, startQuest } from '../../src/ui/quests';
import { tipFor } from '../../src/ui/Tooltips';
import { registerCommand } from '../../src/core/registry';
import { helpIdFor } from '../../src/ui/help/context';
import { TIPS, tipText } from '../../src/ui/tips';
import { ICON_NAMES } from '../../src/ui/icons';

beforeEach(() => {
  resetPrefs();
  clearToasts();
});

describe('preferences', () => {
  it('puts theme, look and motion on <html>', () => {
    setPrefs({ theme: 'dark', look: 'crisp', reduceMotion: true });
    const r = document.documentElement;
    expect(r.dataset.theme).toBe('dark');
    expect(r.dataset.look).toBe('crisp');
    expect(r.dataset.motion).toBe('reduce');
    setPrefs({ theme: 'system', look: 'cosy', reduceMotion: false });
    expect(r.dataset.theme).toBeUndefined();
    expect(r.dataset.look).toBe('cosy');
    expect(r.dataset.motion).toBeUndefined();
  });
  it('is remembered in localStorage', () => {
    setPrefs({ sounds: true });
    expect(JSON.parse(localStorage.getItem('frameling.prefs.v1')!).sounds).toBe(true);
    expect(getPrefs().sounds).toBe(true);
  });
  it('an explicit theme is the effective one', () => {
    setPrefs({ theme: 'light' });
    expect(effectiveTheme()).toBe('light');
  });
});

describe('toasts', () => {
  it('shows, gives actions longer, and dismisses', () => {
    const a = toast('Hello');
    const b = toast('Deleted', { kind: 'warn', action: { label: 'Undo', run: () => {} } });
    expect(toasts.get().map((t) => t.message)).toEqual(['Hello', 'Deleted']);
    expect(toasts.get()[1].duration).toBeGreaterThan(toasts.get()[0].duration);
    dismissToast(a);
    expect(toasts.get().map((t) => t.id)).toEqual([b]);
  });
  it('keeps only a few', () => {
    for (let i = 0; i < 9; i++) toast(`n${i}`);
    expect(toasts.get().length).toBeLessThanOrEqual(4);
    expect(toasts.get().at(-1)!.message).toBe('n8');
  });
});

describe('new drawing presets', () => {
  it('has the four cards with the sizes promised', () => {
    const by = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
    expect([by.doodle.width, by.doodle.height, by.doodle.fps]).toEqual([1280, 720, 12]);
    expect([by.square.width, by.square.height]).toEqual([1080, 1080]);
  });
  it('pixel presets are the grid times the pixel size, with a pixel layer', () => {
    const game = docFromPreset(PRESETS.find((p) => p.id === 'game-sprite')!);
    expect([game.width, game.height]).toEqual([512, 512]);
    expect(game.layers[0]).toMatchObject({ kind: 'pixel', pixelSize: 8 });
    const tiny = docFromPreset(PRESETS.find((p) => p.id === 'tiny-sprite')!);
    expect([tiny.width, tiny.height]).toEqual([512, 512]);
    expect(tiny.layers[0]).toMatchObject({ kind: 'pixel', pixelSize: 16 });
  });
  it('vector presets get a vector layer', () => {
    expect(docFromPreset(PRESETS[0]).layers[0].kind).toBe('vector');
  });
  it('custom keeps numbers sensible', () => {
    const d = docFromCustom({ name: '  ', width: -5, height: 999999, fps: 0, pixel: false, pixelSize: 8 });
    expect(d.name).toBe('Untitled');
    expect(d.width).toBe(1);
    expect(d.height).toBe(8192);
    expect(d.fps).toBe(1);
    const p = docFromCustom({ name: 'Hero', width: 20, height: 10, fps: 8, pixel: true, pixelSize: 4 });
    expect([p.width, p.height, p.fps]).toEqual([80, 40, 8]);
    expect(p.layers[0]).toMatchObject({ kind: 'pixel', pixelSize: 4 });
  });
});

describe('quests', () => {
  it('has the first-animation stub and can start it', () => {
    expect(getQuest('first-animation')?.steps.length).toBeGreaterThan(2);
    expect(allQuests().length).toBeGreaterThan(0);
    expect(startQuest('first-animation')).toBe(true);
    expect(questProgress.get().active).toBe('first-animation');
    expect(startQuest('nope')).toBe(false);
  });
});

describe('tooltips and context help', () => {
  it('reads a command for its name, shortcut and help', () => {
    registerCommand({ id: 'tip.cmd', label: 'Tippy', category: 'Test', keys: ['Mod+T'], description: 'Does a thing.', help: 'undo', run: () => {} });
    const el = document.createElement('button');
    el.setAttribute('data-command', 'tip.cmd');
    const tip = tipFor(el)!;
    expect(tip.title).toBe('Tippy');
    expect(tip.desc).toBe('Does a thing.');
    expect(tip.keys).toEqual(['Mod+t']);
  });
  it('reads plain data-tip and title, title winning nothing over data-tip', () => {
    const el = document.createElement('div');
    el.setAttribute('title', 'Hello');
    expect(tipFor(el)!.title).toBe('Hello');
    el.setAttribute('data-tip', 'Hi');
    expect(tipFor(el)!.title).toBe('Hi');
    expect(tipFor(document.createElement('div'))).toBeNull();
  });
  it('F1 finds the help id on the element or the thing around it', () => {
    registerCommand({ id: 'ctx.cmd', label: 'C', category: 'Test', help: 'from-command', run: () => {} });
    const outer = document.createElement('div');
    outer.setAttribute('data-help', 'outer-topic');
    const inner = document.createElement('button');
    outer.append(inner);
    expect(helpIdFor(inner)).toBe('outer-topic');
    inner.setAttribute('data-command', 'ctx.cmd');
    expect(helpIdFor(inner)).toBe('from-command');
    expect(helpIdFor(document.createElement('span'))).toBeNull();
  });
});

describe('tips and icons', () => {
  it('fills in shortcuts, and never shows a raw placeholder', () => {
    for (const t of TIPS) expect(tipText(t)).not.toContain('{key');
  });
  it('has every icon the app was promised', () => {
    const need = 'sliders brush pencil eraser fill rect ellipse line select hand zoom eyedropper layers timeline play pause stop prev next first last onion plus minus trash eye eye-off lock unlock duplicate settings help search export save open new undo redo palette clip marker key hold folder pixel vector close check chevron-left chevron-right chevron-up chevron-down grip sparkle heart loop film image grid warning info'.split(' ');
    for (const n of need) expect(ICON_NAMES, n).toContain(n);
  });
});
