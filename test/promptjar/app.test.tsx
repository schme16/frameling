// @vitest-environment jsdom
// The prompt jar on the real audience gate: one view-only action, nothing arriving on screen unasked, the cap, pulling
// and passing, emptying in one click, and nothing that names anybody stored. Real gate, real toasts, real card.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp } from '../../src/core/registry';
import { audience, installAudience, setAudienceOn, submitAudience } from '../../src/audience';
import { _resetFeaturesForTests, isFeatureOn, registerFeatures, setFeatureOn } from '../../src/features/host';
import { streamDoorFeature } from '../../src/streamdoor';
import { promptJarFeature, ADD_ACTION } from '../../src/promptjar';
import { hideJar, jarCardOpen, jarRead } from '../../src/promptjar/card';
import { addToJar, emptyJar, jar, JAR_KEY, loadKept, passOn, pullOne, putBack } from '../../src/promptjar/jar';
import { DEFAULT_PACE_SECONDS, JAR_MAX } from '../../src/promptjar/logic';
import { JarChip, emptyTheJar } from '../../src/promptjar/JarCard';
import { setStreamSafe } from '../../src/core/streamSafe';
import { clearToasts, toasts } from '../../src/ui/toast';
const runCommandForTests = (id: string) => void getCommand(id)!.run();
import { resolveMenus, type MenuItem } from '../../src/ui/menus';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installAudience();

const mine = () => audience.snapshot().actions.filter((a) => a.id === ADD_ACTION);
let clock = Date.now() + 20_000_000;
const later = (ms = 100_000) => {
  clock += ms;
  vi.setSystemTime(clock);
};
const send = (text: unknown) => {
  later();
  return submitAudience(ADD_ACTION, typeof text === 'string' ? { text } : text);
};
const words = () => jar.get().slips.map((s) => s.text);

beforeAll(() => {
  setChoiceAsker(null);
  _resetFeaturesForTests();
  registerFeatures([streamDoorFeature, promptJarFeature]);
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: clock });
  audience.kill();
  audience.resetCounts();
  clearToasts();
  setChoice('promptjar.keep', undefined);
  setChoice('promptjar.pace', undefined);
  emptyJar();
  jarCardOpen.set(false);
  jarRead.set(null);
  // Viewers see only the capture window unless a test says otherwise, so a pulled prompt is plain in this window.
  setChoice('audience.view', 'capture');
  setStreamSafe(false);
  setAudienceOn(true);
  later();
});
afterEach(() => vi.useRealTimers());
afterAll(() => setAudienceOn(false));

describe('registered', () => {
  it('is a switchable feature that needs the door, with commands, help, a menu home and a choice', () => {
    expect(isFeatureOn('prompt-jar')).toBe(true);
    expect(promptJarFeature.requires).toEqual(['stream-door']);
    for (const id of ['promptjar.open', 'promptjar.pull', 'promptjar.pass', 'promptjar.putBack', 'promptjar.add', 'promptjar.empty']) {
      const c = getCommand(id)!;
      expect(c, id).toBeTruthy();
      expect(c.category).toBe('Audience');
      expect(getHelp(c.help!), id).toBeTruthy();
    }
    expect(getCommand('promptjar.pull')!.keys).toEqual(['Mod+Alt+Shift+J']);
    expect(getHelp('prompt-jar')!.media).toBe('prompt-jar.mp4');
    expect(promptJarFeature.choices!.map((c) => c.id)).toEqual(['promptjar.keep', 'promptjar.pace']);
    expect(promptJarFeature.choices![0].silent).toBe(true);
    expect(promptJarFeature.choices![0].default).toBe('forget');
  });

  it('is in the Audience features menu, and gone with the feature', () => {
    const ids = (items: MenuItem[]): string[] => items.flatMap((i) => (i.kind === 'command' ? [i.command.id] : i.kind === 'submenu' ? ids(i.items) : []));
    const all = () => ids(resolveMenus().flatMap((m) => m.items));
    expect(all()).toEqual(expect.arrayContaining(['promptjar.open', 'promptjar.pull', 'promptjar.empty']));
    setFeatureOn('prompt-jar', false);
    expect(all()).not.toContain('promptjar.pull');
    setFeatureOn('prompt-jar', true);
  });

  it('has one action, view only, paced by the jar itself (counted only, so the gate lets many through), listed by its label and nothing else', () => {
    expect(mine()).toHaveLength(1);
    const a = mine()[0];
    expect(a.touchesDrawing).toBe(false);
    expect(a.available).toBe(true);
    expect(a.bulk).toBe(true);
    expect(a.cooldown).toBe(0);
    expect(a.ready).toBe(true);
    expect(a.label).toBe('Add a prompt to the jar');
    expect(audience.snapshot().actions.filter((x) => /jar/.test(x.id))).toHaveLength(1);
  });

  it('goes with the feature, and takes what was in memory with it', () => {
    send('a frog');
    setFeatureOn('prompt-jar', false);
    expect(mine()).toEqual([]);
    expect(getCommand('promptjar.pull')).toBeUndefined();
    expect(words()).toEqual([]);
    setFeatureOn('prompt-jar', true);
    expect(mine()).toHaveLength(1);
  });
});

describe('arriving', () => {
  it('goes in the jar, cleaned', () => {
    expect(send('a frog in a teacup www.spam.com @someone \u{1F600}')).toEqual({ ok: true, outcome: 'ran' });
    expect(words()).toEqual(['a frog in a teacup']);
  });

  it('turns rubbish away before it waits in line', () => {
    for (const bad of ['', '!!!', '\u{1F600}', 'https://x.com', 5, null, { nope: 1 }]) {
      const v = send(bad);
      expect(v.ok, String(bad)).toBe(false);
    }
    expect(words()).toEqual([]);
    expect(audience.snapshot().counts.rejected.invalid).toBeGreaterThan(0);
  });

  it('says why an empty prompt was turned away', () => {
    expect(send('!!!')).toEqual({ ok: false, reason: 'invalid', detail: 'no-prompt' });
  });

  it('keeps one pause for the whole channel: a second person soon after is told to wait, and says how long', () => {
    expect(send('first idea').ok).toBe(true);
    later(1000);
    const v = submitAudience(ADD_ACTION, { text: 'second idea from somebody else' });
    expect(v).toEqual({ ok: false, reason: 'cooldown', detail: 'channel-wait', retryInMs: DEFAULT_PACE_SECONDS * 1000 - 1000 });
    expect(words()).toEqual(['first idea']);
    later(2000);
    expect(submitAudience(ADD_ACTION, { text: 'second idea from somebody else' }).ok).toBe(true);
    expect(words()).toHaveLength(2);
  });

  it('lets a busy chat in: about 20 a minute by default, not 7, and more when the pause is shorter', () => {
    const run = (pause: string | undefined): number => {
      setChoice('promptjar.pace', pause);
      emptyJar();
      later();
      let got = 0;
      for (let i = 0; i < 60; i++) {
        later(1000);
        if (submitAudience(ADD_ACTION, { text: `idea ${pause} ${i}` }).ok) got++;
      }
      return got;
    };
    expect(run(undefined)).toBe(JAR_MAX >= 20 ? 20 : JAR_MAX);
    expect(run('8')).toBe(8);
    expect(run('1')).toBe(JAR_MAX);
  });

  it('a pause that is not one of the offered ones is the usual one', () => {
    setChoice('promptjar.pace', '999');
    expect(send('first idea').ok).toBe(true);
    later(1000);
    expect(submitAudience(ADD_ACTION, { text: 'another one' })).toMatchObject({ reason: 'cooldown', retryInMs: 2000 });
  });

  it('a prompt that bounced does not restart the pause', () => {
    expect(send('first idea').ok).toBe(true);
    later(2000);
    expect(submitAudience(ADD_ACTION, { text: 'too soon' }).ok).toBe(false);
    later(1000);
    expect(submitAudience(ADD_ACTION, { text: 'on time' }).ok).toBe(true);
  });

  it('ignores repeats quietly', () => {
    send('a frog in a teacup');
    send('A FROG  in a teacup');
    expect(words()).toEqual(['a frog in a teacup']);
  });

  it('holds only so many, turns the rest away, and counts them as not done', () => {
    for (let i = 0; i < JAR_MAX; i++) expect(addToJar(`idea number ${i}`)).toBe('added');
    expect(send('one too many')).toEqual({ ok: false, reason: 'invalid', detail: 'full' });
    expect(words()).toHaveLength(JAR_MAX);
    expect(words()).not.toContain('one too many');
    expect(jar.get().saidFull).toBe(true);
    expect(addToJar('and another')).toBe('full');
    // Room again: it goes in.
    pullOne();
    expect(send('now there is room').ok).toBe(true);
    expect(words()).toContain('now there is room');
  });
});

describe('nothing arrives on screen unasked', () => {
  it('a prompt that arrives makes no toast, opens nothing, and the queue shows the label only', () => {
    clearToasts();
    send('a very private idea');
    expect(toasts.get()).toEqual([]);
    expect(jarCardOpen.get()).toBe(false);
    expect(JSON.stringify(audience.snapshot())).not.toContain('private idea');
    expect(jar.get().hand).toBeNull();
  });

  it('the chip shows a number and no words, and the words are not in the page until the card is opened', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root: Root = createRoot(host);
    act(() => root.render(<JarChip />));
    act(() => void send('a very private idea'));
    expect(host.textContent).toContain('1');
    expect(document.body.textContent).not.toContain('private idea');
    act(() => jarCardOpen.set(true));
    // Open, it says how many, still not what they say, until one is pulled.
    expect(host.textContent).toContain('1 prompt waiting');
    expect(document.body.textContent).not.toContain('private idea');
    act(() => void pullOne());
    expect(document.body.textContent).toContain('a very private idea');
    act(() => root.unmount());
    host.remove();
  });

  it('while your viewers can see this window, a pulled prompt stays covered until Read it is pressed', () => {
    setChoice('audience.view', 'screen');
    const host = document.createElement('div');
    document.body.append(host);
    const root: Root = createRoot(host);
    addToJar('a hidden idea');
    act(() => jarCardOpen.set(true));
    act(() => root.render(<JarChip />));
    act(() => void pullOne());
    expect(document.body.textContent).not.toContain('a hidden idea');
    const read = document.querySelector<HTMLButtonElement>('[data-testid="promptjar.read"]')!;
    expect(read).toBeTruthy();
    // The press that reveals it is the whole covered slip, with a plain label.
    expect(read.textContent).toContain('Read it');
    act(() => read.click());
    expect(document.body.textContent).toContain('a hidden idea');
    // One press covers it again.
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="promptjar.cover"]')!.click());
    expect(document.body.textContent).not.toContain('a hidden idea');
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="promptjar.read"]')!.click());
    // Closing the card covers it again, so opening it later never shows it by surprise.
    act(() => hideJar());
    act(() => jarCardOpen.set(true));
    expect(document.body.textContent).not.toContain('a hidden idea');
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="promptjar.read"]')!.click());
    // Covered again for the next one.
    act(() => passOn());
    addToJar('the next idea');
    act(() => void pullOne());
    expect(document.body.textContent).not.toContain('the next idea');
    act(() => root.unmount());
    host.remove();
  });

  it('is covered before the question has ever been answered', () => {
    setChoice('audience.view', undefined);
    const host = document.createElement('div');
    document.body.append(host);
    const root: Root = createRoot(host);
    addToJar('an unanswered idea');
    act(() => jarCardOpen.set(true));
    act(() => root.render(<JarChip />));
    act(() => void pullOne());
    expect(document.body.textContent).not.toContain('an unanswered idea');
    expect(document.querySelector('[data-testid="promptjar.read"]')).toBeTruthy();
    act(() => root.unmount());
    host.remove();
  });

  it('shows a pulled prompt at once, with nothing to press, when viewers see only the capture window', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root: Root = createRoot(host);
    addToJar('a plain idea');
    act(() => jarCardOpen.set(true));
    act(() => root.render(<JarChip />));
    act(() => void pullOne());
    expect(document.body.textContent).toContain('a plain idea');
    expect(document.querySelector('[data-testid="promptjar.read"]')).toBeNull();
    expect(document.querySelector('[data-testid="promptjar.cover"]')).toBeNull();
    // The card no longer promises a privacy it cannot keep: it says why it is plain.
    expect(document.body.textContent).toContain('your viewers do not see');
    act(() => root.unmount());
    host.remove();
  });

  it('there is no door action that reads the jar or shows a prompt', () => {
    const ids = audience.snapshot().actions.map((a) => a.id);
    expect(ids.filter((i) => /^jar\./.test(i))).toEqual([ADD_ACTION]);
  });
});

describe('pulling', () => {
  it('takes one at random out of the jar into your hand', () => {
    addToJar('a');
    addToJar('b');
    addToJar('c');
    const got = pullOne(() => 0.5)!;
    expect(got.text).toBe('b');
    expect(jar.get().hand?.text).toBe('b');
    expect(words()).toEqual(['a', 'c']);
  });

  it('says nothing for an empty jar, and the command is off', () => {
    expect(pullOne()).toBeNull();
    expect(getCommand('promptjar.pull')!.enabled!({} as never)).toBe(false);
    expect(getCommand('promptjar.pull')!.reason!({} as never)).toMatch(/empty/i);
  });

  it('pass on throws it away, put it back returns it', () => {
    addToJar('one');
    addToJar('two');
    pullOne(() => 0);
    putBack();
    expect(words().sort()).toEqual(['one', 'two']);
    expect(jar.get().hand).toBeNull();
    pullOne(() => 0);
    passOn();
    expect(words()).toEqual(['one']);
    expect(jar.get().hand).toBeNull();
  });

  it('the commands pull and open the card', () => {
    addToJar('one');
    runCommandForTests('promptjar.pull');
    expect(jar.get().hand?.text).toBe('one');
    expect(jarCardOpen.get()).toBe(true);
    runCommandForTests('promptjar.pass');
    expect(jar.get().hand).toBeNull();
  });
});

describe('emptying', () => {
  it('is one click: the jar, the slip in hand and the toast says how many', () => {
    addToJar('one');
    addToJar('two');
    addToJar('three');
    pullOne();
    expect(emptyTheJar()).toBe(3);
    expect(jar.get()).toMatchObject({ slips: [], hand: null });
    expect(toasts.get().at(-1)!.message).toMatch(/Emptied the prompt jar \(3\)/);
    expect(emptyTheJar()).toBe(0);
  });
});

describe('what is stored', () => {
  it('nothing by default: memory only', () => {
    localStorage.removeItem(JAR_KEY);
    send('a frog');
    expect(localStorage.getItem(JAR_KEY)).toBeNull();
  });

  it('with keep, only the cleaned words, no names, no times, and a restart brings them back', () => {
    setChoice('promptjar.keep', 'keep');
    send('a frog in a teacup @somebody');
    send({ text: 'a bear in a boat', user: 'someone_special', userId: '123', displayName: 'Somebody', at: 99, channel: 'x' });
    const saved = localStorage.getItem(JAR_KEY)!;
    expect(JSON.parse(saved)).toEqual(['a frog in a teacup', 'a bear in a boat']);
    for (const leak of ['someone_special', '123', 'Somebody', 'somebody', 'channel']) expect(saved).not.toContain(leak);
    jar.set({ slips: [], hand: null, saidFull: false });
    loadKept();
    expect(words()).toEqual(['a frog in a teacup', 'a bear in a boat']);
  });

  it('the slips hold only an id and the words', () => {
    send({ text: 'a frog', user: 'x', userId: '1' });
    expect(Object.keys(jar.get().slips[0]).sort()).toEqual(['id', 'text']);
  });

  it('emptying wipes the saved copy too, and turning keep off wipes it', () => {
    setChoice('promptjar.keep', 'keep');
    send('a frog');
    expect(localStorage.getItem(JAR_KEY)).not.toBeNull();
    emptyJar();
    expect(localStorage.getItem(JAR_KEY)).toBeNull();
    send('another frog');
    expect(localStorage.getItem(JAR_KEY)).not.toBeNull();
    setChoice('promptjar.keep', 'forget');
    expect(localStorage.getItem(JAR_KEY)).toBeNull();
  });

  it('an odd saved file cannot bring rubbish back', () => {
    setChoice('promptjar.keep', 'keep');
    localStorage.setItem(JAR_KEY, JSON.stringify(['good idea', '<<>>', 5, { text: 'x' }, 'https://spam.com']));
    loadKept();
    expect(words()).toEqual(['good idea']);
    localStorage.setItem(JAR_KEY, '{not json');
    loadKept();
    expect(words()).toEqual([]);
  });
});
