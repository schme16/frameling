import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetChoicesForTests, currentChoice, getChoiceDef, setChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp } from '../../src/core/registry';
import { removeOwned, withOwner } from '../../src/core/owners';
import { newDoc } from '../../src/core/doc';
import { store } from '../../src/core/store';
import { audience, emptyAudienceQueue, setAudienceDrawing, installAudience, registerAudienceAction, registerAudienceDoor, setAudienceOn, startsOn, stopAudience, submitAudience } from '../../src/audience';
import { countsLine, waited } from '../../src/audience/summary';
import { emptyCounts } from '../../src/audience/gate';

installAudience();

beforeEach(() => {
  audience.kill();
  audience.resetCounts();
});

describe('audience features, in the app', () => {
  it('is off to begin with', () => {
    expect(audience.isOn()).toBe(false);
  });

  it('has its commands, with the kill key working while typing, and a help topic each points at', () => {
    for (const id of ['audience.toggle', 'audience.kill', 'audience.clearQueue', 'audience.show']) {
      const c = getCommand(id)!;
      expect(c, id).toBeTruthy();
      expect(getHelp(c.help!), id).toBeTruthy();
    }
    expect(getCommand('audience.kill')!.keys).toEqual(['Mod+Alt+K']);
    expect(getCommand('audience.kill')!.global).toBe(true);
  });

  it('has a help topic with a picture', () => {
    expect(getHelp('audience')!.media).toBe('audience.png');
  });

  it('starts off by default, and only comes back on when asked to remember', () => {
    expect(currentChoice('audience.startup')).toBe('off');
    expect(startsOn(true, 'off')).toBe(false);
    expect(startsOn(false, 'keep')).toBe(false);
    expect(startsOn(true, 'keep')).toBe(true);
    expect(startsOn(true, 'anything')).toBe(false);
    expect(getChoiceDef('audience.startup')!.silent).toBe(true);
  });

  it('asks how careful the first time it is switched on, and uses the answer', async () => {
    _resetChoicesForTests();
    await installReregister();
    let asked = 0;
    setChoiceAsker(async () => (asked++, { value: 'strict', remember: true }));
    setAudienceOn(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toBe(1);
    expect(audience.isOn()).toBe(true);
    expect(audience.snapshot().limits.maxPerMinute).toBe(4);
    setChoiceAsker(null);
  });

  it('switches on with the usual answer when nothing can ask, and off with no question', () => {
    setChoiceAsker(null);
    setChoice('audience.strictness', undefined);
    setAudienceOn(true);
    expect(audience.isOn()).toBe(true);
    expect(audience.snapshot().limits.maxPerMinute).toBe(10);
    setAudienceOn(false);
    expect(audience.isOn()).toBe(false);
  });

  it('a feature that registers an action loses it when it is switched off', () => {
    withOwner('test-feature', () => {
      registerAudienceAction({ id: 'test.hello', label: 'Say hello', kind: 'test', cooldown: 0, run: () => undefined });
      registerAudienceDoor({ id: 'door.test', label: 'Test', open: () => undefined, close: () => undefined });
    });
    expect(audience.snapshot().actions.some((a) => a.id === 'test.hello')).toBe(true);
    expect(audience.snapshot().doors.map((d) => d.id)).toContain('door.test');
    removeOwned('test-feature');
    expect(audience.snapshot().actions.some((a) => a.id === 'test.hello')).toBe(false);
    expect(audience.snapshot().doors).toEqual([]);
  });

  it('stop switches everything off, and the queue command only works with something in it', () => {
    setChoice('audience.strictness', 'strict');
    const off = [registerAudienceAction({ id: 'test.a', label: 'A', kind: 'ta', run: () => undefined }), registerAudienceAction({ id: 'test.b', label: 'B', kind: 'tb', run: () => undefined })];
    setAudienceOn(true);
    expect(getCommand('audience.clearQueue')!.enabled!({} as never)).toBe(false);
    submitAudience('test.a');
    submitAudience('test.b');
    expect(getCommand('audience.clearQueue')!.enabled!({} as never)).toBe(true);
    expect(emptyAudienceQueue()).toBe(1);
    submitAudience('test.b');
    stopAudience();
    expect(audience.isOn()).toBe(false);
    expect(audience.snapshot().queue).toEqual([]);
    off.forEach((f) => f());
  });
});

function installReregister() {
  // _resetChoicesForTests forgets the registered choices; put ours back by asking the app to register them again.
  // The choices are plain data, so this is the same as start-up.
  return import('../../src/audience/choices').then(({ audienceChoices }) => import('../../src/core/choices').then(({ registerChoice }) => audienceChoices.forEach((c) => registerChoice(c))));
}

describe('an audience action that reaches the drawing, in the real store', () => {
  afterEach(() => vi.useRealTimers());
  it('is refused until interruptions are allowed, then is one step that one Undo takes back', () => {
    setChoiceAsker(null);
    store().load(newDoc());
    const before = store().get().doc.name;
    const off = registerAudienceAction({ id: 'test.rename', label: 'Rename', kind: 'trn', cooldown: 0, touchesDrawing: true, run: (_p, ctx) => ctx.edit!('Audience rename', (d) => void (d.name = 'Chaos')) });
    setAudienceDrawing(false);
    setAudienceOn(true);
    expect(submitAudience('test.rename')).toEqual({ ok: false, reason: 'unavailable' });
    expect(store().get().doc.name).toBe(before);
    setAudienceDrawing(true);
    // The one gate keeps its real clock: step past the pause an earlier test left.
    vi.useFakeTimers({ now: Date.now() + 120_000, toFake: ['Date'] });
    expect(submitAudience('test.rename')).toEqual({ ok: true, outcome: 'ran' });
    expect(store().get().doc.name).toBe('Chaos');
    store().undo();
    expect(store().get().doc.name).toBe(before);
    setAudienceDrawing(false);
    off();
  });
  it('is off after install, and has a command and a menu line', () => {
    expect(audience.snapshot().drawingAllowed).toBe(false);
    expect(getCommand('audience.drawing')).toBeTruthy();
  });
});

describe('counts in plain words', () => {
  it('says what was done and what was turned away, never who', () => {
    const c = emptyCounts();
    expect(countsLine(c)).toBe('0 done');
    c.ran = 12;
    c.rejected.cooldown = 3;
    c.rejected['queue-full'] = 2;
    c.cleared = 1;
    c.expired = 1;
    c.failed = 1;
    expect(countsLine(c)).toBe('12 done, 5 turned away (3 too soon, 2 queue full), 2 dropped from the queue, 1 did not work');
  });
  it('says how long something waited', () => {
    expect(waited(0)).toBe('0s');
    expect(waited(2400)).toBe('2s');
    expect(waited(59_000)).toBe('59s');
    expect(waited(61_000)).toBe('1 min');
    expect(waited(-5)).toBe('0s');
  });
});
