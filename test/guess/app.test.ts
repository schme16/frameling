// @vitest-environment jsdom
// Guess the drawing in the app, on the real audience gate: the action is on the list, view-only and bulk, guesses are
// matched fairly, one person is one place, a round ends by a right guess, by its clock or by hand, the word is never in
// anything the screen reads while it runs, Quill joins in, NOTHING reaches the drawing, and nothing identifying is left.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { newDoc } from '../../src/core/doc';
import { setStreamSafe } from '../../src/core/streamSafe';
import { audience, installAudience, setAudienceDrawing, setAudienceOn, submitAudience } from '../../src/audience';
import { _resetFeaturesForTests, isFeatureOn, registerFeatures, setFeatureOn } from '../../src/features/host';
import { streamDoorFeature } from '../../src/streamdoor';
import { guessFeature } from '../../src/guess';
import { GUESS_ACTION } from '../../src/guess/actions';
import { _resetGuessForTests, closeRound, endRound, flushRound, giveHint, guessScreen, peek, peekUntil, peekWord, startRound } from '../../src/guess/state';
import { clearToasts, toasts } from '../../src/ui/toast';
import { lines } from '../../src/ui/mascot/lines';
import { resolveMenus, type MenuItem } from '../../src/ui/menus';

installAudience();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const send = (guess: unknown, player?: unknown, extra: object = {}) => submitAudience(GUESS_ACTION, player === undefined ? { guess, ...extra } : { guess, player, ...extra });
const SETUP = { word: 'elephant', seconds: null, ending: 'first' };
const view = () => {
  flushRound();
  const s = guessScreen.get();
  if (s.phase === 'none') throw new Error('no round on screen');
  return s;
};
const toastText = () => JSON.stringify(toasts.get().map((t) => (t as { message?: unknown }).message ?? t));

let clock = 6_000_000_000;
beforeAll(() => {
  setChoiceAsker(null);
  _resetFeaturesForTests();
  registerFeatures([streamDoorFeature, guessFeature]);
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: (clock += 10_000_000) });
  for (const id of ['guess.ending', 'guess.winnerName', 'guess.peek']) setChoice(id, undefined);
  setChoice('audience.strictness', 'balanced');
  setStreamSafe(false);
  audience.kill();
  audience.resetCounts();
  _resetGuessForTests();
  clearToasts();
  setAudienceDrawing(false);
  setAudienceOn(true);
});
afterEach(() => {
  closeRound();
  setStreamSafe(false);
  vi.useRealTimers();
});
afterAll(() => setAudienceOn(false));

describe('registered', () => {
  it('is a switchable feature that needs the door, with commands, help with media and a menu home', () => {
    expect(isFeatureOn('stream-guess')).toBe(true);
    expect(guessFeature.requires).toEqual(['stream-door']);
    for (const id of ['guess.start', 'guess.hint', 'guess.peek', 'guess.end', 'guess.close']) {
      const c = getCommand(id)!;
      expect(c, id).toBeTruthy();
      expect(c.category).toBe('Audience');
      expect(getHelp(c.help!), id).toBeTruthy();
    }
    expect(getCommand('guess.start')!.keys).toEqual(['Mod+Alt+Q']);
    expect(getCommand('guess.end')!.keys).toEqual(['Mod+Alt+Shift+Q']);
    expect(getHelp('guess')!.media).toBe('guess.mp4');
    expect(guessFeature.menus![0].menu).toBe('sub:guess');
    const find = (items: MenuItem[]): string[] => items.flatMap((it) => (it.kind === 'submenu' ? find(it.items) : it.kind === 'command' ? [it.command.id] : []));
    const ids = find(resolveMenus().flatMap((m) => m.items));
    for (const id of ['guess.start', 'guess.hint', 'guess.peek', 'guess.end', 'guess.close']) expect(ids, id).toContain(id);
  });

  it('puts one action on the gate: view-only and bulk, which the door lists as available even with the drawing switch off', () => {
    const a = audience.snapshot().actions.find((x) => x.id === GUESS_ACTION)!;
    expect(a).toBeTruthy();
    expect(a.touchesDrawing).toBe(false);
    expect(a.available).toBe(true);
    expect(a.kind).toBe('guess');
    expect(audience.snapshot().actions.filter((x) => x.id.startsWith('guess.'))).toHaveLength(1);
  });

  it('is bulk: no cooldown, no queue, whatever the strictness', () => {
    setChoice('audience.strictness', 'strict');
    startRound(SETUP);
    for (let i = 0; i < 100; i++) expect(send(`wrong${i}`, `crowd${i}`).ok, String(i)).toBe(true);
    expect(view().view.players).toBe(100);
    expect(audience.snapshot().queue).toEqual([]);
  });

  it('goes with the feature: no action, no commands, and a round that was going is dropped', () => {
    startRound(SETUP);
    setFeatureOn('stream-guess', false);
    expect(audience.snapshot().actions.some((a) => a.id === GUESS_ACTION)).toBe(false);
    expect(getCommand('guess.start')).toBeUndefined();
    expect(guessScreen.get().phase).toBe('none');
    expect(submitAudience(GUESS_ACTION, { guess: 'x', player: 'a' })).toEqual({ ok: false, reason: 'unknown' });
    setFeatureOn('stream-guess', true);
    expect(audience.snapshot().actions.some((a) => a.id === GUESS_ACTION)).toBe(true);
  });

  it('is off with the master switch: a guess is refused', () => {
    startRound(SETUP);
    setAudienceOn(false);
    expect(guessScreen.get().phase).toBe('none');
    setAudienceOn(true);
    expect(send('elephant', 'a')).toEqual({ ok: false, reason: 'invalid', detail: 'closed' });
  });
});

describe('a round', () => {
  it('a right guess ends it with a winner, and the word comes up only now', () => {
    expect(startRound(SETUP)).toEqual({ ok: true });
    expect(view().phase).toBe('open');
    expect(send('giraffe', 'ann')).toEqual({ ok: true, outcome: 'ran' });
    expect(view().phase).toBe('open');
    // The door says the same for a right guess: nobody can test words through it.
    expect(send('Elephant!', 'bob')).toEqual({ ok: true, outcome: 'ran' });
    const r = view();
    expect(r.phase).toBe('result');
    expect(r.view.reason).toBe('solved');
    expect(r.view.answer).toBe('elephant');
    expect(r.view.solvers).toBe(1);
    expect(r.view.winner).toEqual({ name: null, afterMs: 0 });
  });

  it('matches fairly: a plural, a chatty guess and a slip of a letter all get it, a different real word does not', () => {
    for (const [g, ok] of [['is it an elephants?', true], ['ELEPHNT', true], ['elefant', true], ['giraffe', false], ['elephant or rhino', false]] as const) {
      closeRound();
      startRound(SETUP);
      send(g, 'p1');
      expect(view().view.status === 'ended', g).toBe(ok);
    }
    closeRound();
    startRound({ word: 'horse', seconds: null, ending: 'first' });
    send('house', 'p1');
    expect(view().view.status).toBe('open');
    expect(view().view.warmth).toBe('hot');
  });

  it('with "when the time is up", everyone who gets it counts and the round keeps going', () => {
    setChoice('guess.ending', 'timer');
    startRound({ ...SETUP, ending: 'timer', seconds: 60 });
    send('elephant', 'ann');
    send('elephant', 'bob');
    send('elephant', 'ann');
    expect(view().phase).toBe('open');
    expect(view().view.solvers).toBe(2);
    vi.advanceTimersByTime(61_000);
    const r = view();
    expect(r.phase).toBe('result');
    expect(r.view.reason).toBe('timeup');
    expect(r.view.solvers).toBe(2);
  });

  it('ends by itself when its time is up, and nobody got it', () => {
    startRound({ ...SETUP, seconds: 30 });
    send('giraffe', 'ann');
    vi.advanceTimersByTime(29_000);
    expect(view().phase).toBe('open');
    vi.advanceTimersByTime(1500);
    const r = view();
    expect(r.phase).toBe('result');
    expect(r.view.winner).toBeNull();
    expect(r.view.answer).toBe('elephant');
  });

  it('turns away guesses when no round is going, and after it ended', () => {
    expect(send('elephant', 'ann')).toEqual({ ok: false, reason: 'invalid', detail: 'closed' });
    startRound(SETUP);
    endRound();
    expect(send('elephant', 'ann')).toEqual({ ok: false, reason: 'invalid', detail: 'closed' });
  });

  it('turns away a guess with no player id, and says how many', () => {
    startRound(SETUP);
    expect(send('elephant')).toEqual({ ok: false, reason: 'invalid', detail: 'no-player' });
    expect(send('elephant', '  ')).toEqual({ ok: false, reason: 'invalid', detail: 'no-player' });
    expect(view().view.turnedAway['no-player']).toBe(2);
    expect(view().view.guesses).toBe(0);
  });

  it('one guess is counted per person-guess, and a person who got it cannot be counted twice', () => {
    setChoice('guess.ending', 'timer');
    startRound({ ...SETUP, ending: 'timer' });
    send('nope', 'ann');
    send('elephant', 'ann');
    // Already got it: the same word as running out of guesses, so it never says the word was right.
    expect(send('elephant', 'ann')).toEqual({ ok: false, reason: 'invalid', detail: 'again' });
    const v = view().view;
    expect(v.players).toBe(1);
    expect(v.guesses).toBe(2);
    expect(v.solvers).toBe(1);
  });

  it('is one at a time, and says what to do', () => {
    startRound(SETUP);
    expect(startRound(SETUP)).toEqual({ ok: false, reason: expect.stringContaining('already going') });
    endRound();
    expect(startRound(SETUP)).toEqual({ ok: false, reason: expect.stringContaining('last result') });
    closeRound();
    expect(startRound(SETUP).ok).toBe(true);
    closeRound();
    expect(startRound({ word: '' }).ok).toBe(false);
  });

  it('Stop drops a round that is going without showing the word, and a result you are reading stays until you close it', () => {
    startRound(SETUP);
    send('giraffe', 'ann');
    audience.kill();
    expect(guessScreen.get().phase).toBe('none');
    expect(toastText()).not.toMatch(/elephant/i);
    setAudienceOn(true);
    startRound(SETUP);
    endRound();
    audience.kill();
    expect(guessScreen.get().phase).toBe('result');
  });

  it('the commands follow what is going', () => {
    const en = (id: string) => getCommand(id)!.enabled!(store().get());
    expect(en('guess.start')).toBe(true);
    expect(en('guess.end')).toBe(false);
    expect(en('guess.hint')).toBe(false);
    expect(en('guess.close')).toBe(false);
    startRound(SETUP);
    expect(en('guess.start')).toBe(false);
    expect(en('guess.end')).toBe(true);
    expect(en('guess.hint')).toBe(true);
    getCommand('guess.hint')!.run();
    expect(view().view.shown.flat().filter(Boolean)).toHaveLength(1);
    getCommand('guess.end')!.run();
    expect(guessScreen.get().phase).toBe('result');
    expect(en('guess.close')).toBe(true);
    getCommand('guess.close')!.run();
    expect(guessScreen.get().phase).toBe('none');
  });
});

describe('the winner and the name', () => {
  it('stays anonymous by default, even when the tool sends a name', () => {
    startRound(SETUP);
    send('elephant', 'ann', { name: 'Ann Lee' });
    expect(view().view.winner?.name).toBeNull();
    expect(toastText()).not.toContain('Ann');
  });
  it('shows the name only when the streamer chose to, and forgets it when the result is closed', () => {
    setChoice('guess.winnerName', 'show');
    startRound(SETUP);
    send('elephant', 'ann', { name: 'Ann Lee' });
    expect(view().view.winner?.name).toBe('Ann Lee');
    expect(toastText()).toContain('Ann Lee');
    closeRound();
    expect(JSON.stringify(guessScreen.get())).not.toContain('Ann');
  });
  it('never reads a name from a wrong guess', () => {
    setChoice('guess.winnerName', 'show');
    startRound({ ...SETUP, ending: 'timer' });
    send('giraffe', 'bob', { name: 'Wrong Willy' });
    send('elephant', 'ann', { name: 'Ann Lee' });
    endRound();
    expect(JSON.stringify(guessScreen.get())).not.toContain('Willy');
  });
});

describe('Quill joins in', () => {
  const said = () => toasts.get().map((t) => (t as { message?: string }).message ?? '');
  it('cheers for a win, shrugs when nobody got it, and says a near miss once', () => {
    startRound({ word: 'horse', seconds: null, ending: 'first' });
    send('house', 'a');
    expect(said().some((s) => lines('stream.guess.close').includes(s))).toBe(true);
    clearToasts();
    send('house', 'b');
    expect(said()).toEqual([]);
    send('horse', 'c');
    expect(said().some((s) => lines('stream.guess.win').includes(s))).toBe(true);
    clearToasts();
    closeRound();
    startRound(SETUP);
    endRound();
    expect(said().some((s) => lines('stream.guess.nobody').includes(s))).toBe(true);
  });
  it('uses the winner name line only when a name shows', () => {
    setChoice('guess.winnerName', 'show');
    startRound(SETUP);
    send('elephant', 'a', { name: 'Ann' });
    expect(said().some((s) => /Ann/.test(s))).toBe(true);
  });
});

describe('the word is never on screen while the round runs', () => {
  const DOC_WORD = 'zeppelinfish';
  it('is in nothing the screen reads, the toasts, the gate or storage, from the start to the end of the round', () => {
    startRound({ word: DOC_WORD, seconds: null, ending: 'timer' });
    const everything = () =>
      JSON.stringify({ screen: guessScreen.get(), peek: peekUntil.get(), gate: audience.snapshot(), toasts: toastText(), storage: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])) });
    send('zeppelinfisk', 'a');
    send('giraffe', 'b');
    giveHint();
    // A hint shows its one letter and no more.
    const mid = everything();
    expect(mid).not.toContain(DOC_WORD);
    expect(view().view.answer).toBeNull();
    expect(view().view.shown.flat().filter(Boolean)).toHaveLength(1);
    send(DOC_WORD, 'c');
    expect(everything()).not.toContain(DOC_WORD);
    endRound();
    expect(view().view.answer).toBe(DOC_WORD);
    closeRound();
    expect(everything()).not.toContain(DOC_WORD);
  });

  it('can not be peeked at by default, nor while Stream-safe is on', () => {
    startRound(SETUP);
    expect(peek()).toBe(false);
    expect(peekWord()).toBeNull();
    setChoice('guess.peek', 'allow');
    setStreamSafe(true);
    expect(peek()).toBe(false);
    expect(peekWord()).toBeNull();
    expect(getCommand('guess.peek')!.enabled!(store().get())).toBe(false);
    expect(getCommand('guess.peek')!.reason!(store().get())).toMatch(/Stream-safe/);
  });

  it('can be peeked at for three seconds when you allow it, and then hides again', () => {
    setChoice('guess.peek', 'allow');
    startRound(SETUP);
    expect(getCommand('guess.peek')!.enabled!(store().get())).toBe(true);
    expect(peekWord()).toBe('elephant');
    expect(peek()).toBe(true);
    expect(peekUntil.get()).toBeGreaterThan(Date.now());
    vi.advanceTimersByTime(3100);
    expect(peekUntil.get()).toBe(0);
    // The time is held, never the word.
    expect(JSON.stringify(peekUntil.get())).not.toContain('elephant');
  });

  it('cannot be peeked at after the round, and Stream-safe going on ends a peek', () => {
    setChoice('guess.peek', 'allow');
    startRound(SETUP);
    peek();
    setStreamSafe(true);
    expect(peekWord()).toBeNull();
    endRound();
    expect(peekWord()).toBeNull();
    expect(peekUntil.get()).toBe(0);
  });
});

describe('nothing is applied', () => {
  it('a whole round, with the drawing switch ON, leaves the document and its history exactly as they were', () => {
    store().load(newDoc({ width: 320, height: 200 }));
    setAudienceDrawing(true);
    const doc = store().get().doc;
    const history = store().historyIds();
    const ui = store().get().ui;
    startRound({ word: 'rainbow', seconds: null, ending: 'timer' });
    for (let i = 0; i < 31; i++) send(i === 17 ? 'rainbow' : `try${i}`, `p${i}`);
    giveHint();
    endRound();
    expect(view().view.solvers).toBe(1);
    closeRound();
    expect(store().get().doc).toBe(doc);
    expect(store().get().ui).toBe(ui);
    expect(store().historyIds()).toEqual(history);
  });

  it('the action is registered with no way into the document: the gate gives it no edit', () => {
    let seen: unknown = 'unset';
    const off = audience.registerAction({ id: 'probe.look', label: 'Probe', kind: 'probe', cooldown: 0, bulk: true, run: (_p, ctx) => void (seen = ctx.edit) });
    setAudienceDrawing(true);
    submitAudience('probe.look');
    off();
    expect(seen).toBeUndefined();
  });

  it('no file in src/guess imports the store, the document, the tools or an editing helper, or asks for an edit', () => {
    const dir = path.join(root, 'src/guess');
    const files = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, f).not.toMatch(/from ['"]\.\.\/(core\/(store|doc|format)|tools|canvas|timeline|io)\b/);
      expect(code, f).not.toMatch(/touchesDrawing|ctx\.edit|\.edit\(|store\(\)|\.update\(/);
    }
  });

  it('nothing in src/guess writes a guess, a word or a name anywhere but memory', () => {
    const dir = path.join(root, 'src/guess');
    for (const f of fs.readdirSync(dir).filter((x) => /\.tsx?$/.test(x))) {
      const code = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
      if (f === 'setup.ts') continue;
      expect(code, f).not.toMatch(/localStorage|sessionStorage|writeJson|writeFile|indexedDB|console\.(log|info|warn)/);
    }
  });
});

describe('nothing identifying is left behind', () => {
  const IDS = ['998877665', 'night_owl_fan', 'Ann Lee'];
  const everything = () =>
    JSON.stringify({
      screen: guessScreen.get(),
      gate: audience.snapshot(),
      toasts: toastText(),
      storage: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
    });

  it('ids, names, wrong guesses and messages never reach the screen, the gate counts, the toasts or storage', () => {
    startRound({ ...SETUP, ending: 'timer' });
    IDS.forEach((id, i) => send(`wrongguess${i}`, id, { user: 'Shane_Fan', name: 'Ann Lee the Great', text: 'secret chat message' }));
    send('wrongguess9', IDS[0]);
    const mid = everything();
    for (const s of [...IDS, 'Shane_Fan', 'Ann Lee the Great', 'secret chat message', 'wrongguess']) expect(mid, s).not.toContain(s);
    endRound();
    closeRound();
    const after = everything();
    for (const s of [...IDS, 'Shane_Fan', 'secret chat message', 'wrongguess', 'elephant']) expect(after, s).not.toContain(s);
    expect(Object.keys(audience.snapshot().counts).sort()).toEqual(['byKind', 'cleared', 'expired', 'failed', 'kills', 'queued', 'ran', 'received', 'rejected'].sort());
  });

  it('the gate holds counts of the kind and never the guess', () => {
    startRound(SETUP);
    send('wrongguess', 'ann');
    expect(audience.snapshot().counts.byKind.guess).toBe(1);
    expect(JSON.stringify(audience.snapshot())).not.toContain('wrongguess');
  });

  it('only how long a round ran is remembered between runs, never a word, a guess or a name', () => {
    setChoice('guess.winnerName', 'show');
    startRound(SETUP);
    send('elephant', IDS[0], { name: 'Ann Lee' });
    endRound();
    closeRound();
    for (const [k, v] of Object.entries(localStorage).filter(([k]) => k.includes('guess'))) {
      expect(k).toBe('frameling.guess.v1');
      expect(v).not.toMatch(/elephant|Ann|998877665/);
    }
  });
});
