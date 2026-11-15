import { describe, expect, it } from 'vitest';
import { boardView, MISSING_WHY, pressPlan, promptView, whyNot, type CommandInfo, type ViewInput } from '../../src/streamboard/model';
import { defaultLayout, moveOnto } from '../../src/streamboard/layout';
import { QUIET, STOP_COMMAND, TILES, type Situation } from '../../src/streamboard/tiles';

const THEME = { dark: true, bg: '#000', panel: '#111', text: '#fff', muted: '#999', accent: '#90f', raised: '#222', line: '#333' };
const ok: CommandInfo = { exists: true, enabled: true };
const input = (over: Partial<ViewInput> = {}): ViewInput => ({ situation: QUIET, layout: defaultLayout(), info: () => ok, covers: true, hand: null, readId: null, obs: null, theme: THEME, ...over });

describe('why a button will not work', () => {
  it('says so when the command is not there', () => {
    expect(whyNot(undefined)).toBe(MISSING_WHY);
    expect(whyNot({ exists: false, enabled: false })).toBe(MISSING_WHY);
  });
  it('gives the command\'s own reason, or a plain fallback', () => {
    expect(whyNot({ exists: true, enabled: false, reason: 'Nothing is waiting.' })).toBe('Nothing is waiting.');
    expect(whyNot({ exists: true, enabled: false })).toBe('Not available right now.');
    expect(whyNot({ exists: true, enabled: false, reason: '  ' })).toBe('Not available right now.');
  });
  it('says nothing when it works', () => {
    expect(whyNot(ok)).toBe('');
  });
});

describe('the pulled prompt, covered by the same rules as the main window', () => {
  const hand = { id: 7, text: 'a very rude prompt' };
  it('leaves the words out while they are covered', () => {
    const p = promptView(hand, true, null)!;
    expect(p).toEqual({ id: 7, covered: true, text: null });
    expect(JSON.stringify(p)).not.toContain('rude');
  });
  it('stays covered when a different slip was the one read', () => {
    expect(promptView(hand, true, 3)!.text).toBeNull();
  });
  it('shows the words once that slip has been read', () => {
    expect(promptView(hand, true, 7)).toEqual({ id: 7, covered: false, text: 'a very rude prompt' });
  });
  it('shows the words plainly when the viewers only see the capture window', () => {
    expect(promptView(hand, false, null)).toEqual({ id: 7, covered: false, text: 'a very rude prompt' });
  });
  it('runs the words through the Stream-safe scrub', () => {
    expect(promptView(hand, false, null, (t) => t.toUpperCase())!.text).toBe('A VERY RUDE PROMPT');
  });
  it('is nothing when there is no prompt', () => {
    expect(promptView(null, true, null)).toBeNull();
  });
  it('the whole view carries no trace of a covered prompt', () => {
    const v = boardView(input({ hand, covers: true, situation: { ...QUIET, jarHand: true } }));
    expect(JSON.stringify(v)).not.toContain('rude');
  });
});

describe('what the board is told', () => {
  it('has a tile for each shown button, in the layout\'s order, with its own command', () => {
    const v = boardView(input());
    expect(v.tiles.map((t) => t.id)).toEqual(defaultLayout().shown);
    expect(v.tiles[0]).toMatchObject({ id: 'vote', command: 'votes.start', enabled: true, why: '' });
  });
  it('follows a rearranged layout', () => {
    const layout = moveOnto(defaultLayout(), 'safe', 'vote');
    expect(boardView(input({ layout })).tiles[0].id).toBe('safe');
    expect(boardView(input({ layout })).isDefault).toBe(false);
    expect(boardView(input()).isDefault).toBe(true);
  });
  it('lists put-away buttons in the tray, with their names', () => {
    const v = boardView(input());
    expect(v.tray.map((t) => t.id)).toEqual(TILES.filter((t) => !t.defaultOn).map((t) => t.id));
    expect(v.tray[0].name).toBeTruthy();
  });
  it('greys a button whose command cannot run, with the reason, and flags one with no command', () => {
    const v = boardView(input({ info: (c) => (c === 'audience.clearQueue' ? { exists: true, enabled: false, reason: 'Nothing is waiting.' } : c === 'dares.stop' ? undefined : ok) }));
    const by = (id: string) => v.tiles.find((t) => t.id === id)!;
    expect(by('queue')).toMatchObject({ enabled: false, why: 'Nothing is waiting.' });
    expect(by('dares')).toMatchObject({ enabled: false, why: MISSING_WHY });
    expect(by('vote').enabled).toBe(true);
  });
  it('carries the stop button\'s state apart from the tiles', () => {
    expect(boardView(input()).stop).toEqual({ label: 'Stop everything', why: '' });
    expect(boardView(input({ info: (c) => (c === STOP_COMMAND ? undefined : ok) })).stop.why).toBe(MISSING_WHY);
    expect(boardView(input()).tiles.some((t) => t.command === STOP_COMMAND)).toBe(false);
  });
  it('passes on the OBS word and the audience count (counts only)', () => {
    const v = boardView(input({ situation: { ...QUIET, audienceOn: true, waiting: 3 }, obs: { word: 'Live', colour: 'red' } }));
    expect(v.obs).toEqual({ word: 'Live', colour: 'red' });
    expect(v.audience).toEqual({ on: true, waiting: 3 });
  });
  it('makes buttons bigger as the size goes up', () => {
    const at = (size: number) => boardView(input({ layout: { ...defaultLayout(), size } })).minTile;
    expect(at(0)).toBeLessThan(at(1));
    expect(at(1)).toBeLessThan(at(3));
    expect(at(0)).toBeGreaterThanOrEqual(150);
  });
  it('can be sent over a message port as plain data', () => {
    const v = boardView(input({ hand: { id: 1, text: 'x' }, covers: false }));
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });
});

describe('pressing a button', () => {
  const s = (over: Partial<Situation> = {}): Situation => ({ ...QUIET, ...over });
  it('says why instead of doing nothing when the command is missing or greyed', () => {
    expect(pressPlan('queue', s(), undefined, 'front')).toEqual({ kind: 'say', say: MISSING_WHY });
    expect(pressPlan('queue', s(), { exists: true, enabled: false, reason: 'Nothing is waiting.' }, 'front')).toEqual({ kind: 'say', say: 'Nothing is waiting.' });
    expect(pressPlan('not-a-tile', s(), ok, 'front').kind).toBe('say');
  });
  it('runs a working command without moving windows', () => {
    expect(pressPlan('queue', s({ waiting: 2 }), ok, 'front')).toEqual({ kind: 'run', raise: false, ask: false });
  });
  it('brings the drawing window forward for a setup dialog, unless told to stay', () => {
    expect(pressPlan('vote', s(), ok, 'front')).toEqual({ kind: 'run', raise: true, ask: false });
    expect(pressPlan('vote', s(), ok, 'stay')).toEqual({ kind: 'run', raise: false, ask: false });
  });
  it('comes forward and asks the first time, so the question is seen', () => {
    expect(pressPlan('guess', s(), ok, undefined)).toEqual({ kind: 'run', raise: true, ask: true });
  });
  it('a button that does not open a setup dialog never asks the question', () => {
    expect(pressPlan('queue', s(), ok, undefined)).toEqual({ kind: 'run', raise: false, ask: false });
  });
  it('turning audience participation on for the first time comes forward whatever was chosen', () => {
    expect((pressPlan('audience', s({ asks: true }), ok, 'stay') as { raise: boolean }).raise).toBe(true);
    expect((pressPlan('audience', s({ asks: false }), ok, 'stay') as { raise: boolean }).raise).toBe(false);
    expect((pressPlan('audience', s({ asks: true, audienceOn: true }), ok, 'stay') as { raise: boolean }).raise).toBe(false);
  });
  it('ending a vote does not move any window', () => {
    expect(pressPlan('vote', s({ vote: 'open', voteTotal: 2 }), ok, 'front')).toEqual({ kind: 'run', raise: false, ask: false });
  });
});
