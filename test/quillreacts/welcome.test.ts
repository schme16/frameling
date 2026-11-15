// @vitest-environment jsdom
// Quill welcoming somebody new. The pure parts (cleaning a name, gathering a crowd into turns, the words), and the flow on
// the real gate and the real toasts: by default the name is just said, under Ask me first it is covered and asked about and
// only a yes puts it anywhere a viewer can see, a crowd is welcomed together and never dropped, and Stop ends it all.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { audience, installAudience, setAudienceOn, submitAudience } from '../../src/audience';
import { cleanDisplayName } from '../../src/audience/cleanText';
import { _resetFeaturesForTests, registerFeatures } from '../../src/features/host';
import { streamDoorFeature } from '../../src/streamdoor';
import { quillReactsFeature } from '../../src/quillreacts';
import { SIGN_ASK_MS, quillMoment } from '../../src/quillreacts/react';
import { NAMES_CHOICE } from '../../src/quillreacts/choices';
import { GAP_MS, namesMode, resetWelcomes } from '../../src/quillreacts/welcomeFlow';
import { addArrival, addName, askWords, MAX_NAMES, MAX_RAIDS, newNames, newPile, newRecent, parseArrival, pileSize, takeTurn, welcomeWords, WELCOME_ACTIONS, isWelcomeAction, type Arrival } from '../../src/quillreacts/welcome';
import { starterRules, payloadFor, sampleEvent, newRule, welcomePayload } from '../../src/twitch/rules';
import { normaliseNotice } from '../../src/shared/twitch';
import { clearToasts, toasts } from '../../src/ui/toast';
import { lines } from '../../src/ui/mascot/lines';

installAudience();

describe('cleaning a display name', () => {
  it('keeps what a real name has: letters of any language, digits, underscores, hyphens', () => {
    for (const n of ['Mika', 'cool_guy_42', 'Anne-Marie', "O'Neil", '田中さん', '김철수', 'Ñandú', 'Åsa', 'Дмитрий', 'สมชาย', 'अनिल']) expect(cleanDisplayName(n), n).toBe(n);
  });

  it('takes out what a name has no business holding: emoji, markup, invisible and direction marks', () => {
    expect(cleanDisplayName('Mika🔥🔥')).toBe('Mika');
    expect(cleanDisplayName('Mi​ka')).toBe('Mika');
    expect(cleanDisplayName('‮akiM')).toBe('akiM');
    expect(cleanDisplayName('<b>Mika</b>')).toBe('bMikab');
    expect(cleanDisplayName('Mika\u0000\u0007')).toBe('Mika');
  });

  it('tames stacked marks, long runs, web addresses and @names', () => {
    const zalgo = 'M̀́̂̃̄̅ika';
    expect(cleanDisplayName(zalgo)).toBe('M̀́ika');
    expect(cleanDisplayName('Miiiiiiika')).toBe('Miiika');
    expect(cleanDisplayName('mika.com')).toBeNull();
    expect(cleanDisplayName('@mika')).toBeNull();
    expect(cleanDisplayName('  ..Mika__  ')).toBe('Mika');
  });

  it('cuts to the length of a Twitch name by whole characters, and says nothing for nothing', () => {
    expect(cleanDisplayName('ab'.repeat(40))).toBe('ab'.repeat(12) + 'a');
    expect(Array.from(cleanDisplayName('名前'.repeat(40))!)).toHaveLength(25);
    for (const n of ['', '   ', '🔥🔥🔥', '___', '---', '​​', 42, null, undefined, {}]) expect(cleanDisplayName(n), String(n)).toBeNull();
  });
});

describe('what an arrival is', () => {
  it('never refuses: a welcome with no name is still a welcome', () => {
    expect(parseArrival('follow', undefined, true)).toEqual({ kind: 'follow' });
    expect(parseArrival('follow', 'a string', true)).toEqual({ kind: 'follow' });
    expect(parseArrival('raid', [1, 2], true)).toEqual({ kind: 'raid' });
  });

  it('drops the name when names are off, or when it cleans down to nothing', () => {
    expect(parseArrival('follow', { name: 'Mika' }, false)).toEqual({ kind: 'follow' });
    expect(parseArrival('follow', { name: '🔥🔥' }, true)).toEqual({ kind: 'follow' });
    expect(parseArrival('follow', { name: 'Mi​ka' }, true)).toEqual({ kind: 'follow', name: 'Mika' });
  });

  it('keeps a sane number and nothing else that came with it', () => {
    expect(parseArrival('cheer', { amount: 100.9, extra: 'x', user: 'someone' }, true)).toEqual({ kind: 'cheer', amount: 100 });
    expect(parseArrival('raid', { amount: 1e12 }, true).amount).toBe(10_000_000);
    expect(parseArrival('raid', { amount: -5 }, true).amount).toBeUndefined();
    expect(parseArrival('raid', { amount: Number.NaN }, true).amount).toBeUndefined();
    expect(parseArrival('sub', { resub: true }, true)).toEqual({ kind: 'sub', resub: true });
  });
});

describe('gathering a crowd', () => {
  const put = (p = newPile(), recent = newRecent(), declined = newNames(10)) => ({ p, recent, declined, add: (a: Arrival) => addArrival(p, a, recent, declined) });

  it('a crowd is a number: three hundred followers hold four names and a count', () => {
    const { p, add } = put();
    for (let i = 0; i < 300; i++) add({ kind: 'follow', name: `viewer${i}` });
    expect(p.follow.count).toBe(300);
    expect(p.follow.names).toHaveLength(MAX_NAMES);
    expect(JSON.stringify(p).length).toBeLessThan(600);
    const t = takeTurn(p)!;
    expect(t).toMatchObject({ kind: 'follow', count: 300, name: 'viewer0', others: 299 });
    expect(pileSize(p)).toBe(0);
  });

  it('only so many raids are held, and a raid is always its own turn', () => {
    const { p, add } = put();
    for (let i = 0; i < 10; i++) add({ kind: 'raid', name: `r${i}`, amount: 10 + i });
    expect(p.raids).toHaveLength(MAX_RAIDS);
    expect(takeTurn(p)).toMatchObject({ kind: 'raid', name: 'r0', amount: 10, count: 1, others: 0 });
  });

  it('takes a raid before a cheer before a subscriber before a follower, and everything gets its turn', () => {
    const { p, add } = put();
    add({ kind: 'follow' });
    add({ kind: 'sub' });
    add({ kind: 'cheer', amount: 50 });
    add({ kind: 'raid', amount: 7 });
    const order: string[] = [];
    for (let t = takeTurn(p); t; t = takeTurn(p)) order.push(t.kind);
    expect(order).toEqual(['raid', 'cheer', 'sub', 'follow']);
  });

  it('several cheers are one total with no name, and several nameless people have none to say', () => {
    const { p, add } = put();
    add({ kind: 'cheer', name: 'A', amount: 100 });
    add({ kind: 'cheer', name: 'B', amount: 250 });
    const c = takeTurn(p)!;
    expect(c).toMatchObject({ kind: 'cheer', count: 2, amount: 350, others: 0 });
    expect(c.name).toBeUndefined();
    add({ kind: 'follow' });
    add({ kind: 'follow' });
    expect(takeTurn(p)).toMatchObject({ count: 2, others: 0 });
  });

  it('somebody already welcomed is skipped, but one who followed may still subscribe', () => {
    const { p, recent, add } = put();
    addName(recent.follow, 'Mika');
    expect(add({ kind: 'follow', name: 'mika' })).toBe(false);
    expect(add({ kind: 'sub', name: 'Mika' })).toBe(true);
    expect(add({ kind: 'cheer', name: 'Mika', amount: 1 })).toBe(true);
    expect(p.follow.count).toBe(0);
  });

  it('a name you left out is counted but never said, in any capitalisation', () => {
    const { p, declined, add } = put();
    addName(declined, 'Rude One');
    add({ kind: 'raid', name: 'RUDE one', amount: 20 });
    add({ kind: 'follow', name: 'rude ONE' });
    expect(takeTurn(p)!.name).toBeUndefined();
    const f = takeTurn(p)!;
    expect(f.count).toBe(1);
    expect(f.name).toBeUndefined();
  });

  it('the short lists never grow past their cap', () => {
    const n = newNames(3);
    for (const x of ['a', 'b', 'c', 'd', 'a']) addName(n, x);
    expect(n.list).toEqual(['c', 'd', 'a']);
  });
});

describe('what he says', () => {
  const turn = (o: Partial<ReturnType<typeof takeTurn> & object>) => ({ kind: 'follow' as const, count: 1, others: 0, amount: 0, resub: false, ...o });
  const first = () => 0;

  it('says each kind its own way, with the name only when it may be said', () => {
    expect(welcomeWords(turn({ name: 'Mika' }), true, first)).toContain('Mika');
    expect(welcomeWords(turn({ name: 'Mika' }), false, first)).not.toContain('Mika');
    expect(welcomeWords(turn({ kind: 'sub', name: 'Mika', resub: true }), true, first)).toBe(lines('stream.welcome.resub.named', { name: 'Mika' })[0]);
    expect(welcomeWords(turn({ kind: 'cheer', name: 'Mika', amount: 250 }), true, first)).toMatch(/Mika.*250|250.*Mika/);
    expect(welcomeWords(turn({ kind: 'raid', name: 'Mika', amount: 40 }), true, first)).toMatch(/Mika.*40/);
    expect(welcomeWords(turn({ kind: 'raid', amount: 40 }), false, first)).toMatch(/40/);
  });

  it('says a crowd as a number, and the first name with the rest counted', () => {
    expect(welcomeWords(turn({ count: 37 }), false, first)).toContain('37');
    expect(welcomeWords(turn({ count: 37, name: 'Mika', others: 36 }), true, first)).toMatch(/Mika.*36/);
  });

  it('never leaves a gap showing, whatever the turn', () => {
    for (const kind of ['follow', 'sub', 'cheer', 'raid'] as const)
      for (const name of [undefined, 'Mika'])
        for (const count of [1, 5])
          for (const named of [true, false]) for (const r of [0, 0.5, 0.99]) expect(welcomeWords(turn({ kind, name, count, others: name ? count - 1 : 0, amount: 12, resub: kind === 'sub' && count === 1 }), named, () => r)).not.toMatch(/[{}]/);
  });

  it('asks about the name with the name in the question and the rest as a number', () => {
    expect(askWords(turn({ name: 'Mika' }))).toContain('Mika');
    expect(askWords(turn({ name: 'Mika', others: 6, count: 7 }))).toMatch(/Mika.*6 more/);
    expect(askWords(turn({ name: 'Mika' }))).not.toMatch(/—/);
  });
});

describe('Twitch events and links', () => {
  const notice = { user_name: 'Mika', user_login: 'mika', user_id: '123', from_broadcaster_user_name: 'RaidChan', from_broadcaster_user_id: '9', viewers: 40, bits: 100, message: 'a private message' };

  it('reads no name unless it was asked to', () => {
    for (const type of ['channel.follow', 'channel.subscribe', 'channel.subscription.message', 'channel.cheer', 'channel.raid'])
      expect(JSON.stringify(normaliseNotice(type, notice)), type).not.toMatch(/Mika|RaidChan|123|mika/);
  });

  it('with names asked for, reads only the display name: not the login, the id or the message', () => {
    const opts = { names: true };
    expect(normaliseNotice('channel.follow', notice, opts)).toEqual({ kind: 'follow', name: 'Mika' });
    expect(normaliseNotice('channel.subscribe', notice, opts)).toEqual({ kind: 'sub', resub: false, name: 'Mika' });
    expect(normaliseNotice('channel.subscription.message', notice, opts)).toEqual({ kind: 'sub', resub: true, name: 'Mika' });
    expect(normaliseNotice('channel.cheer', notice, opts)).toEqual({ kind: 'cheer', bits: 100, name: 'Mika' });
    expect(normaliseNotice('channel.raid', notice, opts)).toEqual({ kind: 'raid', viewers: 40, name: 'RaidChan' });
    expect(JSON.stringify(normaliseNotice('channel.follow', notice, opts))).not.toMatch(/mika"|123|private/);
  });

  it('an anonymous cheer has no name, and a name is cut to Twitch\'s length before it goes anywhere', () => {
    expect(normaliseNotice('channel.cheer', { ...notice, is_anonymous: true }, { names: true })).toEqual({ kind: 'cheer', bits: 100 });
    const long = normaliseNotice('channel.follow', { user_name: 'x'.repeat(500) }, { names: true });
    expect((long as { name: string }).name.length).toBeLessThanOrEqual(50);
    expect(normaliseNotice('channel.follow', { user_name: 42 }, { names: true })).toEqual({ kind: 'follow' });
  });

  it('a welcome link carries the size and the name; any other link carries neither', () => {
    const welcome = newRule('raid', 'quill.welcome.raid');
    expect(payloadFor(welcome, { kind: 'raid', viewers: 40, name: 'Mika' })).toEqual({ amount: 40, name: 'Mika' });
    const plain = newRule('raid', 'quill.wave');
    expect(payloadFor(plain, { kind: 'raid', viewers: 40, name: 'Mika' })).toBeUndefined();
    expect(welcomePayload({ kind: 'follow' })).toEqual({});
    expect(welcomePayload({ kind: 'sub', resub: true, name: 'Mika' })).toEqual({ resub: true, name: 'Mika' });
    expect(welcomePayload({ kind: 'redemption', rewardId: 'r', rewardTitle: 't', text: 'words' })).toEqual({});
  });

  it('Try it on a welcome uses a made-up name, never anybody\'s', () => {
    expect(sampleEvent(newRule('follow', 'quill.welcome.follow'))).toEqual({ kind: 'follow', name: 'Sam' });
  });

  it('the starter links are welcomes where the action exists, and fall back to the plain reactions where it does not', () => {
    expect(starterRules(() => true).map((r) => r.action)).toEqual(['quill.cheer', 'quill.welcome.raid', 'quill.welcome.follow', 'quill.welcome.sub', 'quill.welcome.cheer']);
    expect(starterRules((id) => !isWelcomeAction(id)).map((r) => r.action)).toEqual(['quill.cheer', 'quill.wave', 'quill.hop', 'quill.nuzzle', 'quill.snack']);
  });
});

// ---------------------------------------------------------------------------------- the flow, on the real gate

const on = () => toasts.get();
const press = (id: string) => {
  const t = on().find((x) => x.action?.id === id || x.decline?.id === id)!;
  (t.action?.id === id ? t.action : t.decline)!.run();
};
const settle = () => vi.advanceTimersByTimeAsync(0);
const ask = () => on().find((t) => t.action?.id === 'welcome-yes');
const shown = () => on().filter((t) => !t.action);
const welcome = (kind: string, raw?: unknown) => submitAudience(`quill.welcome.${kind}`, raw);

let clock = Date.now() + 30_000_000;
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
  resetWelcomes();
  clearToasts();
  setChoice(NAMES_CHOICE, undefined);
  setAudienceOn(true);
  later();
});
afterEach(() => vi.useRealTimers());
afterAll(() => setAudienceOn(false));

describe('a named welcome by default', () => {
  it('says the name with no question: not covered, on the screen and on the overlay', async () => {
    expect(namesMode()).toBe('say');
    expect(welcome('follow', { name: 'Mika' })).toMatchObject({ ok: true });
    await settle();
    expect(ask()).toBeUndefined();
    expect(shown()[0].message).toContain('Mika');
    expect(shown()[0].covered).toBeFalsy();
    expect(quillMoment.get()!.words).toContain('Mika');
    expect(quillMoment.get()!.anim).toBe('wave');
  });

  it('is the same when Say the name is picked outright', async () => {
    setChoice(NAMES_CHOICE, 'say');
    welcome('sub', { name: 'Mika' });
    await settle();
    expect(ask()).toBeUndefined();
    expect(shown()[0].message).toContain('Mika');
  });

  it('still cleans the name first, and a name that cleans down to nothing gets a nameless welcome', async () => {
    welcome('follow', { name: 'Mika🔥🔥' });
    await settle();
    expect(shown()[0].message).toContain('Mika');
    expect(shown()[0].message).not.toMatch(/🔥/);
    await vi.advanceTimersByTimeAsync(3800 + GAP_MS + 10);
    clearToasts();
    welcome('raid', { name: '🔥🔥🔥', amount: 12 });
    await settle();
    expect(ask()).toBeUndefined();
    expect(shown()).toHaveLength(1);
    expect(shown()[0].message).toContain('12');
  });

  it('a crowd is one welcome with the first name and a count, never one per person and never asked about', async () => {
    for (let i = 0; i < 90; i++) welcome('follow', { name: `viewer${i}` });
    await settle();
    expect(ask()).toBeUndefined();
    expect(shown()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3800 + GAP_MS + 10);
    expect(ask()).toBeUndefined();
    expect(shown()[0].message).toMatch(/viewer1/);
    expect(shown()[0].message).toMatch(/88/);
    expect(shown()[0].message.match(/viewer\d+/g)!.length).toBeLessThanOrEqual(MAX_NAMES);
  });

  it('Stop still drops everyone waiting', async () => {
    welcome('follow', { name: 'Mika' });
    for (let i = 0; i < 20; i++) welcome('follow', { name: `viewer${i}` });
    await settle();
    expect(shown()).toHaveLength(1);
    audience.kill();
    await settle();
    expect(on()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(on()).toHaveLength(0);
  });

  it('forgets the names left out under Ask me first as soon as the answer is anything else', async () => {
    setChoice(NAMES_CHOICE, 'ask');
    welcome('follow', { name: 'Rude One' });
    await settle();
    press('welcome-no');
    await settle();
    await vi.advanceTimersByTimeAsync(3800 + GAP_MS + 10);
    setChoice(NAMES_CHOICE, 'say');
    later(60_000);
    welcome('raid', { name: 'rude one', amount: 30 });
    await settle();
    expect(ask()).toBeUndefined();
    expect(shown().at(-1)!.message).toMatch(/rude one/i);
    // And back to asking: the old left-out list is not quietly still there.
    setChoice(NAMES_CHOICE, 'ask');
    await vi.advanceTimersByTimeAsync(6000 + GAP_MS + 10);
    later(60_000);
    welcome('raid', { name: 'RUDE ONE', amount: 31 });
    await settle();
    expect(ask()).toBeTruthy();
  });
});

describe('a named welcome, with Ask me first', () => {
  beforeEach(() => setChoice(NAMES_CHOICE, 'ask'));

  it('asks first, with the name covered, and nothing reaches the stream overlay yet', async () => {
    expect(welcome('follow', { name: 'Mika' })).toMatchObject({ ok: true });
    await settle();
    const q = ask()!;
    expect(q).toBeTruthy();
    expect(q.covered).toBeTruthy();
    expect(q.covered).not.toContain('Mika');
    expect(q.decline!.label).toBe('Leave the name out');
    expect(quillMoment.get()).toBeNull();
  });

  it('a yes says it, on the screen and on the overlay', async () => {
    welcome('follow', { name: 'Mika' });
    await settle();
    press('welcome-yes');
    await settle();
    expect(ask()).toBeUndefined();
    expect(shown()[0].message).toContain('Mika');
    expect(quillMoment.get()!.words).toContain('Mika');
    expect(quillMoment.get()!.anim).toBe('wave');
    expect(quillMoment.get()!.sign).toBe(false);
  });

  it('Leave the name out welcomes them without it, and remembers not to say it again this session', async () => {
    welcome('follow', { name: 'Rude One' });
    await settle();
    press('welcome-no');
    await settle();
    expect(shown()[0].message).not.toMatch(/Rude/);
    expect(quillMoment.get()!.words).not.toMatch(/Rude/);
    later(60_000);
    await vi.advanceTimersByTimeAsync(10_000);
    // The same name arriving as a raid is welcomed too, and still without the name: nothing is asked.
    welcome('raid', { name: 'RUDE one', amount: 30 });
    await settle();
    expect(ask()).toBeUndefined();
    expect(shown()[0].message).not.toMatch(/rude/i);
    expect(shown()[0].message).toContain('30');
  });

  it('no answer in time means no name, and the person is still welcomed', async () => {
    welcome('sub', { name: 'Mika' });
    await settle();
    await vi.advanceTimersByTimeAsync(SIGN_ASK_MS + 10);
    expect(ask()).toBeUndefined();
    expect(shown()).toHaveLength(1);
    expect(shown()[0].message).not.toContain('Mika');
    expect(quillMoment.get()!.anim).toBe('nuzzle');
  });

  it('a hostile raid name is never read out unasked, whatever it says', async () => {
    const hostile = 'SlurSlurSlur';
    welcome('raid', { name: hostile, amount: 300 });
    await settle();
    expect(JSON.stringify([shown().map((t) => t.message), quillMoment.get(), ask()?.covered])).not.toContain(hostile);
    await vi.advanceTimersByTimeAsync(SIGN_ASK_MS + 10);
    expect(JSON.stringify([shown().map((t) => t.message), quillMoment.get()])).not.toContain(hostile);
    expect(shown()[0].message).toContain('300');
  });

  it('a name that cleans down to nothing is welcomed without a question', async () => {
    welcome('follow', { name: '🔥🔥🔥' });
    await settle();
    expect(ask()).toBeUndefined();
    expect(shown()).toHaveLength(1);
  });

  it('with names set to Never, nothing is asked and no name is ever used', async () => {
    setChoice(NAMES_CHOICE, 'never');
    expect(namesMode()).toBe('never');
    welcome('follow', { name: 'Mika' });
    await settle();
    expect(ask()).toBeUndefined();
    expect(shown()[0].message).not.toContain('Mika');
  });

  it('without a name there is no question and a plain welcome', async () => {
    welcome('cheer', { amount: 500 });
    await settle();
    expect(ask()).toBeUndefined();
    expect(shown()[0].message).toContain('500');
  });
});

describe('a crowd', () => {
  it('every follower is accepted (asking first): none is turned away by a cooldown, and they come out as one welcome with a number', async () => {
    setChoice(NAMES_CHOICE, 'ask');
    for (let i = 0; i < 90; i++) expect(welcome('follow', { name: `viewer${i}` }), `${i}`).toMatchObject({ ok: true });
    await settle();
    // The first is being asked about alone; the other 89 wait together.
    press('welcome-no');
    await settle();
    expect(shown()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3800 + GAP_MS + 10);
    const q = ask()!;
    expect(q).toBeTruthy();
    expect(q.message).toMatch(/viewer1/);
    expect(q.message).toMatch(/88 more/);
    press('welcome-no');
    await settle();
    expect(shown()[0].message).toContain('89');
    expect(shown()[0].message).not.toMatch(/viewer/);
  });

  it('the hundredth is not refused either, once the second has moved on', async () => {
    for (let i = 0; i < 100; i++) expect(welcome('follow'), `${i}`).toMatchObject({ ok: true });
    later(1100);
    expect(welcome('follow')).toMatchObject({ ok: true });
    await settle();
    expect(shown()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3800 + GAP_MS + 10);
    expect(shown()[0].message).toContain('100');
  });

  it('a raid comes before the crowd that arrived at the same time', async () => {
    setChoice(NAMES_CHOICE, 'never');
    welcome('follow');
    await settle();
    welcome('follow');
    welcome('follow');
    welcome('raid', { amount: 25 });
    await vi.advanceTimersByTimeAsync(3800 + GAP_MS + 10);
    expect(shown()[0].message).toContain('25');
  });

  it('the same follower twice is welcomed once', async () => {
    setChoice(NAMES_CHOICE, 'ask');
    welcome('follow', { name: 'Mika' });
    await settle();
    press('welcome-yes');
    await settle();
    await vi.advanceTimersByTimeAsync(3800 + GAP_MS + 10);
    later(1000);
    const before = on().length;
    expect(welcome('follow', { name: 'mika' })).toMatchObject({ ok: true });
    await settle();
    expect(ask()).toBeUndefined();
    expect(on()).toHaveLength(before);
  });
});

describe('Stop and what is kept', () => {
  it('Stop ends the question, drops everyone waiting, and nobody comes back after (asking first)', async () => {
    setChoice(NAMES_CHOICE, 'ask');
    welcome('follow', { name: 'Mika' });
    for (let i = 0; i < 20; i++) welcome('follow');
    await settle();
    expect(ask()).toBeTruthy();
    audience.kill();
    await settle();
    expect(on()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(on()).toHaveLength(0);
  });

  it('keeps no trace of a name once it is over: not on screen, not in storage, not in the counts', async () => {
    setChoice(NAMES_CHOICE, 'ask');
    welcome('follow', { name: 'Zebracake Fan' });
    await settle();
    press('welcome-yes');
    await settle();
    await vi.advanceTimersByTimeAsync(10_000);
    clearToasts();
    expect(JSON.stringify([audience.snapshot(), { ...localStorage }, quillMoment.get()])).not.toContain('Zebracake');
  });

  it('the welcomes are on the gate, view and words only, and offered to link', () => {
    const mine = audience.snapshot().actions.filter((a) => a.id.startsWith('quill.welcome.'));
    expect(mine.map((a) => a.id).sort()).toEqual(WELCOME_ACTIONS.map((a) => a.id).sort());
    for (const a of mine) expect([a.touchesDrawing, a.bulk, a.available]).toEqual([false, true, true]);
  });
});
