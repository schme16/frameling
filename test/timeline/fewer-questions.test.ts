// The first-hour run on a one-layer doodle: N, then + and - on the timeline. Nothing here needs a question.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetChoicesForTests, registerChoice, setChoiceAsker, setGentleTeller } from '../../src/core/choices';
import { getCommand } from '../../src/core/registry';
import { newVectorLayer } from '../../src/core/doc';
import type { Shape } from '../../src/core/format';
import { store } from '../../src/core/store';
import '../../src/timeline';
import * as tlChoices from '../../src/timeline/choices';
import { setTl } from '../../src/timeline/state';
import { addCel, shape, storeWith } from './helpers';

// The choices register when the module loads, and the reset below clears them, so each test puts them back.
const defs = ['timeline.newKey', 'timeline.holdLonger', 'timeline.frameScope', 'timeline.tidyEnd'] as const;
let sheets: string[];
let toasted: string[];

beforeEach(() => {
  void tlChoices;
  sheets = [];
  toasted = [];
});
afterEach(() => {
  setChoiceAsker(null);
  setGentleTeller(null);
});

async function arm(cels: [number, number][], length = 24) {
  const { getChoiceDef } = await import('../../src/core/choices');
  const kept = defs.map((id) => getChoiceDef(id)!);
  _resetChoicesForTests();
  for (const d of kept) registerChoice(d);
  storeWith(cels, length);
  setTl({ clipId: null } as never);
  setChoiceAsker(async (def) => (sheets.push(def.id), null));
  setGentleTeller((def, value, run) => (toasted.push(def.id), run(value)));
}
const run = (id: string) => void getCommand(id)!.run();

describe('a one-layer doodle', () => {
  it('N on a blank page and + with one layer ask nothing and say nothing', async () => {
    await arm([[0, 4]]);
    store().setUi({ frame: 1 });
    run('timeline.newKey');
    run('timeline.insertFrame');
    expect(sheets).toEqual([]);
    expect(toasted).toEqual([]);
  });

  it('- with one layer asks nothing; the empty frames it leaves are taken off with a toast, not a sheet', async () => {
    await arm([[0, 4]]);
    store().setUi({ frame: 1 });
    run('timeline.removeFrame');
    expect(sheets).toEqual([]);
    expect(toasted).toEqual(['timeline.tidyEnd']);
    expect(store().get().doc.length).toBe(3);
  });

  it('holding a drawing longer with nothing after it asks nothing', async () => {
    await arm([[0, 2]]);
    store().setUi({ frame: 0 });
    run('timeline.hold4');
    expect(sheets).toEqual([]);
    expect(shape(store().get().doc.layers[0])).toEqual([[0, 4]]);
  });

  it('holding a drawing into the next one tells you and does the usual thing rather than asking', async () => {
    await arm([[0, 2], [3, 2]]);
    store().setUi({ frame: 0 });
    run('timeline.hold4');
    expect(sheets).toEqual([]);
    expect(toasted).toEqual(['timeline.holdLonger']);
    expect(shape(store().get().doc.layers[0])).toEqual([[0, 4], [4, 2]]);
  });

  it('N on a drawing with something in it says so rather than asking', async () => {
    await arm([[0, 4]]);
    const layer = store().get().doc.layers[0];
    const drawing = store().get().doc.drawings[layer.cels[0].drawingId];
    store().update('Draw', (d) => {
      const dr = d.drawings[drawing.id];
      if (dr.kind === 'vector') dr.shapes.push({ id: 's1', type: 'rect' } as unknown as Shape);
    });
    store().setUi({ frame: 1 });
    run('timeline.newKey');
    expect(sheets).toEqual([]);
    expect(toasted).toEqual(['timeline.newKey']);
  });
});

describe('several layers', () => {
  it('adding a frame is told, taking one off every layer still asks', async () => {
    await arm([[0, 4]]);
    store().update('Layer', (d) => {
      d.layers.push(newVectorLayer('Two'));
    });
    const two = store().get().doc.layers[1];
    store().update('Cel', (d) => void addCel(d, d.layers.find((l) => l.id === two.id)!, 0, 4));
    store().setUi({ frame: 1 });
    run('timeline.insertFrame');
    expect(sheets).toEqual([]);
    expect(toasted).toEqual(['timeline.frameScope']);
  });
});
