// @vitest-environment jsdom
// The door in the app: a feature on the audience gate, opened and closed by the gate's switch, with a pretend desktop side.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp } from '../../src/core/registry';
import { audience, installAudience, registerAudienceAction, setAudienceDrawing, setAudienceOn } from '../../src/audience';
import { _resetFeaturesForTests, isFeatureOn, registerFeatures, setFeatureOn } from '../../src/features/host';
import { streamDoorFeature } from '../../src/streamdoor';
import { answerAsk } from '../../src/streamdoor/answer';
import { cleanMessage, cleanZoom, MESSAGE_MAX } from '../../src/streamdoor/actions';
import { doorStatus } from '../../src/streamdoor/state';
import { closedStatus, type DoorAsk } from '../../src/shared/streamDoor';

installAudience();

const calls: string[] = [];
let handler: ((id: number, op: DoorAsk) => void) | null = null;
const answers = new Map<number, unknown>();
let n = 0;
const bridge = {
  open: vi.fn(async (port: number) => {
    calls.push(`open ${port}`);
    return { running: true, port, address: `http://127.0.0.1:${port}`, moved: false, problem: '' as const };
  }),
  close: vi.fn(async () => void calls.push('close')),
  status: vi.fn(async () => closedStatus()),
  key: vi.fn(async () => 'fld_x'),
  roll: vi.fn(async () => 'fld_y'),
  onAsk: vi.fn((h: (id: number, op: DoorAsk) => void) => {
    handler = h;
    return () => void (handler = null);
  }),
  answer: vi.fn(async (id: number, a: unknown) => void answers.set(id, a)),
};

/** What the page answers to one question from the door. */
const ask = async (op: DoorAsk): Promise<any> => {
  const id = ++n;
  handler!(id, op);
  await new Promise((r) => setTimeout(r, 0));
  return answers.get(id);
};
const settle = () => new Promise((r) => setTimeout(r, 5));

beforeAll(() => {
  setChoiceAsker(null);
  (window as unknown as { frameling: unknown }).frameling = { files: {}, door: bridge };
  _resetFeaturesForTests();
  registerFeatures([streamDoorFeature]);
});
afterAll(() => {
  setAudienceOn(false);
  delete (window as unknown as { frameling?: unknown }).frameling;
});
beforeEach(async () => {
  audience.kill();
  audience.resetCounts();
  await settle();
  calls.length = 0;
});
afterEach(() => vi.useRealTimers());

describe('the door as a feature', () => {
  it('is a switchable feature, on by default, with commands, help and a menu home', () => {
    expect(isFeatureOn('stream-door')).toBe(true);
    for (const id of ['streamdoor.settings', 'streamdoor.copyAddress', 'streamdoor.copyKey', 'streamdoor.copyTest', 'streamdoor.roll']) {
      const c = getCommand(id)!;
      expect(c, id).toBeTruthy();
      expect(getHelp(c.help!), id).toBeTruthy();
    }
    expect(getHelp('actions-door')!.media).toBe('actions-door.png');
  });

  it('is registered with the gate as a door, with three view-only actions', () => {
    const s = audience.snapshot();
    expect(s.doors).toEqual([{ id: 'door.local', label: 'Local actions' }]);
    const mine = s.actions.filter((a) => a.id.startsWith('door.'));
    expect(mine.map((a) => a.id).sort()).toEqual(['door.fit-view', 'door.message', 'door.zoom']);
    expect(mine.every((a) => !a.touchesDrawing && a.available)).toBe(true);
  });

  it('opens when the gate goes on and closes when it goes off, and on Stop', async () => {
    setAudienceOn(true);
    await settle();
    expect(calls).toEqual(['open 47213']);
    expect(doorStatus.get().running).toBe(true);
    setAudienceOn(false);
    await settle();
    expect(calls).toEqual(['open 47213', 'close']);
    setAudienceOn(true);
    await settle();
    audience.kill();
    await settle();
    expect(calls.slice(-1)).toEqual(['close']);
  });

  it('ends closed when the gate flips on and off at once', async () => {
    setAudienceOn(true);
    setAudienceOn(false);
    await settle();
    // It may never have opened at all, but it is never left open.
    expect(calls.slice(-1)).toEqual(['close']);
    expect(doorStatus.get().running).toBe(false);
  });

  it('is gone when the feature is switched off: no door, no actions, no commands, no listener', async () => {
    setAudienceOn(true);
    await settle();
    setFeatureOn('stream-door', false);
    await settle();
    expect(calls.slice(-1)).toEqual(['close']);
    expect(audience.snapshot().doors).toEqual([]);
    expect(audience.snapshot().actions.some((a) => a.id.startsWith('door.'))).toBe(false);
    expect(getCommand('streamdoor.copyKey')).toBeUndefined();
    expect(handler).toBeNull();
    setFeatureOn('stream-door', true);
    await settle();
    expect(audience.snapshot().doors).toHaveLength(1);
    expect(handler).not.toBeNull();
    // Coming back while the gate is on opens it again.
    expect(calls.slice(-1)).toEqual(['open 47213']);
  });
});

describe('what the door is told', () => {
  it('lists only what is available, and the cooldown the strictness really gives', async () => {
    const off = registerAudienceAction({ id: 'test.mess', label: 'Mess up', kind: 'tm', cooldown: 1000, touchesDrawing: true, run: () => undefined });
    setAudienceOn(true);
    setAudienceDrawing(false);
    let list = await ask({ op: 'list' });
    expect(list.on).toBe(true);
    expect(list.actions.map((a: { id: string }) => a.id)).not.toContain('test.mess');
    expect(list.actions.find((a: { id: string }) => a.id === 'door.message')).toEqual({ id: 'door.message', label: 'Show a message', kind: 'door', cooldownMs: 6000, touchesDrawing: false, ready: true });
    setAudienceDrawing(true);
    list = await ask({ op: 'list' });
    expect(list.actions.find((a: { id: string }) => a.id === 'test.mess')).toMatchObject({ touchesDrawing: true, cooldownMs: 1000 });
    setAudienceDrawing(false);
    off();
  });

  it('says off, unknown, unavailable, invalid, cooldown and ran, each as itself', async () => {
    const off = registerAudienceAction({ id: 'test.mess', label: 'Mess up', kind: 'tm', cooldown: 0, touchesDrawing: true, run: () => undefined });
    expect(await ask({ op: 'run', id: 'door.message', payload: { text: 'hi' } })).toEqual({ ok: false, reason: 'off' });
    setAudienceOn(true);
    // Past any pause an earlier test left on the real clock.
    vi.useFakeTimers({ now: Date.now() + 600_000, toFake: ['Date'] });
    expect(await ask({ op: 'run', id: 'nothing.here' })).toEqual({ ok: false, reason: 'unknown' });
    expect(await ask({ op: 'run', id: 'test.mess' })).toEqual({ ok: false, reason: 'unavailable' });
    expect(await ask({ op: 'run', id: 'door.message', payload: { nope: 1 } })).toEqual({ ok: false, reason: 'invalid' });
    expect(await ask({ op: 'run', id: 'door.message', payload: { text: 'hello' } })).toEqual({ ok: true, outcome: 'ran' });
    const again = await ask({ op: 'run', id: 'door.message', payload: { text: 'hello again' } });
    expect(again).toMatchObject({ ok: false, reason: 'cooldown' });
    expect(again.retryInMs).toBeGreaterThan(0);
    off();
  });

  it('says a door action is ready, and a refusal from a real action carries its detail', async () => {
    setAudienceOn(true);
    vi.useFakeTimers({ now: Date.now() + 600_000, toFake: ['Date'] });
    const list = await ask({ op: 'list' });
    expect(list.actions.every((x: { ready: boolean }) => x.ready === true)).toBe(true);
    expect(await ask({ op: 'run', id: 'door.message', payload: { nope: 1 } })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('answers something that is not a question with nothing, and never throws', async () => {
    const g = { snapshot: () => { throw new Error('boom'); }, submit: () => { throw new Error('boom'); } };
    for (const bad of [null, undefined, 'x', 5, {}, { op: 'run' }, { op: 'run', id: 5 }, { op: 'list' }, { op: 'run', id: 'a.b' }]) expect(() => answerAsk(bad, g)).not.toThrow();
    expect(answerAsk({ op: 'list' }, g)).toBeNull();
    expect(answerAsk({ op: 'fly' }, audience)).toBeNull();
  });
});

describe('the example actions', () => {
  it('clean what a viewer sends', () => {
    expect(cleanMessage({ text: '  hi\n\tthere  ' })).toEqual({ text: 'hi there' });
    expect(cleanMessage('plain words')).toEqual({ text: 'plain words' });
    expect(cleanMessage({ text: 'x'.repeat(500) })!.text).toHaveLength(MESSAGE_MAX);
    expect(cleanMessage({ text: 'a' + String.fromCharCode(0x202e) + 'b' + String.fromCharCode(7) + 'c' })).toEqual({ text: 'a b c' });
    for (const bad of [null, undefined, 5, {}, { text: 5 }, { text: '   ' }, []]) expect(cleanMessage(bad)).toBeNull();
    expect(cleanZoom({ direction: 'in' })).toEqual({ direction: 'in' });
    expect(cleanZoom('out')).toEqual({ direction: 'out' });
    for (const bad of [null, 'sideways', { direction: 'up' }, {}]) expect(cleanZoom(bad)).toBeNull();
  });
});
