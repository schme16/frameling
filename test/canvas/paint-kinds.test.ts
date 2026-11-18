// The pure parts of the Colours panel's row of picture tiles and its opacity box.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIND_TILES, TILE_COLUMNS, clampPercent, nudgePercent, parsePercent, swatchesCount, swatchesWhere, tileColumns, tilesNarrowBelow, tileIsOn, tilePicture, tilesFor } from '../../src/canvas/paintKinds';

describe('the tiles', () => {
  it('are six, with None first, and each has a word, a tip and an id of its own', () => {
    expect(KIND_TILES.map((t) => t.id)).toEqual(['none', 'solid', 'linear', 'radial', 'angular', 'diamond']);
    expect(KIND_TILES.map((t) => t.label)).toEqual(['None', 'Solid', 'Linear', 'Radial', 'Angular', 'Diamond']);
    expect(new Set(KIND_TILES.map((t) => t.control)).size).toBe(6);
    for (const t of KIND_TILES) expect(t.title.length).toBeGreaterThan(5);
  });

  it('Paint, in the Pixel workspace, is never none, so it has five', () => {
    expect(tilesFor(true).map((t) => t.id)).toEqual(['solid', 'linear', 'radial', 'angular', 'diamond']);
    expect(tilesFor(false)).toHaveLength(6);
  });

  it('light exactly one: None for a box with nothing, else the kind, and none when the picked shapes differ', () => {
    const lit = (now: Parameters<typeof tileIsOn>[1]) => KIND_TILES.filter((t) => tileIsOn(t.id, now)).map((t) => t.id);
    expect(lit({ none: true, kind: 'solid' })).toEqual(['none']);
    expect(lit({ none: false, kind: 'solid' })).toEqual(['solid']);
    expect(lit({ none: false, kind: 'radial' })).toEqual(['radial']);
    expect(lit({ none: false, kind: '' })).toEqual([]);
  });

  it('are painted in the colour you have: flat for Solid, white blending into it for the rest', () => {
    expect(tilePicture('solid', '#ff5c8a')).toBe('linear-gradient(#ff5c8a, #ff5c8a)');
    expect(tilePicture('linear', '#ff5c8a')).toContain('linear-gradient');
    expect(tilePicture('linear', '#ff5c8a')).toContain('#ff5c8a');
    expect(tilePicture('radial', '#ff5c8a')).toContain('radial-gradient');
    expect(tilePicture('angular', '#ff5c8a')).toContain('conic-gradient');
    expect(tilePicture('diamond', '#ff5c8a')).toContain('to top left');
  });

  it('keep a see-through colour see-through', () => {
    expect(tilePicture('solid', '#ff5c8a80')).toContain('#ff5c8a80');
  });
});

describe('how many go on a line', () => {
  it('all six when there is room, three to a line when there is not, never one to a line', () => {
    expect(tilesNarrowBelow(6)).toBe(260);
    expect(tilesNarrowBelow(5)).toBe(216);
    expect(tileColumns(282, 6)).toBe(6);
    expect(tileColumns(260, 6)).toBe(6);
    expect(tileColumns(259, 6)).toBe(TILE_COLUMNS.narrow);
    // The narrowest docked panel (200 wide with its padding, so about 170 inside) and the smallest floated one.
    for (const w of [170, 176, 190, 208]) expect(tileColumns(w, 6)).toBe(3);
  });

  it('five tiles (the Pixel workspace) fit on one line in a narrower panel than six', () => {
    expect(tileColumns(256, 5)).toBe(5);
    expect(tileColumns(216, 5)).toBe(5);
    expect(tileColumns(215, 5)).toBe(3);
  });

  it('never fewer than the tiles there are', () => {
    expect(tileColumns(100, 2)).toBe(2);
  });
});

describe('the stylesheet', () => {
  const css = readFileSync('src/canvas/canvas.css', 'utf8');
  it('goes three to a line at the widths the sums say, for six tiles and for five', () => {
    expect(css).toContain(`@container cv-panel (max-width: ${tilesNarrowBelow(6) - 1}px) {\n  .cv-kinds[data-count='6']`);
    expect(css).toContain(`@container cv-panel (max-width: ${tilesNarrowBelow(5) - 1}px) {\n  .cv-kinds[data-count='5']`);
  });
  it('gives five tiles five columns, so none is left empty', () => {
    expect(css).toContain(".cv-kinds[data-count='5'] {\n  grid-template-columns: repeat(5, minmax(0, 1fr));")
  });
  it('lays the tiles out as a grid, never as a stacked list', () => {
    expect(css).toMatch(/\.cv-kinds \{\n  display: grid;\n  grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/);
  });
});

describe('the opacity box', () => {
  it('reads a percent, with or without the sign', () => {
    expect(parsePercent('50')).toBe(50);
    expect(parsePercent(' 50 % ')).toBe(50);
    expect(parsePercent('0')).toBe(0);
    expect(parsePercent('33.6')).toBe(34);
  });

  it('clamps what is typed to 0 to 100', () => {
    expect(parsePercent('150')).toBe(100);
    expect(parsePercent('-20')).toBe(0);
    expect(clampPercent(100.4)).toBe(100);
    expect(clampPercent(-0.4)).toBe(0);
  });

  it('says no to what is not a number, so a half typed box is left alone', () => {
    expect(parsePercent('')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
    expect(parsePercent('5x')).toBeNull();
    expect(parsePercent('-')).toBeNull();
  });

  it('the arrows nudge by one, Shift by ten, and stop at the ends', () => {
    expect(nudgePercent(50, 1)).toBe(51);
    expect(nudgePercent(50, -1)).toBe(49);
    expect(nudgePercent(50, 1, true)).toBe(60);
    expect(nudgePercent(95, 1, true)).toBe(100);
    expect(nudgePercent(100, 1)).toBe(100);
    expect(nudgePercent(3, -1, true)).toBe(0);
    expect(nudgePercent(0, -1)).toBe(0);
  });
});

describe('the swatches heading', () => {
  it('names the set, and counts them separately so a narrow panel can leave the count off', () => {
    expect(swatchesWhere(10)).toBe('This drawing');
    expect(swatchesCount(10)).toBe(', 10 colours');
    expect(swatchesCount(1)).toBe(', 1 colour');
  });
});
