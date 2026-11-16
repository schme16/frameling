// What you have made, in his room: only real work of yours, an empty room when there is none, new work appearing by
// itself, and nothing ever taken away because time passed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { setStreamSafe } from '../../src/core/streamSafe';
import {
  addMade,
  kindOf,
  MADE_KEY,
  MAX_MADE,
  readMade,
  shownMade,
  SPRITE_MAX,
  toyOf,
  WALL_SLOTS,
  wallOf,
  type Made,
} from '../../src/quillpet/made';

const PIC = 'data:image/png;base64,AAAA';
const DAY = 86_400_000;
const make = (id: string, kind: Made['kind'], madeAt: number, name = id): Made => ({ id, name, kind, picture: PIC, madeAt });
const store = (value: unknown) => ({ getItem: () => (typeof value === 'string' ? value : JSON.stringify(value)) });

describe('what counts as a sprite', () => {
  it('is pixel art at sprite size; a vector drawing and a big pixel picture go on the wall', () => {
    expect(kindOf(newDoc({ width: 32, height: 32, pixel: { pixelSize: 1 } }))).toBe('sprite');
    expect(kindOf(newDoc({ width: SPRITE_MAX, height: 16, pixel: { pixelSize: 1 } }))).toBe('sprite');
    expect(kindOf(newDoc({ width: SPRITE_MAX + 1, height: 16, pixel: { pixelSize: 1 } }))).toBe('drawing');
    expect(kindOf(newDoc({ width: 32, height: 32 }))).toBe('drawing');
  });
});

describe('an empty room', () => {
  it('is what you get when you have made nothing: no wall, no toy', () => {
    expect(wallOf([])).toEqual([]);
    expect(toyOf([])).toBeUndefined();
  });

  it('is what you get from storage that is missing, broken, or holds something else', () => {
    expect(readMade(null)).toEqual([]);
    expect(readMade(store('not json'))).toEqual([]);
    expect(readMade(store({ not: 'a list' }))).toEqual([]);
    expect(readMade({ getItem: () => { throw new Error('no storage'); } })).toEqual([]);
  });

  it('never invents anything: a stored thing without a real picture is left out', () => {
    expect(readMade(store([{ id: 'a', picture: 'https://example.com/x.png' }, { id: 'b' }, null, 3]))).toEqual([]);
  });
});

describe('what is shown', () => {
  const list = [make('d1', 'drawing', 50), make('s1', 'sprite', 40), make('d2', 'drawing', 30), make('d3', 'drawing', 20), make('d4', 'drawing', 10), make('s2', 'sprite', 5)];

  it('puts your newest three drawings on the wall and your newest sprite on the floor', () => {
    expect(wallOf(list).map((m) => m.id)).toEqual(['d1', 'd2', 'd3']);
    expect(WALL_SLOTS).toBe(3);
    expect(toyOf(list)?.id).toBe('s1');
  });

  it('keeps sprites off the wall and drawings off the floor', () => {
    expect(wallOf(list).every((m) => m.kind === 'drawing')).toBe(true);
    expect(toyOf([make('d', 'drawing', 1)])).toBeUndefined();
  });
});

describe('new work appearing', () => {
  it('puts a newly saved drawing at the front of the wall', () => {
    const before = [make('a', 'drawing', 10), make('b', 'drawing', 5)];
    const after = addMade(before, make('c', 'drawing', 20));
    expect(wallOf(after).map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });

  it('takes a newly saved sprite as the toy', () => {
    const after = addMade([make('s1', 'sprite', 10)], make('s2', 'sprite', 20));
    expect(toyOf(after)?.id).toBe('s2');
  });

  it('saving the same drawing again freshens it rather than hanging a second copy', () => {
    const first = addMade([], make('a', 'drawing', 10));
    const again = addMade(first, { ...make('a', 'drawing', 20), picture: 'data:image/png;base64,BBBB' });
    expect(again).toHaveLength(1);
    expect(again[0].picture).toBe('data:image/png;base64,BBBB');
    expect(again[0].madeAt).toBe(20);
  });

  it('does not change the list it was given', () => {
    const before = [make('a', 'drawing', 10)];
    addMade(before, make('b', 'drawing', 20));
    expect(before).toHaveLength(1);
  });
});

describe('nothing is taken away when time passes', () => {
  it('keeps work from a year ago exactly as it was, however long you were gone', () => {
    const old = [make('a', 'drawing', 1_000), make('s', 'sprite', 2_000)];
    // Read back "a year later": reading never looks at the clock, so nothing ages out.
    const back = readMade(store(old));
    expect(back.map((m) => m.id).sort()).toEqual(['a', 's']);
    // And new work added a year on does not push them off.
    const later = addMade(back, make('new', 'drawing', 2_000 + 365 * DAY));
    expect(later.map((m) => m.id).sort()).toEqual(['a', 'new', 's']);
  });

  it('only ever rolls off the very oldest, and only past a large storage ceiling', () => {
    let list: Made[] = [];
    for (let i = 0; i < MAX_MADE; i++) list = addMade(list, make(`m${i}`, 'drawing', i + 1));
    expect(list).toHaveLength(MAX_MADE);
    expect(list.some((m) => m.id === 'm0')).toBe(true);
    list = addMade(list, make('one-more', 'drawing', MAX_MADE + 1));
    expect(list).toHaveLength(MAX_MADE);
    expect(list.some((m) => m.id === 'm0')).toBe(false);
    expect(list.some((m) => m.id === 'one-more')).toBe(true);
  });

  it('has the same key it saves under, so what was kept comes back', () => {
    expect(MADE_KEY).toBe('frameling.quill.made.v1');
  });
});

describe('stream-safe', () => {
  beforeEach(() => setStreamSafe(true));
  afterEach(() => setStreamSafe(false));

  it('swaps a name for a stand-in and leaves the picture blank', () => {
    const shown = shownMade([make('a', 'drawing', 2, 'Secret client logo'), make('b', 'drawing', 1, 'Birthday card')]);
    expect(shown.map((s) => s.name)).toEqual(['My drawing 1', 'My drawing 2']);
    expect(shown.every((s) => s.picture === undefined)).toBe(true);
    expect(JSON.stringify(shown.map((s) => ({ name: s.name, picture: s.picture })))).not.toMatch(/Secret|Birthday/);
  });

  it('is the real name and picture again when it is off', () => {
    setStreamSafe(false);
    const [one] = shownMade([make('a', 'drawing', 2, 'Birthday card')]);
    expect(one.name).toBe('Birthday card');
    expect(one.picture).toBe(PIC);
  });
});
