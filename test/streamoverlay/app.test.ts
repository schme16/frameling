// @vitest-environment jsdom
// The overlay in the app: each piece comes from the one place that holds it, appears when that place says so and is
// gone after, nothing private is ever on the list, and the feature brings its commands, menu entries, help and choices.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp } from '../../src/core/registry';
import { setStreamSafe } from '../../src/core/streamSafe';
import { dareScreen } from '../../src/dares/fx';
import { _resetFeaturesForTests, isFeatureOn, registerFeatures, setFeatureOn } from '../../src/features/host';
import { jarShown } from '../../src/promptjar/card';
import { addToJar, emptyJar, jar, pullOne } from '../../src/promptjar/jar';
import { quillMoment, react, showSign } from '../../src/quillreacts/react';
import { streamDoorFeature } from '../../src/streamdoor';
import { doorStatus } from '../../src/streamdoor/state';
import { streamOverlayFeature } from '../../src/streamoverlay';
import { buildOverlay, fromVoteView, overlayTest, overlayVote, promptMayShow, startOverlayTest, TEST_MS } from '../../src/streamoverlay/sources';
import { cleanOverlayState, overlayIsEmpty } from '../../src/shared/streamOverlay';
import { clearToasts } from '../../src/ui/toast';
import { resolveMenus, type MenuItem } from '../../src/ui/menus';
import { setPrefs } from '../../src/ui/prefs';

const NOW = 1_800_000_000_000;
beforeAll(() => {
  setChoiceAsker(null);
  _resetFeaturesForTests();
  registerFeatures([streamDoorFeature, streamOverlayFeature]);
});
afterAll(() => _resetFeaturesForTests());
beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  clearToasts();
  quillMoment.set(null);
  dareScreen.set({ held: [], banner: null, countdown: null });
  emptyJar();
  jarShown.set(null);
  overlayVote.set(null);
  overlayTest.set(null);
  setStreamSafe(false);
  setChoice('streamoverlay.prompt', undefined);
  setChoice('streamoverlay.quill', undefined);
  setPrefs({ showQuill: true });
});
afterEach(() => vi.useRealTimers());

/** What the page would be sent, after the desktop side has cleaned it. */
const sent = () => cleanOverlayState(JSON.parse(JSON.stringify(buildOverlay())), Date.now());
const held = (resource: 'view' | 'banner' | 'countdown' | 'colour', id: string, label: string, ms: number) => ({ resource, id, label, startedAt: Date.now(), endsAt: Date.now() + ms });

describe('nothing is happening', () => {
  it('sends nothing at all', () => {
    expect(overlayIsEmpty(sent())).toBe(true);
  });
  it('sends the theme, which is not something to show', () => {
    expect(buildOverlay().theme).toMatchObject({ text: expect.stringMatching(/^#/), accent: expect.stringMatching(/^#/) });
  });
});

describe('Quill', () => {
  it('appears when he reacts and is gone when his time is up', () => {
    const words = react('cheer', () => 0);
    expect(sent().quill).toMatchObject({ anim: 'cheer', words, sign: false });
    vi.advanceTimersByTime(4300);
    expect(sent().quill).toBeNull();
  });
  it('a snack is eating and a sign is holding, and a sign is marked as one', () => {
    react('snack');
    expect(sent().quill!.anim).toBe('eat');
    showSign('Hello from chat');
    expect(sent().quill).toMatchObject({ anim: 'holding', words: 'Hello from chat', sign: true });
  });
  it('a new reaction takes the place of the last', () => {
    react('cheer');
    const a = sent().quill!.id;
    react('hop');
    expect(sent().quill).toMatchObject({ anim: 'hop' });
    expect(sent().quill!.id).not.toBe(a);
  });
  it('stays off the overlay when the streamer chose so, or turned Quill off', () => {
    react('cheer');
    setChoice('streamoverlay.quill', 'hide');
    expect(sent().quill).toBeNull();
    setChoice('streamoverlay.quill', 'show');
    expect(sent().quill).not.toBeNull();
    setPrefs({ showQuill: false });
    expect(sent().quill).toBeNull();
  });
});

describe('dares', () => {
  it('shows the banner while the dare holds it, and not after', () => {
    dareScreen.set({ held: [held('banner', 'dare.challenge', 'Challenge', 30_000)], banner: { text: 'Draw with your other hand.' }, countdown: null });
    expect(sent().banner).toMatchObject({ text: 'Draw with your other hand.' });
    dareScreen.set({ held: [], banner: null, countdown: null });
    expect(sent().banner).toBeNull();
  });
  it('shows the countdown with its end time, then Time! for a moment, then nothing', () => {
    dareScreen.set({ held: [held('countdown', 'dare.countdown', 'Countdown', 20_000)], banner: null, countdown: { text: 'Beat the clock', over: false } });
    expect(sent().countdown).toMatchObject({ text: 'Beat the clock', endsAt: NOW + 20_000, over: false });
    dareScreen.set({ held: [], banner: null, countdown: { text: 'Beat the clock', over: true } });
    const over = sent().countdown!;
    expect(over.over).toBe(true);
    vi.advanceTimersByTime(2600);
    expect(over.until).toBeLessThan(Date.now());
    dareScreen.set({ held: [], banner: null, countdown: null });
    expect(sent().countdown).toBeNull();
  });
  it('shows a chip for each lasting dare', () => {
    dareScreen.set({ held: [held('view', 'dare.flip', 'Flipped view', 15_000), held('colour', 'dare.grey', 'Grey screen', 9000)], banner: null, countdown: null });
    expect(sent().chips.map((c) => c.label)).toEqual(['Flipped view', 'Grey screen']);
  });
});

describe('the prompt jar', () => {
  const fill = () => {
    for (const t of ['a frog in a teacup', 'a very sleepy dragon', 'two snails racing']) addToJar(t);
  };
  it('shows nothing from the jar while nobody has pulled one out', () => {
    fill();
    expect(JSON.stringify(sent())).not.toMatch(/frog|dragon|snails/);
    expect(sent().prompt).toBeNull();
  });
  it('shows a pulled prompt only once the streamer says Show on stream, then drops it when it is gone', () => {
    fill();
    const slip = pullOne(() => 0)!;
    expect(sent().prompt).toBeNull();
    jarShown.set(slip.id);
    expect(sent().prompt).toMatchObject({ id: slip.id, text: slip.text });
    // Only the one in hand: the others are still private.
    expect(JSON.stringify(sent())).not.toMatch(/dragon|snails/);
    jar.set((s) => ({ ...s, hand: null }));
    expect(sent().prompt).toBeNull();
  });
  it('a new pull starts hidden again', () => {
    fill();
    const a = pullOne(() => 0)!;
    jarShown.set(a.id);
    const b = pullOne(() => 0)!;
    expect(b.id).not.toBe(a.id);
    expect(sent().prompt).toBeNull();
  });
  it('goes up straight away when the streamer chose that, but never while Stream-safe is on without Show it', () => {
    fill();
    pullOne(() => 0);
    setChoice('streamoverlay.prompt', 'now');
    expect(sent().prompt!.text).toBe('a frog in a teacup');
    setStreamSafe(true);
    expect(sent().prompt).toBeNull();
    jarShown.set(jar.get().hand!.id);
    expect(sent().prompt).not.toBeNull();
  });
  it('promptMayShow is a plain rule', () => {
    expect(promptMayShow(1, null, false, 'ask')).toBe(false);
    expect(promptMayShow(1, 1, false, 'ask')).toBe(true);
    expect(promptMayShow(1, null, false, 'now')).toBe(true);
    expect(promptMayShow(1, null, true, 'now')).toBe(false);
    expect(promptMayShow(1, 2, false, 'ask')).toBe(false);
  });
});

describe('votes (the seam)', () => {
  it('shows nothing until the votes feature says there is one, and nothing after it closes', () => {
    expect(sent().vote).toBeNull();
    overlayVote.set({ status: 'open', question: 'What next?', options: ['Hat', 'Cape'], counts: [3, 1], endsAt: NOW + 30_000, winner: -1 });
    expect(sent().vote).toMatchObject({ status: 'open', question: 'What next?', options: [{ label: 'Hat', votes: 3 }, { label: 'Cape', votes: 1 }] });
    overlayVote.set(null);
    expect(sent().vote).toBeNull();
  });
  it('takes the votes feature view as it stands, counts and words only', () => {
    const view = { status: 'ended' as const, question: 'Q', options: ['a', 'b'], counts: [1, 4], total: 5, startedAt: 1, endsAt: null, endedAt: 2, turnedAway: { closed: 9 }, outcome: { kind: 'winner', index: 1 }, salt: 'secret', marks: ['m1'] };
    const v = fromVoteView(view);
    expect(v).toEqual({ status: 'ended', question: 'Q', options: ['a', 'b'], counts: [1, 4], endsAt: null, winner: 1 });
    expect(fromVoteView({ ...view, outcome: { kind: 'tie' } }).winner).toBe(-1);
    overlayVote.set(v);
    expect(JSON.stringify(sent())).not.toMatch(/secret|m1|turnedAway/);
  });
});

describe('the test', () => {
  it('shows a made-up Quill, banner and prompt for a few seconds, then nothing, and uses nothing from anyone', () => {
    addToJar('private idea');
    react('cheer');
    startOverlayTest();
    const s = sent();
    expect(s.quill!.words).toBe('The overlay is working!');
    expect(s.banner!.text).toBe('This is a test banner');
    expect(s.prompt!.text).toBe('A test prompt: draw a hedgehog');
    expect(JSON.stringify(s)).not.toContain('private idea');
    vi.advanceTimersByTime(TEST_MS + 100);
    expect(overlayIsEmpty(sent())).toBe(true);
  });
});

describe('nothing private, whatever is in the sources', () => {
  it('scrubs paths, links, names and keys out of every piece', () => {
    quillMoment.set({ id: 1, anim: 'holding', words: 'at /home/shane/art/me.png and @bob https://evil.example', sign: true, until: NOW + 5000 });
    dareScreen.set({ held: [held('banner', 'dare.challenge', 'Challenge', 9000)], banner: { text: 'C:\\Users\\Shane\\x.png' }, countdown: null });
    addToJar('see mail@x.com');
    jarShown.set(pullOne(() => 0)!.id);
    const out = JSON.stringify(sent());
    expect(out).not.toMatch(/shane|bob|evil|Users|mail@|home/i);
  });
});

describe('the feature', () => {
  it('is on with the door, and brings its commands, menu entries, help and choices', () => {
    expect(isFeatureOn('stream-overlay')).toBe(true);
    for (const id of ['streamoverlay.settings', 'streamoverlay.copyAddress', 'streamoverlay.test', 'streamoverlay.roll']) {
      const c = getCommand(id)!;
      expect(c, id).toBeTruthy();
      expect(c.help).toBe('stream-overlay');
      expect(c.category).toBe('Audience');
    }
    expect(getHelp('stream-overlay')).toBeTruthy();
    const all = () => resolveMenus().flatMap((m) => m.items);
    const ids = (items: MenuItem[]): string[] => items.flatMap((i) => (i.kind === 'command' ? [i.command.id] : i.kind === 'submenu' ? ids(i.items) : []));
    expect(ids(all())).toEqual(expect.arrayContaining(['streamoverlay.settings', 'streamoverlay.copyAddress', 'streamoverlay.test', 'streamoverlay.roll']));
    setFeatureOn('stream-overlay', false);
    expect(ids(all())).not.toContain('streamoverlay.test');
    setFeatureOn('stream-overlay', true);
  });
  it('needs the actions door: the door cannot go while this is on, and turning this on brings the door back', () => {
    expect(setFeatureOn('stream-door', false).ok).toBe(false);
    expect(setFeatureOn('stream-overlay', false).ok).toBe(true);
    expect(isFeatureOn('stream-overlay')).toBe(false);
    expect(getCommand('streamoverlay.test')).toBeUndefined();
    expect(getHelp('stream-overlay')).toBeFalsy();
    expect(setFeatureOn('stream-door', false).ok).toBe(true);
    expect(setFeatureOn('stream-overlay', true).ok).toBe(true);
    expect(isFeatureOn('stream-door')).toBe(true);
    expect(getCommand('streamoverlay.test')).toBeTruthy();
  });
  it('the copy and test commands wait for the door to be open', () => {
    expect(doorStatus.get().running).toBe(false);
    expect(getCommand('streamoverlay.test')!.enabled?.({} as never)).toBe(false);
  });
});
