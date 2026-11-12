// @vitest-environment jsdom
// The pixel quests, one for each way to build a sprite: their checks, from hand-built states.
import { describe, expect, it } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/artboards';
import '../../src/pixel';
import type { PixelLayer } from '../../src/core/format';
import { artboardsOf, contentOf } from '../../src/artboards/model';
import { resetStore } from '../../src/core/store';
import { BOARD_BY_BOARD, CAST_ON_A_SHEET, ONE_TINY_PICTURE, PIXEL_QUESTS, PIXEL_WAY_QUESTS, coloursAt, inkedBoards } from '../../src/pixel/quests-ways';
import { newSpriteDoc } from '../../src/pixel/way';
import { lines } from '../../src/ui/mascot/lines';
import type { Quest } from '../../src/quests/types';
import { NO_PROBE } from '../../src/quests/types';
import { ctxFor } from '../quests/helpers';

const step = (q: Quest, id: string) => q.steps.find((s) => s.id === id)!;

/** Paints a few pixels in a colour on the first pixel layer's drawing of a board. */
function paint(doc: ReturnType<typeof newSpriteDoc>, board: number, rgb: [number, number, number], n = 12, frame = 0): void {
  const c = contentOf(doc, artboardsOf(doc)[board].id)!;
  const cel = (c.layers[0] as PixelLayer).cels.find((x) => frame >= x.start && frame < x.start + x.length)!;
  const d = doc.drawings[cel.drawingId] as { pixels: Uint8ClampedArray };
  for (let i = 0; i < n; i++) d.pixels.set([...rgb, 255], i * 4 + (rgb[0] % 2) * 0);
}

describe('the pixel way quests', () => {
  it('there is one for each way but the animation (Pixel pal), each with its own badge, open from the start', () => {
    expect(PIXEL_WAY_QUESTS.map((q) => q.id)).toEqual(['one-tiny-picture', 'board-by-board', 'cast-on-a-sheet']);
    expect(PIXEL_WAY_QUESTS.map((q) => q.badge!.name)).toEqual(['Icon Maker', 'Storyboarder', 'Sheet Master']);
    for (const q of PIXEL_WAY_QUESTS) {
      expect(q.requires).toEqual([]);
      expect(q.minutes).toBeGreaterThanOrEqual(3);
      expect(q.minutes).toBeLessThanOrEqual(4);
      for (const s of q.steps) {
        expect(s.say).not.toMatch(/—/);
        expect(typeof s.done).toBe('function');
      }
    }
  });
  it('pixel quests cheer with the pixel words', () => {
    expect(PIXEL_QUESTS.has('pixel-pal') && PIXEL_QUESTS.has('one-tiny-picture') && PIXEL_QUESTS.has('shade-and-shine')).toBe(true);
    expect(lines('pixel.quest.praise')).toContain('Chunky!');
  });
});

describe('One tiny picture', () => {
  it('draw: some pixels on the picture', () => {
    const doc = newSpriteDoc({ way: 'picture', width: 16, height: 16 });
    const s = resetStore(doc).get();
    expect(step(ONE_TINY_PICTURE, 'draw').done!(ctxFor(s))).toBe(false);
    paint(doc, 0, [255, 111, 145]);
    expect(step(ONE_TINY_PICTURE, 'draw').done!(ctxFor(resetStore(doc).get()))).toBe(true);
  });
  it('swap: Paint and Back trade places', () => {
    const doc = newSpriteDoc({ way: 'picture', width: 16, height: 16 });
    const before = resetStore(doc).get();
    const a = { ...before, ui: { ...before.ui, color: '#ff6f91', fillColor: '#6fb8ff' } };
    const b = { ...before, ui: { ...before.ui, color: '#6fb8ff', fillColor: '#ff6f91' } };
    expect(step(ONE_TINY_PICTURE, 'swap').done!(ctxFor(a, { entry: { state: a, probe: NO_PROBE } }))).toBe(false);
    expect(step(ONE_TINY_PICTURE, 'swap').done!(ctxFor(b, { entry: { state: a, probe: NO_PROBE } }))).toBe(true);
  });
  it('back: a second colour on the frame', () => {
    const doc = newSpriteDoc({ way: 'picture', width: 16, height: 16 });
    paint(doc, 0, [255, 111, 145], 10);
    expect(coloursAt(doc, 0)).toBe(1);
    const d = doc.drawings[doc.layers[0].cels[0].drawingId] as { pixels: Uint8ClampedArray };
    d.pixels.set([111, 184, 255, 255], 40 * 4);
    expect(coloursAt(doc, 0)).toBe(2);
    expect(step(ONE_TINY_PICTURE, 'back').done!(ctxFor(resetStore(doc).get()))).toBe(true);
  });
  it('export: the PNG card is chosen', () => {
    const s = resetStore(newSpriteDoc({ way: 'picture', width: 16, height: 16 })).get();
    const done = step(ONE_TINY_PICTURE, 'export').done!;
    expect(done(ctxFor(s, { probe: { ...NO_PROBE, exportOpen: true, exportFormat: 'gif' } }))).toBe(false);
    expect(done(ctxFor(s, { probe: { ...NO_PROBE, exportOpen: true, exportFormat: 'png' } }))).toBe(true);
  });
});

describe('Board by board', () => {
  it('counts the boards you have drawn on, not the frames of one board', () => {
    const doc = newSpriteDoc({ way: 'boards', width: 16, height: 16 });
    expect(inkedBoards(doc)).toBe(0);
    paint(doc, 0, [10, 10, 10]);
    expect(inkedBoards(doc)).toBe(1);
    paint(doc, 2, [10, 10, 10]);
    expect(inkedBoards(doc)).toBe(2);
    const s = resetStore(doc).get();
    expect(step(BOARD_BY_BOARD, 'one').done!(ctxFor(s))).toBe(true);
    expect(step(BOARD_BY_BOARD, 'two').done!(ctxFor(s))).toBe(true);
    expect(step(BOARD_BY_BOARD, 'three').done!(ctxFor(s))).toBe(false);
  });
  it('play: Play all in order ran, and the sheet step wants the Sprite sheet card', () => {
    const s = resetStore(newSpriteDoc({ way: 'boards', width: 16, height: 16 })).get();
    expect(step(BOARD_BY_BOARD, 'play').done!(ctxFor(s))).toBe(false);
    expect(step(BOARD_BY_BOARD, 'play').done!(ctxFor(s, { ran: new Set(['artboards.playAll']) }))).toBe(true);
    expect(step(BOARD_BY_BOARD, 'sheet').done!(ctxFor(s, { probe: { ...NO_PROBE, exportOpen: true, exportFormat: 'sheet' } }))).toBe(true);
  });
});

describe('A cast on one sheet', () => {
  it('hero and item, then the sheet', () => {
    const doc = newSpriteDoc({ way: 'sheet', width: 16, height: 16 });
    paint(doc, 0, [10, 10, 10]);
    paint(doc, 2, [200, 10, 10]);
    const s = resetStore(doc).get();
    expect(step(CAST_ON_A_SHEET, 'hero').done!(ctxFor(s))).toBe(true);
    expect(step(CAST_ON_A_SHEET, 'item').done!(ctxFor(s))).toBe(true);
    expect(step(CAST_ON_A_SHEET, 'sheet').done!(ctxFor(s, { probe: { ...NO_PROBE, exportOpen: true, exportFormat: 'sheet' } }))).toBe(true);
  });
});

