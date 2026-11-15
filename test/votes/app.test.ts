// @vitest-environment jsdom
// Chat votes in the app, on the real audience gate: the action is on the list and view-only, one vote each, a bad option
// is turned away, the counts are right, a vote ends by hand or by its clock, NOTHING reaches the drawing, and nothing
// that identifies a voter is left behind.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { newDoc } from '../../src/core/doc';
import { audience, installAudience, setAudienceDrawing, setAudienceOn, submitAudience } from '../../src/audience';
import { _resetFeaturesForTests, isFeatureOn, registerFeatures, setFeatureOn } from '../../src/features/host';
import { streamDoorFeature } from '../../src/streamdoor';
import { votesFeature } from '../../src/votes';
import { VOTE_ACTION } from '../../src/votes/actions';
import { _resetVotesForTests, closeVote, endVote, flushVotes, startVote, voteScreen } from '../../src/votes/state';
import { clearToasts, toasts } from '../../src/ui/toast';
import { resolveMenus, type MenuItem } from '../../src/ui/menus';

installAudience();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cast = (option: unknown, voter?: unknown, extra: object = {}) => submitAudience(VOTE_ACTION, voter === undefined ? { option, ...extra } : { option, voter, ...extra });
const SETUP = { question: 'Which colour next?', options: ['Red', 'Blue', 'Green'], seconds: null };
const view = () => {
  flushVotes();
  const s = voteScreen.get();
  if (s.phase === 'none') throw new Error('no vote on screen');
  return s;
};

let clock = 5_000_000_000;
beforeAll(() => {
  setChoiceAsker(null);
  _resetFeaturesForTests();
  registerFeatures([streamDoorFeature, votesFeature]);
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: (clock += 10_000_000) });
  setChoice('votes.again', undefined);
  setChoice('votes.noId', undefined);
  setChoice('audience.strictness', 'balanced');
  audience.kill();
  audience.resetCounts();
  _resetVotesForTests();
  clearToasts();
  setAudienceDrawing(false);
  setAudienceOn(true);
});
afterEach(() => {
  closeVote();
  vi.useRealTimers();
});
afterAll(() => setAudienceOn(false));

describe('registered', () => {
  it('is a switchable feature that needs the door, with commands, help with media and a menu home', () => {
    expect(isFeatureOn('stream-votes')).toBe(true);
    expect(votesFeature.requires).toEqual(['stream-door']);
    for (const id of ['votes.start', 'votes.end', 'votes.close']) {
      const c = getCommand(id)!;
      expect(c, id).toBeTruthy();
      expect(c.category).toBe('Audience');
      expect(getHelp(c.help!), id).toBeTruthy();
    }
    expect(getCommand('votes.start')!.keys).toEqual(['Mod+Alt+Y']);
    expect(getHelp('votes')!.media).toBe('votes.mp4');
    expect(votesFeature.menus![0].menu).toBe('sub:votes');
    const find = (items: MenuItem[]): string[] => items.flatMap((it) => (it.kind === 'submenu' ? find(it.items) : it.kind === 'command' ? [it.command.id] : []));
    const ids = find(resolveMenus().flatMap((m) => m.items));
    for (const id of ['votes.start', 'votes.end', 'votes.close']) expect(ids, id).toContain(id);
  });

  it('puts one action on the gate: view-only, which the door lists as available even with the drawing switch off', () => {
    const a = audience.snapshot().actions.find((x) => x.id === VOTE_ACTION)!;
    expect(a).toBeTruthy();
    expect(a.touchesDrawing).toBe(false);
    expect(a.available).toBe(true);
    expect(a.kind).toBe('vote');
    expect(audience.snapshot().actions.filter((x) => x.id.startsWith('vote.'))).toHaveLength(1);
  });

  it('goes with the feature: no action, no commands, and a vote that was going is dropped', () => {
    startVote(SETUP);
    setFeatureOn('stream-votes', false);
    expect(audience.snapshot().actions.some((a) => a.id === VOTE_ACTION)).toBe(false);
    expect(getCommand('votes.start')).toBeUndefined();
    expect(voteScreen.get().phase).toBe('none');
    expect(submitAudience(VOTE_ACTION, { option: 1, voter: 'a' })).toEqual({ ok: false, reason: 'unknown' });
    setFeatureOn('stream-votes', true);
    expect(audience.snapshot().actions.some((a) => a.id === VOTE_ACTION)).toBe(true);
  });
});

describe('running a vote', () => {
  it('counts votes live, then ends with a winner', () => {
    expect(startVote(SETUP)).toEqual({ ok: true });
    expect(view().phase).toBe('open');
    for (let i = 0; i < 5; i++) expect(cast(2, `v${i}`)).toEqual({ ok: true, outcome: 'ran' });
    for (let i = 5; i < 8; i++) cast(1, `v${i}`);
    const v = view().view;
    expect(v.counts).toEqual([3, 5, 0]);
    expect(v.total).toBe(8);
    endVote();
    const r = view();
    expect(r.phase).toBe('result');
    expect(r.view.outcome).toEqual({ kind: 'winner', index: 1 });
    expect(r.view.counts).toEqual([3, 5, 0]);
  });

  it('shows a tie as a tie and no votes as none', () => {
    startVote(SETUP);
    cast(1, 'a');
    cast(2, 'b');
    endVote();
    expect(view().view.outcome).toEqual({ kind: 'tie', indices: [0, 1] });
    closeVote();
    startVote(SETUP);
    endVote();
    expect(view().view.outcome).toEqual({ kind: 'none' });
  });

  it('takes the first vote from each person; a second is turned away', () => {
    startVote(SETUP);
    expect(cast(1, 'ann').ok).toBe(true);
    expect(cast(2, 'ann')).toEqual({ ok: false, reason: 'invalid' });
    expect(cast(1, 'ann')).toEqual({ ok: false, reason: 'invalid' });
    expect(view().view.counts).toEqual([1, 0, 0]);
  });

  it('lets a person change their mind when that is the remembered choice', () => {
    setChoice('votes.again', 'latest');
    startVote(SETUP);
    cast(1, 'ann');
    expect(cast(3, 'ann').ok).toBe(true);
    expect(view().view.counts).toEqual([0, 0, 1]);
    expect(view().view.total).toBe(1);
  });

  it('turns away an option that does not exist, by place or by words', () => {
    startVote(SETUP);
    for (const bad of [0, 4, 99, -1, 'purple', '', null, { x: 1 }]) expect(cast(bad, 'ann'), String(bad)).toEqual({ ok: false, reason: 'invalid' });
    expect(view().view.total).toBe(0);
    expect(cast('blue', 'ann').ok).toBe(true);
    expect(view().view.counts).toEqual([0, 1, 0]);
  });

  it('turns away a vote with no voter id and counts how many, unless the choice says count them', () => {
    startVote(SETUP);
    expect(cast(1)).toEqual({ ok: false, reason: 'invalid' });
    expect(cast(1, '   ')).toEqual({ ok: false, reason: 'invalid' });
    expect(view().view.total).toBe(0);
    expect(view().view.turnedAway['no-voter']).toBe(2);
    setChoice('votes.noId', 'count');
    expect(cast(1).ok).toBe(true);
    expect(cast(1).ok).toBe(true);
    expect(view().view.counts[0]).toBe(2);
  });

  it('turns away votes when no vote is going, and after it ended', () => {
    expect(cast(1, 'ann')).toEqual({ ok: false, reason: 'invalid' });
    startVote(SETUP);
    endVote();
    expect(cast(1, 'ann')).toEqual({ ok: false, reason: 'invalid' });
    expect(view().view.total).toBe(0);
  });

  it('does not hold up a crowd: a hundred voters in a moment are all counted, whatever the strictness', () => {
    setChoice('audience.strictness', 'strict');
    startVote(SETUP);
    for (let i = 0; i < 100; i++) expect(cast((i % 3) + 1, `crowd${i}`).ok, String(i)).toBe(true);
    expect(view().view.total).toBe(100);
    expect(audience.snapshot().queue).toEqual([]);
  });

  it('ends by itself when its time is up', () => {
    startVote({ ...SETUP, seconds: 30 });
    cast(3, 'ann');
    vi.advanceTimersByTime(29_000);
    expect(view().phase).toBe('open');
    vi.advanceTimersByTime(1500);
    expect(view().phase).toBe('result');
    expect(view().view.outcome).toEqual({ kind: 'winner', index: 2 });
  });

  it('is one at a time, and says what to do', () => {
    startVote(SETUP);
    expect(startVote(SETUP)).toEqual({ ok: false, reason: expect.stringContaining('already going') });
    endVote();
    expect(startVote(SETUP)).toEqual({ ok: false, reason: expect.stringContaining('last result') });
    closeVote();
    expect(startVote(SETUP).ok).toBe(true);
    expect(startVote({ question: '', options: ['a', 'b'] }).ok).toBe(false);
  });

  it('Stop drops a vote that is going, and a result you are reading stays until you close it', () => {
    startVote(SETUP);
    cast(1, 'ann');
    audience.kill();
    expect(voteScreen.get().phase).toBe('none');
    setAudienceOn(true);
    startVote(SETUP);
    cast(1, 'ann');
    endVote();
    audience.kill();
    expect(voteScreen.get().phase).toBe('result');
  });

  it('the commands follow what is going', () => {
    expect(getCommand('votes.start')!.enabled!(store().get())).toBe(true);
    expect(getCommand('votes.end')!.enabled!(store().get())).toBe(false);
    startVote(SETUP);
    expect(getCommand('votes.start')!.enabled!(store().get())).toBe(false);
    expect(getCommand('votes.end')!.enabled!(store().get())).toBe(true);
    getCommand('votes.end')!.run();
    expect(voteScreen.get().phase).toBe('result');
    getCommand('votes.close')!.run();
    expect(voteScreen.get().phase).toBe('none');
  });
});

describe('nothing is applied', () => {
  it('a whole vote, with the drawing switch ON, leaves the document and its history exactly as they were', () => {
    store().load(newDoc({ width: 320, height: 200 }));
    setAudienceDrawing(true);
    const doc = store().get().doc;
    const history = store().historyIds();
    const ui = store().get().ui;
    startVote({ question: 'Which colour next?', options: ['#ff0000', '#0000ff', 'Green'], seconds: null });
    for (let i = 0; i < 31; i++) cast(i < 11 ? 1 : (i % 2) + 2, `p${i}`);
    endVote();
    expect(view().view.outcome.kind).not.toBe('none');
    closeVote();
    // The same object, not just an equal one: nothing was even replaced.
    expect(store().get().doc).toBe(doc);
    expect(store().get().ui).toBe(ui);
    expect(store().historyIds()).toEqual(history);
  });

  it('the action is registered with no way into the document: the gate gives it no edit', () => {
    let seen: unknown = 'unset';
    // The same gate, the same kind of registration the vote makes, to see what the gate hands such an action.
    const off = audience.registerAction({ id: 'probe.look', label: 'Probe', kind: 'probe', cooldown: 0, bulk: true, run: (_p, ctx) => void (seen = ctx.edit) });
    setAudienceDrawing(true);
    submitAudience('probe.look');
    off();
    expect(seen).toBeUndefined();
  });

  it('no file in src/votes imports the store, the document, the tools or an editing helper, or asks for an edit', () => {
    const dir = path.join(root, 'src/votes');
    const files = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, f).not.toMatch(/from ['"]\.\.\/(core\/(store|doc|format)|tools|canvas|timeline|io)\b/);
      expect(code, f).not.toMatch(/touchesDrawing|ctx\.edit|\.edit\(|store\(\)|\.update\(/);
    }
  });
});

describe('nothing identifying is left behind', () => {
  const IDS = ['998877665', 'night_owl_fan', 'Ann Lee'];
  const everything = () =>
    JSON.stringify({
      screen: voteScreen.get(),
      gate: audience.snapshot(),
      toasts: toasts.get().map((t) => t.message ?? t),
      storage: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
    });

  it('ids, names and messages in the body never reach the screen, the gate counts, the toasts or storage', () => {
    startVote(SETUP);
    IDS.forEach((id, i) => cast(i + 1, id, { user: 'Shane_Fan', displayName: 'Ann Lee the Great', text: 'secret chat message' }));
    cast(1, IDS[0]);
    const mid = everything();
    for (const s of [...IDS, 'Shane_Fan', 'Ann Lee the Great', 'secret chat message']) expect(mid, s).not.toContain(s);
    endVote();
    closeVote();
    const after = everything();
    for (const s of [...IDS, 'Shane_Fan', 'secret chat message', 'Which colour']) expect(after, s).not.toContain(s);
    // Counts only on the gate.
    expect(Object.keys(audience.snapshot().counts).sort()).toEqual(['byKind', 'cleared', 'expired', 'failed', 'kills', 'queued', 'ran', 'received', 'rejected'].sort());
  });

  it('only how long a vote ran is remembered between runs, never words or counts', () => {
    startVote(SETUP);
    cast(1, IDS[0]);
    endVote();
    closeVote();
    const mine = Object.entries(localStorage).filter(([k]) => k.includes('votes'));
    for (const [, v] of mine) {
      expect(v).not.toMatch(/Red|Blue|Which|colour/i);
    }
  });
});
