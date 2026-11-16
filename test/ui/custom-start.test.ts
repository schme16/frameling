// @vitest-environment jsdom
// The Custom starter: sizes kept per mode, animation as a tick, last settings remembered (but not the name), favourites.
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetChoicesForTests, setChoice } from '../../src/core/choices';
import {
  _resetFavouritesForTests, addFavourite, cleanFavouriteName, CUSTOM_START_CHOICE, customStart, docFromFavourite, favouriteKind, favouriteSize, favourites, MAX_FAVOURITES,
  MAX_FAVOURITE_NAME, moveFavourite, removeFavourite, removeFavouriteKept, renameFavourite, rememberCustom, restoreFavourite, sanitizeFavourites, saveFavourite, specOfFavourite, suggestedName,
  uniqueFavouriteName, type Favourite,
} from '../../src/ui/favourites';
import { cleanSpec, DEFAULT_CUSTOM, docFromCustom, rememberable, setPixelMode, startingSpec, startLength, type CustomSpec } from '../../src/ui/presets';

const spec = (over: Partial<CustomSpec> = {}): CustomSpec => ({ ...DEFAULT_CUSTOM, ...over });

describe('Pixel art keeps a size for each mode', () => {
  it('gives the usual size the first time in each mode', () => {
    const p = setPixelMode(spec(), true);
    expect([p.pixel, p.width, p.height]).toEqual([true, 64, 64]);
  });

  it('a tick and an untick leaves your typed size exactly where it was', () => {
    const typed = spec({ width: 1920, height: 1080 });
    const back = setPixelMode(setPixelMode(typed, true), false);
    expect([back.pixel, back.width, back.height]).toEqual([false, 1920, 1080]);
  });

  it('keeps the pixel size you typed through a trip back to vector', () => {
    let s = setPixelMode(spec({ width: 1920, height: 1080 }), true);
    s = { ...s, width: 32, height: 48 };
    s = setPixelMode(setPixelMode(s, false), true);
    expect([s.width, s.height]).toEqual([32, 48]);
  });

  it('does nothing when the mode is already that', () => {
    const s = spec();
    expect(setPixelMode(s, false)).toBe(s);
  });

  it('keeps an empty box (0) as it was rather than inventing a size', () => {
    const back = setPixelMode(setPixelMode(spec({ width: 0, height: 700 }), true), false);
    expect([back.width, back.height]).toEqual([0, 700]);
  });
});

describe('animation is a tick', () => {
  it('off: one picture, whatever the frame rate says', () => {
    const d = docFromCustom(spec({ fps: 30, animate: false }));
    expect(d.length).toBe(1);
    expect(d.fps).toBe(12);
  });

  it('on: the usual frames at the frame rate you typed', () => {
    const d = docFromCustom(spec({ fps: 30, animate: true }));
    expect(d.length).toBe(24);
    expect(d.fps).toBe(30);
  });

  it('pixel art: one picture off, four frames to play with on, like the pixel chooser', () => {
    expect(startLength({ pixel: true, animate: false })).toBe(1);
    expect(startLength({ pixel: true, animate: true })).toBe(4);
    expect(docFromCustom(spec({ pixel: true, width: 16, height: 16, animate: true })).length).toBe(4);
  });

  it('a spec without the field works the way Custom did before the tick', () => {
    const { animate: _a, ...old } = spec();
    expect(startLength({ ...old })).toBeUndefined();
    expect(startLength({ ...old, pixel: true })).toBe(1);
    expect(docFromCustom({ ...old, width: 100, height: 100 }).length).toBe(24);
  });

  it('a frame rate typed and then hidden comes back when you tick again (the spec keeps it)', () => {
    const s = spec({ fps: 24, animate: true });
    const hidden = { ...s, animate: false };
    expect({ ...hidden, animate: true }.fps).toBe(24);
  });
});

describe('reading a saved spec', () => {
  it('falls back to the first-time values for anything odd', () => {
    const c = cleanSpec({ width: 'wide', height: NaN, fps: null, pixel: 'yes', pixelSize: {}, animate: 1 });
    expect(c).toMatchObject({ width: 800, height: 600, fps: 12, pixel: false, pixelSize: 8, animate: false });
    expect(cleanSpec(null)).toMatchObject({ width: 800, height: 600 });
  });

  it('holds sizes to their limits, by mode', () => {
    expect(cleanSpec({ width: 99999, height: -4 })).toMatchObject({ width: 8192, height: 1 });
    expect(cleanSpec({ pixel: true, width: 99999, height: 3 })).toMatchObject({ width: 512, height: 3 });
    expect(cleanSpec({ fps: 900 }).fps).toBe(60);
  });

  it('keeps the size from the other mode, and the dpi when it is not the usual', () => {
    const c = cleanSpec({ width: 1920, height: 1080, away: { width: 32, height: 32 }, dpi: 300 });
    expect(c.away).toEqual({ width: 32, height: 32 });
    expect(c.dpi).toBe(300);
    expect(cleanSpec({ dpi: 96 }).dpi).toBeUndefined();
  });

  it('starts from the last settings but always names the drawing Untitled', () => {
    const s = startingSpec({ name: 'Hero', width: 1920, height: 1080, fps: 24, animate: true });
    expect(s.name).toBe('Untitled');
    expect([s.width, s.height, s.fps, s.animate]).toEqual([1920, 1080, 24, true]);
    expect(startingSpec(null)).toEqual(DEFAULT_CUSTOM);
  });

  it('what is kept for next time has no name', () => {
    expect('name' in rememberable(spec({ name: 'Hero' }))).toBe(false);
  });
});

describe('favourite names', () => {
  it('are tidied and cut to length', () => {
    expect(cleanFavouriteName('  Film   1080  ')).toBe('Film 1080');
    expect(cleanFavouriteName('x'.repeat(100))).toHaveLength(MAX_FAVOURITE_NAME);
    expect(cleanFavouriteName(7)).toBe('');
  });

  it('never replace one you have: a number goes after, capitals ignored', () => {
    expect(uniqueFavouriteName('Film', ['film'])).toBe('Film 2');
    expect(uniqueFavouriteName('Film', ['Film', 'Film 2'])).toBe('Film 3');
    expect(uniqueFavouriteName('', [])).toBe('My starter');
  });

  it('are suggested from the settings', () => {
    expect(suggestedName(spec({ width: 1920, height: 1080 }))).toBe('1920 x 1080');
    expect(suggestedName(spec({ width: 1920, height: 1080, animate: true, fps: 24 }))).toBe('1920 x 1080, 24 fps');
    expect(suggestedName(spec({ pixel: true, width: 32, height: 32, animate: true }))).toBe('Pixel 32 x 32 animation');
  });
});

describe('the favourites list', () => {
  const make = (names: string[]): Favourite[] => names.reduce<Favourite[]>((l, n, i) => addFavourite(l, n, spec(), `id${i}`)!.list, []);

  it('adds to the end, and the animation setting comes with it', () => {
    const r = addFavourite([], 'Film', spec({ width: 1920, height: 1080, fps: 24, animate: true }), 'a')!;
    expect(r.favourite.spec).toMatchObject({ width: 1920, height: 1080, fps: 24, animate: true });
    expect(favouriteKind(r.favourite)).toBe('Drawing, 24 frames a second');
    expect(favouriteKind(addFavourite([], 'Still', spec(), 'b')!.favourite)).toBe('Drawing, one picture');
  });

  it('does not keep the size of the other mode, or the name of the drawing', () => {
    const r = addFavourite([], 'X', spec({ away: { width: 9, height: 9 } }), 'a')!;
    expect('away' in r.favourite.spec).toBe(false);
    expect(specOfFavourite(r.favourite).name).toBe('Untitled');
  });

  it('is full at the limit', () => {
    const full = make(Array.from({ length: MAX_FAVOURITES }, (_, i) => `F${i}`));
    expect(full).toHaveLength(MAX_FAVOURITES);
    expect(addFavourite(full, 'One more', spec(), 'z')).toBeNull();
  });

  it('renames, keeping names unique, and ignores an empty name', () => {
    const l = make(['A', 'B']);
    expect(renameFavourite(l, 'id1', 'A').map((f) => f.name)).toEqual(['A', 'A 2']);
    expect(renameFavourite(l, 'id1', 'B').map((f) => f.name)).toEqual(['A', 'B']);
    expect(renameFavourite(l, 'id1', '   ').map((f) => f.name)).toEqual(['A', 'B']);
  });

  it('moves one place at a time and stops at the ends', () => {
    const l = make(['A', 'B', 'C']);
    expect(moveFavourite(l, 'id2', -1).map((f) => f.name)).toEqual(['A', 'C', 'B']);
    expect(moveFavourite(l, 'id0', -1).map((f) => f.name)).toEqual(['A', 'B', 'C']);
    expect(moveFavourite(l, 'id2', 1).map((f) => f.name)).toEqual(['A', 'B', 'C']);
    expect(moveFavourite(l, 'nope', 1)).toEqual(l);
  });

  it('removes, and Undo puts it back in the same place', () => {
    const l = make(['A', 'B', 'C']);
    const gone = removeFavourite(l, 'id1');
    expect(gone.map((f) => f.name)).toEqual(['A', 'C']);
    expect(restoreFavourite(gone, l[1], 1).map((f) => f.name)).toEqual(['A', 'B', 'C']);
    expect(restoreFavourite(l, l[1], 0)).toEqual(l);
  });

  it('reads a damaged list without throwing: bad entries out, duplicate names and ids fixed', () => {
    const raw = [null, 5, { name: 'No spec' }, { id: 'a', name: 'Film', spec: { width: 1920, height: 1080 } }, { id: 'a', name: 'film', spec: {} }, { name: '', spec: { pixel: true, width: 16, height: 16 } }];
    const l = sanitizeFavourites(raw);
    expect(l.map((f) => f.name)).toEqual(['Film', 'film 2', 'Pixel 16 x 16']);
    expect(new Set(l.map((f) => f.id)).size).toBe(3);
    expect(sanitizeFavourites('nope')).toEqual([]);
    expect(sanitizeFavourites(Array.from({ length: 40 }, (_, i) => ({ name: `n${i}`, spec: {} })))).toHaveLength(MAX_FAVOURITES);
  });

  it('makes a drawing the way Custom would', () => {
    const f = addFavourite([], 'Film', spec({ width: 1920, height: 1080, fps: 24, animate: true }), 'a')!.favourite;
    const d = docFromFavourite(f);
    expect([d.name, d.width, d.height, d.fps, d.length]).toEqual(['Untitled', 1920, 1080, 24, 24]);
  });

  it('labels the size in the unit you use', () => {
    const f = addFavourite([], 'Film', spec({ width: 1920, height: 1080 }), 'a')!.favourite;
    expect(favouriteSize(f, 'px')).toBe('1920 x 1080');
    const px = addFavourite([], 'P', spec({ pixel: true, width: 32, height: 16 }), 'b')!.favourite;
    expect(favouriteSize(px, 'mm')).toBe('32 x 16 pixels');
  });
});

describe('what is kept between visits', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetChoicesForTests();
    _resetFavouritesForTests();
  });

  it('starts from the first-time settings until something has been used', () => {
    expect(customStart()).toEqual(DEFAULT_CUSTOM);
  });

  it('remembers the settings, never the name', () => {
    rememberCustom(spec({ name: 'Hero', width: 1920, height: 1080, fps: 24, animate: true, away: { width: 32, height: 32 } }));
    const s = customStart();
    expect(s.name).toBe('Untitled');
    expect([s.width, s.height, s.fps, s.animate, s.away]).toEqual([1920, 1080, 24, true, { width: 32, height: 32 }]);
  });

  it('starts fresh when Preferences says so, and still keeps favourites', () => {
    rememberCustom(spec({ width: 1920, height: 1080 }));
    saveFavourite('Film', spec({ width: 1920, height: 1080 }));
    setChoice(CUSTOM_START_CHOICE, 'fresh');
    expect(customStart()).toEqual(DEFAULT_CUSTOM);
    expect(favourites()).toHaveLength(1);
  });

  it('saves favourites to storage and finds them again', () => {
    const f = saveFavourite('Film', spec({ width: 1920, height: 1080, fps: 24, animate: true }))!;
    expect(JSON.parse(localStorage.getItem('frameling.newDrawing.v1')!).favourites[0]).toMatchObject({ id: f.id, name: 'Film' });
    expect(saveFavourite('Film', spec())!.name).toBe('Film 2');
  });

  it('a removed favourite comes back with Undo', () => {
    saveFavourite('A', spec());
    const b = saveFavourite('B', spec())!;
    saveFavourite('C', spec());
    const undo = removeFavouriteKept(b.id)!;
    expect(favourites().map((f) => f.name)).toEqual(['A', 'C']);
    undo();
    expect(favourites().map((f) => f.name)).toEqual(['A', 'B', 'C']);
    expect(removeFavouriteKept('nope')).toBeNull();
  });
});
