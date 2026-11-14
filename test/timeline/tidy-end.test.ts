import { afterEach, describe, expect, it } from 'vitest';
import * as ops from '../../src/timeline/ops';
import * as keys from '../../src/timeline/keys';
import { celRef } from '../../src/timeline/tracks';
import { emptyTail, fitLength, tidyEnd } from '../../src/timeline/tidyEnd';
import { setChoice, setChoiceAsker, type ChoiceAsker } from '../../src/core/choices';
import { getChoiceDef } from '../../src/core/choices';
import { addCel, docWith, storeWith } from './helpers';
import { store } from '../../src/core/store';
import { newVectorLayer } from '../../src/core/doc';

describe('where the animation really ends', () => {
  it('is the end of the furthest drawing and its hold', () => {
    const d = docWith([[0, 4], [10, 18]], 31);
    expect(fitLength(d)).toBe(28);
    expect(emptyTail(d)).toBe(3);
  });
  it('is at least one frame, even with nothing drawn', () => {
    const d = docWith([], 12);
    expect(fitLength(d)).toBe(1);
  });
  it('never grows the animation', () => {
    const d = docWith([[0, 40]], 24);
    expect(fitLength(d)).toBe(24);
    expect(emptyTail(d)).toBe(0);
    expect(tidyEnd(d)).toBe(false);
    expect(d.length).toBe(24);
  });
  it('stops at the furthest marker, clip end and play range', () => {
    const d = docWith([[0, 4]], 31);
    d.markers.push({ id: 'm', name: 'Hit', frame: 19 });
    expect(fitLength(d)).toBe(20);
    d.clips.push({ id: 'k', name: 'Run', start: 5, end: 24, loop: true });
    expect(fitLength(d)).toBe(25);
    d.inOut = { start: 2, end: 26 };
    expect(fitLength(d)).toBe(27);
  });
  it('lets a play range that covers everything go', () => {
    const d = docWith([[0, 4]], 31);
    d.inOut = { start: 0, end: 30 };
    expect(fitLength(d)).toBe(4);
  });
  it('counts every layer, effect keys and sounds', () => {
    const d = docWith([[0, 4]], 40);
    const l = newVectorLayer('Two');
    d.layers.push(l);
    addCel(d, l, 20, 5);
    expect(fitLength(d)).toBe(25);
    l.effects = [{ id: 'e', kind: 'blur' as never, values: {}, keys: [{ frame: 33, values: {} }] }];
    expect(fitLength(d)).toBe(34);
    d.audio = [{ id: 'a', name: 'boom', start: 36, data: new Uint8Array(), mime: 'audio/wav' }];
    expect(fitLength(d)).toBe(37);
  });
  it('tidyEnd takes the empty frames off and leaves everything else alone', () => {
    const d = docWith([[0, 4], [10, 18]], 31);
    expect(tidyEnd(d)).toBe(true);
    expect(d.length).toBe(28);
    expect(d.layers[0].cels.map((c) => [c.start, c.length])).toEqual([[0, 4], [10, 18]]);
  });
  it('leaves an old file with a tail exactly as it is until you ask', () => {
    const d = docWith([[0, 4]], 31);
    expect(d.length).toBe(31);
  });
});

describe('the question and the preference', () => {
  afterEach(() => {
    setChoiceAsker(null);
    setChoice('timeline.tidyEnd', undefined);
  });
  const answerWith = (value: string, remember = true): { asked: () => number } => {
    let n = 0;
    const ask: ChoiceAsker = async () => {
      n++;
      return { value, remember };
    };
    setChoiceAsker(ask);
    return { asked: () => n };
  };
  const hold = (length: number) => {
    // The user's story: stretch a hold to the end of frame 31 (the animation grows), then pull it back to 28.
    storeWith([[0, 4], [10, 14]], 24);
    const s = store();
    const layer = s.get().doc.layers[0];
    ops.resizeCel(layer.id, layer.cels[1].id, 21);
    expect(s.get().doc.length).toBe(31);
    return { s, layer: s.get().doc.layers[0], cel: s.get().doc.layers[0].cels[1], length };
  };

  it('is a real preference: registered in Behaviour with the plain question and both answers', () => {
    const def = getChoiceDef('timeline.tidyEnd')!;
    expect(def.question).toBe('Take the empty frames off the end?');
    expect(def.options.map((o) => o.value)).toEqual(['tidy', 'keep']);
    expect(def.silent).toBeFalsy();
    expect(def.default).toBe('tidy');
    expect(def.category).toBe('Timeline');
  });

  it('shortening a hold takes the empty frames off when there is no way to ask (the default)', () => {
    const { s, layer, cel } = hold(28);
    ops.resizeCel(layer.id, cel.id, 18);
    expect(s.get().doc.length).toBe(28);
  });

  it('asks the first time, and tidies when the answer is take them off', async () => {
    const { s, layer } = hold(28);
    const a = answerWith('tidy');
    ops.resizeCel(layer.id, layer.cels[1].id, 18);
    await new Promise((r) => setTimeout(r, 0));
    expect(a.asked()).toBe(1);
    expect(s.get().doc.length).toBe(28);
  });

  it('remembers the answer, then tidies in the same undo step without asking again', async () => {
    const { s, layer } = hold(28);
    setChoice('timeline.tidyEnd', 'tidy');
    const a = answerWith('keep');
    const before = s.get().doc;
    ops.resizeCel(layer.id, layer.cels[1].id, 18);
    expect(a.asked()).toBe(0);
    expect(s.get().doc.length).toBe(28);
    s.undo();
    expect(s.get().doc).toEqual(before);
    expect(s.get().doc.length).toBe(31);
  });

  it('keeps the playhead on a frame that is still there', () => {
    const { s, layer } = hold(28);
    s.setUi({ frame: 30 });
    setChoice('timeline.tidyEnd', 'tidy');
    ops.resizeCel(layer.id, layer.cels[1].id, 18);
    expect(s.get().doc.length).toBe(28);
    expect(s.get().ui.frame).toBe(27);
  });

  it('keep leaves the empty frames and does not ask twice', async () => {
    const { s, layer } = hold(28);
    const a = answerWith('keep');
    ops.resizeCel(layer.id, layer.cels[1].id, 18);
    await new Promise((r) => setTimeout(r, 0));
    ops.resizeCel(layer.id, layer.cels[1].id, 15);
    await new Promise((r) => setTimeout(r, 0));
    expect(a.asked()).toBe(1);
    expect(s.get().doc.length).toBe(31);
  });

  it('does not ask when the edit leaves the end alone', async () => {
    storeWith([[0, 4], [10, 18]], 31);
    const a = answerWith('tidy');
    ops.newBlankKey(store().get().doc.layers[0].id, 2);
    await new Promise((r) => setTimeout(r, 0));
    expect(a.asked()).toBe(0);
    expect(store().get().doc.length).toBe(31);
  });

  it('never shrinks past a marker', () => {
    hold(28);
    store().update('Marker', (d) => void d.markers.push({ id: 'm', name: 'Hit', frame: 29 }));
    setChoice('timeline.tidyEnd', 'tidy');
    const l = store().get().doc.layers[0];
    ops.resizeCel(l.id, l.cels[1].id, 5);
    expect(store().get().doc.length).toBe(30);
  });

  it('removing frames and deleting a layer or a key can tidy too', () => {
    storeWith([[0, 4], [10, 18]], 28);
    setChoice('timeline.tidyEnd', 'tidy');
    const l = store().get().doc.layers[0];
    ops.removeFrameAll(15);
    expect(store().get().doc.length).toBe(27);
    ops.deleteKey(l.id, 10);
    expect(store().get().doc.length).toBe(4);
    const two = ops.addVectorLayer();
    store().update('Hold', (d) => void d.layers.find((x) => x.id === two.id)!.cels.push({ id: 'c9', start: 0, length: 20, drawingId: Object.keys(d.drawings)[0] }));
    store().update('Grow', (d) => void (d.length = 30));
    ops.deleteLayer(two.id);
    expect(store().get().doc.length).toBe(4);
  });

  it('deleting keys picked on the timeline can tidy', () => {
    storeWith([[0, 4], [10, 18]], 28);
    setChoice('timeline.tidyEnd', 'tidy');
    const l = store().get().doc.layers[0];
    keys.deleteKeys([celRef(l.id, l.cels[1].id)]);
    expect(store().get().doc.length).toBe(4);
  });

  it('the Tidy the end command works whatever was chosen', () => {
    storeWith([[0, 4], [10, 18]], 31);
    setChoice('timeline.tidyEnd', 'keep');
    expect(ops.tidyEnd().ok).toBe(true);
    expect(store().get().doc.length).toBe(28);
    expect(ops.tidyEnd().ok).toBe(false);
  });

  it('each artboard keeps its own length', () => {
    storeWith([[0, 4], [10, 18]], 31);
    store().update('Boards', (d) => {
      d.artboards = [
        { id: 'a', name: 'A', x: 0, y: 0, content: { width: 100, height: 100, background: '#fff', length: 40, layers: [], clips: [], markers: [] } },
      ] as never;
    });
    setChoice('timeline.tidyEnd', 'tidy');
    const l = store().get().doc.layers[0];
    ops.resizeCel(l.id, l.cels[1].id, 5);
    expect(store().get().doc.length).toBe(15);
    expect((store().get().doc.artboards as never as { content: { length: number } }[])[0].content.length).toBe(40);
  });
});
