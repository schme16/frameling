// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { cleanDpi, DEFAULT_DPI, docDpi, formatLength, formatSize, isUnit, pxTo, roundIn, toPx, UNITS } from '../../src/core/units';
import { loadFile, saveFile } from '../../src/io/file';
import { FIRST_QUEST, INTERESTS, isStrawberry, makeReaction, planFor, reduceFlow, sillyName, startFlow, STEPS, strawberryFor, type FlowState } from '../../src/ui/onboarding/flow';
import { docFromCustom } from '../../src/ui/presets';
import { getPrefs, migratePrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';
import { BUILT_IN_THEMES } from '../../src/ui/themes/builtIn';
import { getCommand, getHelp } from '../../src/core/registry';
import '../../src/renderer/features';

const run = (s: FlowState, ...types: ('next' | 'back' | 'skip')[]) => types.reduce((st, type) => reduceFlow(st, { type }), s);

describe('onboarding flow', () => {
  it('walks every step in order and ends done after the last', () => {
    let s = startFlow('The Tiny Turnip');
    const seen = [s.step];
    for (let i = 1; i < STEPS.length; i++) {
      s = run(s, 'next');
      seen.push(s.step);
    }
    expect(seen).toEqual(STEPS);
    expect(s.ended).toBeNull();
    s = run(s, 'next');
    expect(s.ended).toBe('done');
    // Ended flows don't move.
    expect(run(s, 'back').step).toBe('done');
  });

  it('goes back but not before the start, and skip ends it from any step', () => {
    const s = startFlow();
    expect(run(s, 'back').step).toBe('hello');
    expect(run(s, 'next', 'next', 'back').step).toBe('make');
    for (let i = 0; i < STEPS.length; i++) {
      const at = reduceFlow(s, { type: 'goto', step: STEPS[i] });
      expect(run(at, 'skip').ended).toBe('skipped');
    }
  });

  it('toggles interests, keeps them in card order and remembers the last pick for Quill', () => {
    let s = startFlow();
    s = reduceFlow(s, { type: 'toggle', interest: 'tiles' });
    s = reduceFlow(s, { type: 'toggle', interest: 'cartoons' });
    expect(s.interests).toEqual(['cartoons', 'tiles']);
    expect(s.lastPick).toBe('cartoons');
    expect(makeReaction(s)).toBe(INTERESTS.find((x) => x.id === 'cartoons')!.reaction);
    s = reduceFlow(s, { type: 'toggle', interest: 'cartoons' });
    expect(s.interests).toEqual(['tiles']);
    expect(s.lastPick).toBeNull();
    expect(makeReaction(s)).toMatch(/Great picks/);
    expect(makeReaction(startFlow())).toMatch(/no wrong answers/i);
    // Unknown interests are ignored.
    expect(reduceFlow(s, { type: 'toggle', interest: 'nope' as never })).toBe(s);
  });

  it('caps the name length', () => {
    expect(reduceFlow(startFlow(), { type: 'name', name: 'x'.repeat(200) }).name).toHaveLength(80);
  });

  it('plans a workspace, template, quest and help from the picks', () => {
    expect(planFor([])).toMatchObject({ workspace: 'draw', template: 'blank-vector', quest: FIRST_QUEST });
    expect(planFor(['sprites'])).toMatchObject({ workspace: 'pixel', template: 'hero-sprites' });
    expect(planFor(['tiles', 'cartoons'])).toMatchObject({ workspace: 'animate', template: 'bouncing-ball' });
    expect(planFor(['motion']).help).toContain('tweens');
    // Pixel people get a pixel grid for a blank page; everyone else the plain page.
    expect(planFor(['sprites']).blank).toBe('blank-pixel');
    expect(planFor(['tiles', 'cartoons']).blank).toBeUndefined();
    expect(planFor(['tiles']).panel).toBe('tileset');
    expect(planFor(['tiles', 'sprites', 'motion', 'cartoons']).help.length).toBeLessThanOrEqual(4);
    // Newcomers get the 60-second quest first, then the one that suits them.
    expect(planFor(['tiles']).quest).toBe(FIRST_QUEST);
    expect(planFor(['tiles'], [FIRST_QUEST]).quest).toBe('tiles');
    expect(planFor(['interactives'], [FIRST_QUEST]).quest).toBe('share-it');
  });

  it('every suggested template, quest and help topic is real', async () => {
    const { findTemplate } = await import('../../src/templates');
    const { getQuest } = await import('../../src/quests');
    for (const x of INTERESTS) {
      for (const done of [[], [FIRST_QUEST]]) {
        const p = planFor([x.id], done);
        expect(findTemplate(p.template), p.template).toBeTruthy();
        if (p.blank) expect(findTemplate(p.blank), p.blank).toBeTruthy();
        expect(getQuest(p.quest), p.quest).toBeTruthy();
        for (const h of p.help) expect(getHelp(h), h).toBeTruthy();
      }
    }
  });

  it('rolls silly names, and never the same one twice in a row', () => {
    expect(sillyName(() => 0)).toBe('The Wobbly Pancake');
    expect(sillyName(() => 0.999)).toMatch(/^The \w+ \w+$/);
    expect(sillyName(() => 0, 'The Wobbly Pancake')).not.toBe('The Wobbly Pancake');
  });

  it("finds Quill's favourite Strawberry themes", () => {
    expect(strawberryFor(BUILT_IN_THEMES, 'light')?.id).toBe('strawberry');
    expect(strawberryFor(BUILT_IN_THEMES, 'dark')?.id).toBe('strawberry-night');
    // Without the exact ids, any strawberry of that mode will do, and none gives null.
    const fallback = [{ id: 'my-strawberry-copy', name: 'Mine', mode: 'dark' as const }];
    expect(strawberryFor(fallback, 'dark')?.id).toBe('my-strawberry-copy');
    expect(strawberryFor(fallback, 'light')).toBeNull();
    expect(isStrawberry({ id: 'x', name: 'Strawberry Night', mode: 'dark' })).toBe(true);
    expect(isStrawberry(null)).toBe(false);
  });

  it('has a command, a menu-able help topic and a units topic', () => {
    expect(getCommand('help.meetQuill')).toBeTruthy();
    expect(getHelp('first-run')).toBeTruthy();
    expect(getHelp('units')).toBeTruthy();
  });
});

describe('onboarding prefs', () => {
  beforeEach(() => resetPrefs());

  it('defaults to not onboarded and pixels', () => {
    expect(getPrefs().onboarded).toBe(false);
    expect(getPrefs().units).toBe('px');
  });

  it('writes and reads back units and onboarded, refusing junk', () => {
    setPrefs({ units: 'mm', onboarded: true });
    const saved = JSON.parse(localStorage.getItem('frameling.prefs.v1')!);
    expect(saved.units).toBe('mm');
    expect(saved.onboarded).toBe(true);
    expect(migratePrefs(saved)).toMatchObject({ units: 'mm', onboarded: true });
    expect(migratePrefs({ units: 'furlongs', onboarded: 'yes' })).toMatchObject({ units: 'px', onboarded: false });
  });
});

describe('units', () => {
  it('converts at 96 DPI by default', () => {
    expect(pxTo(96, 'in')).toBe(1);
    expect(pxTo(96, 'mm')).toBeCloseTo(25.4);
    expect(pxTo(96, 'cm')).toBeCloseTo(2.54);
    expect(pxTo(96, 'pt')).toBeCloseTo(72);
    expect(pxTo(123, 'px')).toBe(123);
  });

  it('round trips through every unit and DPI', () => {
    for (const u of UNITS) for (const dpi of [72, 96, 300]) expect(toPx(pxTo(1280, u.id, dpi), u.id, dpi)).toBeCloseTo(1280, 6);
  });

  it('uses the DPI', () => {
    expect(pxTo(300, 'in', 300)).toBe(1);
    expect(toPx(1, 'in', 300)).toBe(300);
    // A point is 1/72 in whatever the DPI.
    expect(pxTo(300, 'pt', 300)).toBeCloseTo(72);
  });

  it('formats and rounds per unit', () => {
    expect(formatSize(1280, 720, 'px')).toBe('1280 x 720 px');
    expect(formatSize(1280, 720, 'mm')).toBe('338.7 x 190.5 mm');
    expect(formatSize(1280, 720, 'in')).toBe('13.33 x 7.5 in');
    expect(formatLength(96, 'cm')).toBe('2.54 cm');
    expect(roundIn(1.23456, 'cm')).toBe(1.23);
  });

  it('keeps DPI sensible', () => {
    expect(cleanDpi(undefined)).toBe(DEFAULT_DPI);
    expect(cleanDpi(-3)).toBe(DEFAULT_DPI);
    expect(cleanDpi(Number.NaN)).toBe(DEFAULT_DPI);
    expect(cleanDpi(300)).toBe(300);
    expect(docDpi({})).toBe(96);
    expect(isUnit('mm')).toBe(true);
    expect(isUnit('ft')).toBe(false);
  });

  it('saves a document DPI and reads it back; old files have none', () => {
    const doc = docFromCustom({ name: 'Print', width: toPx(100, 'mm', 300), height: toPx(50, 'mm', 300), fps: 12, pixel: false, pixelSize: 8, dpi: 300 });
    expect(doc.dpi).toBe(300);
    expect(doc.width).toBe(1181);
    const back = loadFile(saveFile(doc)).doc;
    expect(back.dpi).toBe(300);
    expect(loadFile(saveFile(newDoc())).doc.dpi).toBeUndefined();
    expect(docFromCustom({ name: 'x', width: 10, height: 10, fps: 12, pixel: false, pixelSize: 8 }).dpi).toBeUndefined();
  });
});
