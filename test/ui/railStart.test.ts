// Where the tool rail starts: wide enough for its longest built-in group name, worked out from the names. Pure, no page.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GROUPS, OTHER_GROUP } from '../../src/ui/toolArrange';
// drawingMode pulls in the store, so the words are checked against it by name only.
import { sideWord, SIDES } from '../../src/ui/drawingMode';
import {
  builtinGroupNames,
  buttonsRailWidth,
  SIDE_WORDS,
  SWITCH_FONT,
  SWITCH_FRAME,
  switchRoom,
  switchWordWidth,
  chosenRailWidth,
  fitRailWidth,
  HEAD_FONT,
  HEAD_SIDES,
  nameRoom,
  nameRoomTwoLines,
  nameTextWidth,
  naturalRailWidth,
  railSizes,
  railWidthNow,
  RAIL_MAX,
  RAIL_SCROLLBAR,
  RAIL_START_MAX,
  startingNamesRoom,
  widestNameRoom,
} from '../../src/ui/toolRailWidth';

// Each name's width measured on screen (Nunito, 10px, weight 800, capitals, letter-spacing 0.06em), as the real rail drew it.
const MEASURED: Record<string, number> = {
  Draw: 35.06,
  Colour: 45.86,
  Shapes: 44.34,
  'Select and pen': 94.31,
  'Pen and edit': 78.89,
  'Rig and motion': 95.22,
  View: 29.89,
  'Pixel tools': 71.47,
  Other: 37.67,
  'Colour and pixel extras': 155.34,
};

const looks = ['cosy', 'crisp'] as const;
const sizes = ['small', 'medium', 'large'] as const;

describe('how wide a name is', () => {
  it('is never less than what the real rail measured, and not much more (so the rail is not wider than it needs)', () => {
    for (const [name, px] of Object.entries(MEASURED)) {
      const guess = nameTextWidth(name);
      expect(guess, name).toBeGreaterThanOrEqual(px);
      expect(guess, name).toBeLessThanOrEqual(Math.ceil(px * 1.06));
    }
  });
  it('does not care about case, and counts what it does not know as wide', () => {
    expect(nameTextWidth('rig and motion')).toBe(nameTextWidth('RIG AND MOTION'));
    expect(nameTextWidth('日本')).toBeGreaterThan(nameTextWidth('ab'));
    expect(nameTextWidth('')).toBe(0);
  });
  it('adds the room either side of the words', () => {
    expect(nameRoom('Draw')).toBe(nameTextWidth('Draw') + HEAD_SIDES);
  });
  it('keeps the numbers in step with the stylesheet', () => {
    const css = readFileSync('src/ui/ui.css', 'utf8');
    const head = css.match(/\n\.ui-tool-head \{([^}]*)\}/)?.[1] ?? '';
    expect(head).toMatch(new RegExp(`font-size: ${HEAD_FONT}px`));
    expect(head).toMatch(/font-weight: 800/);
    expect(head).toMatch(/letter-spacing: 0\.06em/);
    expect(head).toMatch(new RegExp(`padding: 3px ${HEAD_SIDES / 2}px 1px`));
    expect(css).toMatch(/\.ui-app \* \{\s*scrollbar-width: thin;/);
  });
});

describe('two lines', () => {
  it('a name of two or more words needs less room when it may take two lines', () => {
    expect(nameRoomTwoLines('Rig and motion')).toBeLessThan(nameRoom('Rig and motion'));
    expect(nameRoomTwoLines('Colour and pixel extras')).toBeLessThan(nameRoom('Colour and pixel extras') - 40);
  });
  it('splits where the lines come out most even, and never inside a word', () => {
    // RIG AND / MOTION or RIG / AND MOTION: the better of the two.
    const best = Math.min(Math.max(nameTextWidth('Rig and'), nameTextWidth('motion')), Math.max(nameTextWidth('Rig'), nameTextWidth('and motion')));
    expect(nameRoomTwoLines('Rig and motion')).toBe(best + HEAD_SIDES);
  });
  it('one word is one line, and never needs less than its longest word', () => {
    expect(nameRoomTwoLines('Colour')).toBe(nameRoom('Colour'));
    expect(nameRoomTwoLines('Supercalifragilistic words')).toBeGreaterThanOrEqual(nameRoom('Supercalifragilistic'));
    expect(nameRoomTwoLines('   ')).toBe(nameRoom('   '));
  });
});

describe('the names a rail starts with', () => {
  it('are the built-in groups, Other, and the Pixel workspace\'s own', () => {
    const names = builtinGroupNames();
    for (const g of DEFAULT_GROUPS) expect(names).toContain(g.name);
    expect(names).toContain(OTHER_GROUP.name);
    expect(names).toContain('Pixel tools');
    expect(new Set(names).size).toBe(names.length);
  });
  it('are short enough that none is much longer than a button row wants', () => {
    for (const n of builtinGroupNames()) expect(n.length, n).toBeLessThanOrEqual(16);
  });
});

describe('where it starts', () => {
  it('is worked out from the longest name: a longer name makes it wider, a shorter list narrower', () => {
    const now = widestNameRoom();
    expect(now).toBe(Math.max(...builtinGroupNames().map(nameRoom)));
    expect(widestNameRoom([...builtinGroupNames(), 'A name that is much longer than the rest']))
      .toBeGreaterThan(now);
    expect(widestNameRoom(['Draw', 'View'])).toBeLessThan(now);
    expect(widestNameRoom([])).toBe(0);
  });
  it('has room for the longest built-in name on one line, and for the scrollbar a short window adds', () => {
    expect(startingNamesRoom()).toBe(widestNameRoom() + RAIL_SCROLLBAR);
    for (const n of builtinGroupNames()) expect(startingNamesRoom() - RAIL_SCROLLBAR, n).toBeGreaterThanOrEqual(nameRoom(n));
  });
  it('stays well short of the widest the rail goes, so a name of your own still has room to grow', () => {
    expect(startingNamesRoom()).toBeLessThanOrEqual(RAIL_START_MAX);
    expect(RAIL_START_MAX).toBeLessThan(RAIL_MAX / 1.5);
  });
  it('is the same at every look and tool size, and never narrower than the buttons alone', () => {
    for (const look of looks) {
      for (const size of sizes) {
        const s = railSizes(look, size);
        expect(naturalRailWidth(s, 'two', true), `${look} ${size}`).toBe(Math.max(s.tool * 2 + s.pad, startingNamesRoom(), switchRoom(s.look)));
        expect(naturalRailWidth(s, 'two', true)).toBeGreaterThanOrEqual(naturalRailWidth(s, 'two'));
      }
    }
  });
  it('fits every built-in name on one line at every look and tool size', () => {
    for (const look of looks) {
      for (const size of sizes) {
        const room = naturalRailWidth(railSizes(look, size), 'two', true) - RAIL_SCROLLBAR;
        for (const n of builtinGroupNames()) expect(room, `${look} ${size} ${n}`).toBeGreaterThanOrEqual(nameRoom(n));
      }
    }
  });
  it('is the buttons or the switch, whichever is wider, with the names off; the one-per-group rail has no room for a name', () => {
    for (const look of looks) {
      for (const size of sizes) {
        const s = railSizes(look, size);
        expect(naturalRailWidth(s, 'two', false)).toBe(Math.max(s.tool * 2 + s.pad, switchRoom(s.look)));
        expect(naturalRailWidth(s, 'two', false)).toBeGreaterThanOrEqual(switchRoom(s.look));
        expect(buttonsRailWidth(s, 'two')).toBe(s.tool * 2 + s.pad);
        expect(naturalRailWidth(s, 'stacked', true)).toBe(naturalRailWidth(s, 'stacked'));
      }
    }
  });
  it('is a whole number of pixels', () => {
    for (const look of looks) for (const size of sizes) expect(Number.isInteger(naturalRailWidth(railSizes(look, size), 'two', true))).toBe(true);
  });
});

describe('the starting width and a saved one', () => {
  const s = railSizes('cosy', 'medium');
  const start = naturalRailWidth(s, 'two', true);
  it('no saved width is the starting width; a saved one is held to the limits', () => {
    expect(railWidthNow(undefined, s, 'two', true)).toBe(start);
    expect(railWidthNow(undefined, s, 'two')).toBe(naturalRailWidth(s, 'two'));
    expect(railWidthNow(100, s, 'two', true)).toBe(100);
    expect(railWidthNow(9999, s, 'two', true)).toBe(RAIL_MAX);
  });
  it('a width equal to the starting one is kept as "no width", so the rail goes on following its names and sizes', () => {
    expect(chosenRailWidth(start, s, 'two', true)).toBeUndefined();
    expect(chosenRailWidth(94, s, 'two', true)).toBe(94);
    expect(chosenRailWidth(naturalRailWidth(s, 'two'), s, 'two')).toBeUndefined();
  });
  it('fitting the names never goes under the starting width', () => {
    expect(fitRailWidth(40, s, 'two', true)).toBe(start);
    expect(fitRailWidth(start + 30, s, 'two', true)).toBe(start + 30);
    expect(fitRailWidth(40, s, 'two')).toBe(naturalRailWidth(s, 'two'));
  });
});

// The words on the Pixels | Vectors switch, measured on screen (12px, weight 800, in each look's own font), as the real switch drew them.
const SWITCH_MEASURED: Record<'cosy' | 'crisp', Record<string, number>> = {
  cosy: { Pixels: 34.17, Vectors: 42.95 },
  crisp: { Pixels: 35.61, Vectors: 46.63 },
};

describe('the Pixels | Vectors switch', () => {
  it('has the words the switch says, and only those', () => {
    expect(SIDES.map(sideWord)).toEqual(Object.values(SIDE_WORDS));
    for (const look of looks) expect(Object.values(SIDE_WORDS).sort()).toEqual(Object.keys(SWITCH_MEASURED[look]).sort());
  });
  it('knows each word to be never less than the real switch drew it, and not much more, in both looks', () => {
    for (const look of looks) {
      for (const [word, px] of Object.entries(SWITCH_MEASURED[look])) {
        expect(switchWordWidth(word, look), `${look} ${word}`).toBeGreaterThanOrEqual(px);
        expect(switchWordWidth(word, look), `${look} ${word}`).toBeLessThanOrEqual(Math.ceil(px * 1.06));
      }
    }
    expect(switchWordWidth('日本', 'cosy')).toBeGreaterThan(switchWordWidth('Pi', 'cosy'));
  });
  it('needs the wider word twice, plus the frame round it and the scrollbar a short window adds', () => {
    for (const look of looks) {
      expect(switchRoom(look)).toBe(2 * switchWordWidth('Vectors', look) + SWITCH_FRAME + RAIL_SCROLLBAR);
      expect(switchWordWidth('Vectors', look)).toBeGreaterThan(switchWordWidth('Pixels', look));
    }
  });
  it('is wider in the crisp look, whose font is wider', () => {
    expect(switchRoom('crisp')).toBeGreaterThan(switchRoom('cosy'));
  });
  it('keeps the frame in step with the stylesheet', () => {
    const css = readFileSync('src/ui/ui.css', 'utf8');
    const box = css.match(/\n\.ui-tool-switch \{([^}]*)\}/)?.[1] ?? '';
    const side = css.match(/\n\.ui-tool-side \{([^}]*)\}/)?.[1] ?? '';
    expect(box).toMatch(/width: calc\(100% - 8px\)/);
    expect(box).toMatch(/margin: 2px 4px 4px/);
    expect(box).toMatch(/padding: 2px;/);
    expect(box).toMatch(/border: 1px solid/);
    expect(box).toMatch(/gap: 2px/);
    expect(side).toMatch(/padding: 4px 2px/);
    expect(side).toMatch(/flex: 1 1 0/);
    expect(side).toMatch(/font-size: var\(--fs-small\)/);
    expect(side).toMatch(/font-weight: 800/);
    expect(readFileSync('src/renderer/theme.css', 'utf8')).toMatch(new RegExp(`--fs-small: ${SWITCH_FONT}px`));
    // 8 (margin) + 4 (padding) + 2 (border) + 2 (gap) + 8 (button padding).
    expect(SWITCH_FRAME).toBe(8 + 4 + 2 + 2 + 8);
  });
  it('is no wider than the group names already want in the cosy look, so a rail with names showing does not grow for it', () => {
    expect(switchRoom('cosy')).toBeLessThanOrEqual(startingNamesRoom());
  });
  it('lets the natural width of every look and size hold both words whole, names showing or not', () => {
    for (const look of looks) {
      for (const size of sizes) {
        const s = railSizes(look, size);
        for (const names of [true, false]) expect(naturalRailWidth(s, 'two', names), `${look} ${size} ${names}`).toBeGreaterThanOrEqual(switchRoom(look));
      }
    }
  });
  it('is left out of the one-per-group rail, which shows the switch as two icons', () => {
    for (const look of looks) for (const size of sizes) expect(naturalRailWidth(railSizes(look, size), 'stacked')).toBeLessThan(switchRoom(look));
  });
});
