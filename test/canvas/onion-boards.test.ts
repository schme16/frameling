import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { Artboard, Doc } from '../../src/core/format';
import { addArtboard, artboardsOf, switchArtboard } from '../../src/artboards/model';
import { onionBoards } from '../../src/canvas/onion';

const ON = { before: 2, after: 1, boards: true };

/** A document with four boards in a row: the first is 32x16 and 4 frames long, the rest as asked. */
function storyboard(): Doc {
  const doc = newDoc({ name: 'Shots', width: 32, height: 16, length: 4 });
  addArtboard(doc, { name: 'Shot 2', length: 3 });
  addArtboard(doc, { name: 'Shot 3', length: 5 });
  addArtboard(doc, { name: 'Shot 4', length: 2 });
  return doc;
}

const go = (doc: Doc, id: string): Doc => produce(doc, (d) => void switchArtboard(d, id));

describe('onion skin: the boards either side', () => {
  it('shows nothing when the setting is off, or there is only one board', () => {
    const doc = storyboard();
    expect(onionBoards(doc, { ...ON, boards: false })).toEqual([]);
    expect(onionBoards(newDoc({ name: 'One' }), ON)).toEqual([]);
  });

  it('counts boards like frames, furthest first, and stops at the ends', () => {
    const doc = storyboard();
    const ids = artboardsOf(doc).map((a) => a.id);
    const mid = onionBoards(go(doc, ids[2]), ON);
    expect(mid.map((b) => [b.id, b.side, b.dist])).toEqual([
      [ids[0], 'before', 2],
      [ids[1], 'before', 1],
      [ids[3], 'after', 1],
    ]);
    // On the first board there is nothing before it.
    expect(onionBoards(doc, ON).map((b) => [b.id, b.side])).toEqual([[ids[1], 'after']]);
    // On the last there is nothing after it.
    expect(onionBoards(go(doc, ids[3]), ON).map((b) => b.side)).toEqual(['before', 'before']);
  });

  it('a board before shows its last frame, a board after its first', () => {
    const doc = storyboard();
    const ids = artboardsOf(doc).map((a) => a.id);
    const around = onionBoards(go(doc, ids[2]), ON);
    // Shot 1 is 4 frames long, Shot 2 is 3; the board after starts at 0.
    expect(around.map((b) => b.frame)).toEqual([3, 2, 0]);
  });

  it('fits a board of another size into this one, centred, and leaves same-sized boards alone', () => {
    const doc = newDoc({ name: 'Mixed', width: 100, height: 100 });
    addArtboard(doc, { name: 'Wide', width: 200, height: 50, length: 1 });
    const ids = artboardsOf(doc).map((a) => a.id);
    expect(onionBoards(doc, ON)[0].fit).toEqual([0.5, 0, 0, 0.5, 0, 37.5]);
    // The other way round the first board is the odd one: 100x100 into 200x50.
    const onWide = onionBoards(go(doc, ids[1]), ON)[0];
    expect(onWide.fit).toEqual([0.5, 0, 0, 0.5, 75, 0]);
    const same = storyboard();
    expect(onionBoards(same, ON)[0].fit).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('leaves variations out of the row, and a variation stands in for its board', () => {
    const doc = storyboard();
    const list = artboardsOf(doc);
    const ids = list.map((a) => a.id);
    // Shot 3 is a variation of Shot 2: it drops out of the row, and opening it looks around Shot 2.
    (list[2] as Artboard).variationOf = ids[1];
    expect(onionBoards(go(doc, ids[1]), ON).map((b) => b.id)).toEqual([ids[0], ids[3]]);
    expect(onionBoards(go(doc, ids[2]), ON).map((b) => b.id)).toEqual([ids[0], ids[3]]);
  });

  it('shows nothing while a symbol is open', () => {
    const doc = storyboard();
    const opened = produce(doc, (d) => {
      d.editing = [{ symbolId: 's1', layers: d.layers, length: d.length, frame: 0, activeLayerId: null }] as Doc['editing'];
    });
    expect(onionBoards(opened, ON)).toEqual([]);
  });
});
