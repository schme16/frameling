// @vitest-environment jsdom
// Quill reacting, on the audience gate: every action is on the list, view-and-words only, cooled down, never near the
// document, and a sign waits for a yes. Run with the real gate and the real toasts.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { audience, installAudience, setAudienceDrawing, setAudienceOn, submitAudience } from '../../src/audience';
import { _resetFeaturesForTests, isFeatureOn, registerFeatures, setFeatureOn } from '../../src/features/host';
import { streamDoorFeature } from '../../src/streamdoor';
import { quillReactsFeature } from '../../src/quillreacts';
import { REACTION_ACTIONS, SIGN_ACTION, SIGN_COOLDOWN } from '../../src/quillreacts/actions';
import { SAMPLE_SIGN } from '../../src/quillreacts/commands';
import { pickOf, react, REACTIONS, SIGN_ASK_MS, SIGN_UP_MS } from '../../src/quillreacts/react';
import { petStore } from '../../src/quillpet/store';
import { clearToasts, toasts } from '../../src/ui/toast';
import { lineIds, lines } from '../../src/ui/mascot/lines';
import { resolveMenus, type MenuItem } from '../../src/ui/menus';

installAudience();

const ALL = [...REACTION_ACTIONS.map((a) => a.id), SIGN_ACTION];
const mine = () => audience.snapshot().actions.filter((a) => a.id.startsWith('quill.'));
const on = () => toasts.get();
const press = (id: string) => {
  const t = on().find((x) => x.action?.id === id || x.decline?.id === id)!;
  (t.action?.id === id ? t.action : t.decline)!.run();
};
const settle = () => vi.advanceTimersByTimeAsync(0);

/** Moves the gate's clock well past any cooldown an earlier test left behind. */
let clock = Date.now() + 10_000_000;
const later = (ms = 100_000) => {
  clock += ms;
  vi.setSystemTime(clock);
};

beforeAll(() => {
  setChoiceAsker(null);
  _resetFeaturesForTests();
  registerFeatures([streamDoorFeature, quillReactsFeature]);
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: clock });
  audience.kill();
  audience.resetCounts();
  clearToasts();
  setChoice('quillreacts.signs', undefined);
  setAudienceOn(true);
  later();
});
afterEach(() => vi.useRealTimers());
afterAll(() => setAudienceOn(false));

describe('registered', () => {
  it('is a switchable feature that needs the door, with commands, help and a menu home', () => {
    expect(isFeatureOn('quill-reacts')).toBe(true);
    expect(quillReactsFeature.requires).toEqual(['stream-door']);
    for (const id of ['quillreacts.cheer', 'quillreacts.hop', 'quillreacts.snack', 'quillreacts.nuzzle', 'quillreacts.wave', 'quillreacts.sign']) {
      const c = getCommand(id)!;
      expect(c, id).toBeTruthy();
      expect(c.category).toBe('Audience');
      expect(getHelp(c.help!), id).toBeTruthy();
    }
    expect(getHelp('quill-reacts')!.media).toBe('quill-reacts.mp4');
    // Its submenu is named in the Streaming submenu itself, so the feature adds no menu entry of its own.
    expect(quillReactsFeature.menus).toBeUndefined();
  });

  it('shows up in the menu: Audience features > Try Quill reacting to chat, and is gone with the feature', () => {
    const find = (items: MenuItem[]): MenuItem | undefined => {
      for (const it of items) {
        if (it.kind === 'submenu') {
          if (it.label === 'Try Quill reacting to chat') return it;
          const inner = find(it.items);
          if (inner) return inner;
        }
      }
      return undefined;
    };
    const all = () => resolveMenus().flatMap((m) => m.items);
    const sub = find(all());
    expect(sub && sub.kind === 'submenu' && sub.items.map((i) => (i.kind === 'command' ? i.command.id : '-'))).toEqual(['quillreacts.cheer', 'quillreacts.hop', 'quillreacts.snack', 'quillreacts.nuzzle', 'quillreacts.wave', 'quillreacts.sign']);
    setFeatureOn('quill-reacts', false);
    expect(find(all())).toBeUndefined();
    setFeatureOn('quill-reacts', true);
  });

  it('puts every action on the gate, view and words only, with a cooldown', () => {
    expect(mine().map((a) => a.id).sort()).toEqual([...ALL].sort());
    for (const a of mine()) {
      expect(a.touchesDrawing, a.id).toBe(false);
      expect(a.available, a.id).toBe(true);
      expect(a.cooldown, a.id).toBeGreaterThanOrEqual(5000);
    }
    expect(mine().find((a) => a.id === SIGN_ACTION)!.cooldown).toBe(SIGN_COOLDOWN);
  });

  it('is still listed with drawing interruptions off, and goes with the feature', () => {
    setAudienceDrawing(false);
    expect(mine()).toHaveLength(ALL.length);
    setFeatureOn('quill-reacts', false);
    expect(mine()).toEqual([]);
    expect(getCommand('quillreacts.cheer')).toBeUndefined();
    setFeatureOn('quill-reacts', true);
    expect(mine()).toHaveLength(ALL.length);
  });

  it('needs the door: the door cannot go while this is on, and turning this on brings the door back', () => {
    const r = setFeatureOn('stream-door', false);
    expect(r.ok).toBe(false);
    expect(isFeatureOn('stream-door')).toBe(true);
    expect(setFeatureOn('quill-reacts', false).ok).toBe(true);
    expect(setFeatureOn('stream-door', false).ok).toBe(true);
    expect(mine()).toEqual([]);
    expect(setFeatureOn('quill-reacts', true).ok).toBe(true);
    expect(isFeatureOn('stream-door')).toBe(true);
    expect(mine()).toHaveLength(ALL.length);
  });

  it('has lines for every reaction, and no em dashes in what he says', () => {
    for (const id of ['stream.cheer', 'stream.hop', 'stream.snack', 'stream.nuzzle', 'stream.wave', 'stream.sign.ask'] as const) {
      expect(lineIds()).toContain(id);
      for (const l of lines(id)) expect(l).not.toMatch(/—/);
    }
    expect(REACTIONS).toHaveLength(5);
  });
});

describe('reactions', () => {
  it('each one shows a toast with Quill doing his thing and a line from his set', () => {
    const want: Record<string, string> = { cheer: 'cheer', hop: 'hop', snack: 'eat', nuzzle: 'nuzzle', wave: 'wave' };
    for (const a of REACTION_ACTIONS) {
      later();
      expect(submitAudience(a.id)).toEqual({ ok: true, outcome: 'ran' });
      const t = on().at(-1)!;
      const anim = Array.isArray(t.quill) ? t.quill[0].anim : t.quill;
      expect(anim, a.id).toBe(want[a.which]);
      expect(lines(`stream.${a.which}` as 'stream.cheer'), a.id).toContain(t.message);
      // Loops stop by themselves.
      if (Array.isArray(t.quill)) expect(t.quill[0].hold).toBeGreaterThan(0);
    }
  });

  it('one at a time: a new reaction takes the place of the one on screen', () => {
    react('cheer');
    react('hop');
    react('wave');
    expect(on()).toHaveLength(1);
  });

  it('picks from the set by a number, and never runs off the end', () => {
    expect(pickOf(['a', 'b', 'c'], 0)).toBe('a');
    expect(pickOf(['a', 'b', 'c'], 0.99)).toBe('c');
    expect(pickOf(['a', 'b', 'c'], 1)).toBe('c');
    expect(pickOf(['a', 'b', 'c'], -1)).toBe('a');
  });

  it('refuses everything while audience features are off', () => {
    setAudienceOn(false);
    expect(submitAudience('quill.cheer')).toEqual({ ok: false, reason: 'off' });
    expect(on()).toHaveLength(0);
  });
});

describe('cooldowns', () => {
  it('after one reaction the next waits, whichever it is, so he cannot flail', () => {
    expect(submitAudience('quill.cheer')).toEqual({ ok: true, outcome: 'ran' });
    for (const id of ['quill.cheer', 'quill.hop', 'quill.snack', 'quill.nuzzle', 'quill.wave']) {
      const v = submitAudience(id);
      expect(v, id).toMatchObject({ ok: false, reason: 'cooldown' });
    }
    later(5000);
    expect(submitAudience('quill.hop')).toMatchObject({ ok: false, reason: 'cooldown' });
    later(1500);
    expect(submitAudience('quill.hop')).toMatchObject({ ok: true });
  });

  it('a snack asks a longer wait than a cheer, and a stricter setting doubles it', () => {
    const c = (id: string) => mine().find((a) => a.id === id)!.cooldown;
    expect(c('quill.snack')).toBeGreaterThan(c('quill.cheer'));
    setChoice('audience.strictness', 'strict');
    audience.refresh();
    submitAudience('quill.cheer');
    later(7000);
    expect(submitAudience('quill.hop')).toMatchObject({ ok: false, reason: 'cooldown' });
    setChoice('audience.strictness', undefined);
    audience.refresh();
  });

  it('signs have a kind and a wait of their own, and are slow', async () => {
    expect(SIGN_COOLDOWN).toBeGreaterThanOrEqual(30_000);
    expect(submitAudience('quill.cheer')).toMatchObject({ ok: true });
    later(7000);
    expect(submitAudience(SIGN_ACTION, { text: 'hi chat' })).toMatchObject({ ok: true });
    press('sign-no');
    await settle();
    later(10_000);
    expect(submitAudience(SIGN_ACTION, { text: 'again' })).toMatchObject({ ok: false, reason: 'cooldown' });
  });
});

describe('signs', () => {
  const sign = (text: unknown) => submitAudience(SIGN_ACTION, text);
  const signToast = () => on().find((t) => t.sign);

  it('turns away what is not words, before anything is asked', () => {
    for (const bad of [null, {}, { text: 5 }, '   ', '\u{1F600}', 'https://example.com']) {
      expect(sign(bad), String(bad)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(on()).toHaveLength(0);
  });

  it('asks first, with the cleaned words in the question, and shows nothing as a sign yet', () => {
    expect(sign({ text: '  <b>Hello</b>  @viewer https://x.example there!! ', user: 'Someone' })).toEqual({ ok: true, outcome: 'ran' });
    expect(on()).toHaveLength(1);
    const t = on()[0];
    expect(t.message).toContain('bHello/b there!!');
    expect(t.message).not.toMatch(/Someone|@viewer|x\.example|[<>]/);
    expect(t.sign).toBeFalsy();
    expect(t.action!.label).toBe('Hold it up');
    expect(t.decline!.label).toBe('Not that one');
    expect(t.duration).toBe(0);
  });

  it('shows the sign on yes, held up with the holding clip, and it goes by itself', async () => {
    sign({ text: 'You are brilliant' });
    press('sign-yes');
    await settle();
    const s = signToast()!;
    expect(s.message).toBe('“You are brilliant”');
    expect(on()).toHaveLength(1);
    expect(Array.isArray(s.quill) && s.quill[0].anim).toBe('holding');
    expect(s.duration).toBe(SIGN_UP_MS);
  });

  it('shows nothing on "Not that one", and nothing on no answer', async () => {
    sign({ text: 'first' });
    press('sign-no');
    await settle();
    expect(on()).toHaveLength(0);
    later(40_000);
    sign({ text: 'second' });
    expect(on()).toHaveLength(1);
    vi.advanceTimersByTime(SIGN_ASK_MS + 1);
    await settle();
    expect(on()).toHaveLength(0);
  });

  it('is dropped by Stop while it waits', async () => {
    sign({ text: 'waiting' });
    expect(on()).toHaveLength(1);
    audience.kill();
    await settle();
    expect(on()).toHaveLength(0);
    expect(signToast()).toBeUndefined();
  });

  it('never takes signs when the streamer chose that', () => {
    setChoice('quillreacts.signs', 'off');
    expect(sign({ text: 'hello' })).toEqual({ ok: false, reason: 'invalid' });
    expect(on()).toHaveLength(0);
  });

  it('keeps no trace of the words once it is over: not on screen, not in storage, not in the counts', async () => {
    const secret = 'zebracake';
    sign({ text: `${secret} for you`, user: 'viewerthirteen' });
    press('sign-yes');
    await settle();
    vi.advanceTimersByTime(SIGN_UP_MS + 1);
    clearToasts();
    const everywhere = JSON.stringify([audience.snapshot(), { ...localStorage }, petStore.get()]);
    expect(everywhere).not.toContain(secret);
    expect(everywhere).not.toContain('viewerthirteen');
  });

  it('the streamer can try the sign with the made-up words', () => {
    expect(SAMPLE_SIGN).toBe('Hello from chat!');
    getCommand('quillreacts.sign')!.run();
    expect(on()[0].message).toContain(SAMPLE_SIGN);
  });
});

describe('what it never touches', () => {
  it('leaves the document, its undo history and the pet exactly as they were', async () => {
    const doc = store().get().doc;
    const canUndo = store().canUndo();
    const pet = JSON.stringify(petStore.get());
    for (const a of REACTION_ACTIONS) {
      later();
      submitAudience(a.id);
    }
    later();
    submitAudience(SIGN_ACTION, { text: 'a sign' });
    press('sign-yes');
    await settle();
    expect(store().get().doc).toBe(doc);
    expect(store().canUndo()).toBe(canUndo);
    expect(JSON.stringify(petStore.get())).toBe(pet);
  });

  it('has no way to talk to a chat or reach the document: nothing in its folder imports the store, a network, or the desktop', () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/quillreacts');
    const code = fs
      .readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f) && f !== 'debug.ts')
      .map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))
      .join('\n');
    for (const bad of [/core\/store/, /core\/doc/, /\bfetch\(/, /XMLHttpRequest/, /WebSocket/, /from 'node:net'/, /from 'net'/, /io\/desktop/, /desktop\(\)/, /ctx\.edit/, /touchesDrawing:\s*true/, /quillpet/, /require\('http/, /sendBeacon/]) {
      expect(code, String(bad)).not.toMatch(bad);
    }
  });
});
