import { describe, expect, it } from 'vitest';
import { bringBack, DEFAULT_SIZE, defaultLayout, moveOnto, moveTo, nudge, putAway, readLayout, resize, sameLayout, SIZE_STEPS } from '../../src/streamboard/layout';
import { TILES } from '../../src/streamboard/tiles';

const known = [
  { id: 'a', defaultOn: true },
  { id: 'b', defaultOn: true },
  { id: 'c', defaultOn: true },
  { id: 'd', defaultOn: false },
];
const L = (shown: string[], hidden: string[] = [], size = DEFAULT_SIZE) => ({ shown, hidden, size });

describe('default layout', () => {
  it('shows the buttons that are on by default, in catalogue order, and puts the rest away', () => {
    const l = defaultLayout();
    expect(l.shown).toEqual(TILES.filter((t) => t.defaultOn).map((t) => t.id));
    expect(l.hidden).toEqual(TILES.filter((t) => !t.defaultOn).map((t) => t.id));
    expect(l.size).toBe(DEFAULT_SIZE);
  });
  it('holds every button exactly once', () => {
    const l = defaultLayout();
    expect([...l.shown, ...l.hidden].sort()).toEqual(TILES.map((t) => t.id).sort());
  });
});

describe('moving', () => {
  it('moveOnto puts the button in the target spot and shifts the rest along', () => {
    expect(moveOnto(L(['a', 'b', 'c']), 'c', 'a').shown).toEqual(['c', 'a', 'b']);
    expect(moveOnto(L(['a', 'b', 'c']), 'a', 'c').shown).toEqual(['b', 'c', 'a']);
  });
  it('moving onto itself or onto something that is not shown changes nothing', () => {
    const l = L(['a', 'b'], ['c']);
    expect(moveOnto(l, 'a', 'a')).toBe(l);
    expect(moveOnto(l, 'a', 'c')).toBe(l);
  });
  it('moveTo clamps to the ends and ignores unknown buttons', () => {
    expect(moveTo(L(['a', 'b', 'c']), 'a', 99).shown).toEqual(['b', 'c', 'a']);
    expect(moveTo(L(['a', 'b', 'c']), 'c', -5).shown).toEqual(['c', 'a', 'b']);
    const l = L(['a']);
    expect(moveTo(l, 'zzz', 0)).toBe(l);
  });
  it('nudge steps one place and stops at the ends', () => {
    expect(nudge(L(['a', 'b', 'c']), 'b', -1).shown).toEqual(['b', 'a', 'c']);
    expect(nudge(L(['a', 'b', 'c']), 'b', 1).shown).toEqual(['a', 'c', 'b']);
    const l = L(['a', 'b', 'c']);
    expect(nudge(l, 'a', -1)).toBe(l);
    expect(nudge(l, 'c', 1)).toBe(l);
    expect(nudge(l, 'zzz', 1)).toBe(l);
  });
  it('never loses or doubles a button', () => {
    let l = L(['a', 'b', 'c'], ['d']);
    for (const f of [(x: typeof l) => moveOnto(x, 'c', 'a'), (x: typeof l) => putAway(x, 'b'), (x: typeof l) => bringBack(x, 'd'), (x: typeof l) => nudge(x, 'a', -1), (x: typeof l) => moveTo(x, 'b', 1)]) {
      l = f(l);
      expect([...l.shown, ...l.hidden].sort()).toEqual(['a', 'b', 'c', 'd']);
    }
  });
});

describe('putting away and bringing back', () => {
  it('puts a button in the tray and brings it back at the end', () => {
    const away = putAway(L(['a', 'b', 'c']), 'b');
    expect(away.shown).toEqual(['a', 'c']);
    expect(away.hidden).toEqual(['b']);
    expect(bringBack(away, 'b').shown).toEqual(['a', 'c', 'b']);
    expect(bringBack(away, 'b').hidden).toEqual([]);
  });
  it('does nothing for a button that is not where it should be', () => {
    const l = L(['a'], ['b']);
    expect(putAway(l, 'b')).toBe(l);
    expect(bringBack(l, 'a')).toBe(l);
  });
  it('moving a put-away button onto the board brings it back', () => {
    const l = moveTo(L(['a', 'b'], ['c']), 'c', 1);
    expect(l.shown).toEqual(['a', 'c', 'b']);
    expect(l.hidden).toEqual([]);
  });
});

describe('size', () => {
  it('steps up and down and stops at the ends', () => {
    expect(resize(L([], [], 1), 1).size).toBe(2);
    expect(resize(L([], [], 1), -1).size).toBe(0);
    const small = L([], [], 0);
    expect(resize(small, -1)).toBe(small);
    const big = L([], [], SIZE_STEPS.length - 1);
    expect(resize(big, 1)).toBe(big);
  });
});

describe('reading a saved layout', () => {
  it('keeps a good one as it was', () => {
    expect(readLayout({ shown: ['c', 'a'], hidden: ['b', 'd'], size: 1 }, known)).toEqual(L(['c', 'a'], ['b', 'd'], 1));
  });
  it('gives the default for anything that is not a layout', () => {
    for (const bad of [null, undefined, 5, 'x', [], true]) expect(sameLayout(readLayout(bad, known), defaultLayout(known))).toBe(true);
  });
  it('drops buttons that no longer exist and repeats', () => {
    expect(readLayout({ shown: ['a', 'gone', 'a', 'b'], hidden: ['b', 'c', 'd'], size: 2 }, known)).toEqual(L(['a', 'b'], ['c', 'd'], 2));
  });
  it('adds a button this version made new: shown if on by default, otherwise put away', () => {
    expect(readLayout({ shown: ['b'], hidden: [], size: 2 }, known)).toEqual(L(['b', 'a', 'c'], ['d'], 2));
  });
  it('falls back on a bad size and ignores rubbish fields', () => {
    for (const size of [-1, 9, 1.5, '2', null, NaN]) expect(readLayout({ shown: ['a'], hidden: [], size }, known).size).toBe(DEFAULT_SIZE);
    expect(readLayout({ shown: 'a', hidden: { x: 1 } }, known).shown).toEqual(['a', 'b', 'c']);
  });
  it('a saved layout from the real catalogue reads back as itself', () => {
    const l = moveOnto(defaultLayout(), 'safe', 'vote');
    expect(readLayout(JSON.parse(JSON.stringify(l)))).toEqual(l);
  });
});
