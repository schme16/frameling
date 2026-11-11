import { describe, expect, it } from 'vitest';
import { newDoc, pruneDrawings } from '../../src/core/doc';
import type { Doc, InstanceShape, Layer } from '../../src/core/format';
import { resetStore } from '../../src/core/store';
import { makeLipSync } from '../../src/templates/lip-sync';
import { applyMouths, isMouthLayer, layerLabels, mouthFrameAt, mouthLayers, mouthRuns, pickMouthLayer, setMouthAt } from '../../src/lipsync/apply';
import { CHART, frameForMouth, type Mouth } from '../../src/lipsync/chart';
import { lipSync, samplesFor, soundFrames } from '../../src/lipsync/run';

const LABELS = CHART.map((m) => m.label);
const idx = (m: Mouth) => frameForMouth(LABELS, m);

/** The template's doc with the sample "hello" swapped for one held Rest key over `length` frames. */
function blank(length = 48): { doc: Doc; layer: Layer } {
  const doc = makeLipSync();
  const layer = doc.layers.find((l) => l.name === 'Mouth')!;
  doc.length = length;
  layer.cels = [{ ...layer.cels[0], start: 0, length }];
  pruneDrawings(doc);
  return { doc, layer };
}

const shown = (doc: Doc, layer: Layer, from: number, to: number) => Array.from({ length: to - from }, (_, i) => LABELS[mouthFrameAt(doc, layer, from + i)]);

function check(layer: Layer, length: number) {
  let end = 0;
  for (const c of layer.cels) {
    expect(c.length).toBeGreaterThan(0);
    expect(c.start).toBeGreaterThanOrEqual(end);
    end = c.start + c.length;
    expect(end).toBeLessThanOrEqual(length);
  }
}

describe('mouth layers', () => {
  it('finds the layer that holds a labelled symbol, and only that', () => {
    const { doc, layer } = blank();
    expect(mouthLayers(doc).map((l) => l.name)).toEqual(['Mouth']);
    expect(isMouthLayer(doc, doc.layers.find((l) => l.name === 'Head'))).toBe(false);
    expect(layerLabels(doc, layer)).toEqual(LABELS);
    expect(pickMouthLayer(doc, doc.layers.find((l) => l.name === 'Head')!.id)?.name).toBe('Mouth');
    expect(pickMouthLayer(doc, layer.id)?.id).toBe(layer.id);
    expect(pickMouthLayer(newDoc(), null)).toBeUndefined();
  });
  it('ignores symbols without labels', () => {
    const { doc, layer } = blank();
    delete doc.symbols![Object.keys(doc.symbols!)[0]].frameLabels;
    expect(isMouthLayer(doc, layer)).toBe(false);
  });
  it('groups runs', () => {
    expect(mouthRuns(['A', 'A', 'rest', 'A'])).toEqual([
      { mouth: 'A', start: 0, length: 2 },
      { mouth: 'rest', start: 2, length: 1 },
      { mouth: 'A', start: 3, length: 1 },
    ]);
  });
});

describe('applyMouths', () => {
  it('writes one key per run, each showing its mouth as a single frame', () => {
    const { doc, layer } = blank();
    const n = applyMouths(doc, layer.id, 4, ['rest', 'A', 'A', 'A', 'O', 'O', 'MBP'] as Mouth[]);
    expect(n).toBe(4);
    const l = doc.layers.find((x) => x.id === layer.id)!;
    check(l, doc.length);
    expect(shown(doc, l, 3, 12)).toEqual(['Rest', 'Rest', 'A I', 'A I', 'A I', 'O', 'O', 'M B P', 'Rest']);
    const key = l.cels.find((c) => c.start === 5)!;
    expect(key.length).toBe(3);
    const inst = (doc.drawings[key.drawingId] as { shapes: InstanceShape[] }).shapes[0];
    expect(inst).toMatchObject({ type: 'instance', play: 'single', firstFrame: idx('A') });
  });

  it('gives every key its own drawing, and leaves no stray drawings behind', () => {
    const { doc, layer } = blank();
    applyMouths(doc, layer.id, 0, ['A', 'rest', 'A', 'rest'] as Mouth[]);
    const l = doc.layers.find((x) => x.id === layer.id)!;
    const ids = l.cels.map((c) => c.drawingId);
    expect(new Set(ids).size).toBe(ids.length);
    const used = new Set(doc.layers.flatMap((x) => x.cels.map((c) => c.drawingId)));
    for (const sym of Object.values(doc.symbols!)) for (const sl of sym.layers) for (const c of sl.cels) used.add(c.drawingId);
    for (const id of Object.keys(doc.drawings)) expect(used.has(id), id).toBe(true);
  });

  it('cuts a key that straddles the range and keeps what is outside', () => {
    const { doc, layer } = blank(); // one Rest key, frames 0 to 47
    applyMouths(doc, layer.id, 10, Array<Mouth>(5).fill('E'));
    const l = doc.layers.find((x) => x.id === layer.id)!;
    check(l, doc.length);
    expect(l.cels.map((c) => [c.start, c.length])).toEqual([[0, 10], [10, 5], [15, 33]]);
    expect(shown(doc, l, 9, 16)).toEqual(['Rest', 'E', 'E', 'E', 'E', 'E', 'Rest']);
  });

  it('leaves frames past the end of the animation out, and starts negative sounds at frame 0', () => {
    const { doc, layer } = blank(10);
    applyMouths(doc, layer.id, 7, Array<Mouth>(8).fill('O'));
    const l = doc.layers.find((x) => x.id === layer.id)!;
    check(l, 10);
    expect(shown(doc, l, 6, 10)).toEqual(['Rest', 'O', 'O', 'O']);
    applyMouths(doc, layer.id, -3, ['A', 'A', 'A', 'U', 'U'] as Mouth[]);
    expect(shown(doc, l, 0, 3)).toEqual(['U', 'U', 'Rest']);
  });

  it('does nothing on a layer without a mouth, or when nothing fits', () => {
    const { doc } = blank();
    const head = doc.layers.find((l) => l.name === 'Head')!;
    expect(applyMouths(doc, head.id, 0, ['A'] as Mouth[])).toBe(0);
    expect(applyMouths(doc, doc.layers.find((l) => l.name === 'Mouth')!.id, 100, ['A'] as Mouth[])).toBe(0);
  });

  it('uses the nearest frame when the symbol has fewer mouths', () => {
    const { doc, layer } = blank();
    const sym = doc.symbols![Object.keys(doc.symbols!)[0]];
    sym.frameLabels = ['Rest', 'A', 'E', 'O', 'M B P'];
    applyMouths(doc, layer.id, 0, ['WQ', 'WQ', 'etc', 'etc', 'FV', 'FV'] as Mouth[]);
    const l = doc.layers.find((x) => x.id === layer.id)!;
    expect(shown(doc, l, 0, 6).map((_, i) => sym.frameLabels![mouthFrameAt(doc, l, i)])).toEqual(['O', 'O', 'E', 'E', 'E', 'E']);
  });
});

describe('setMouthAt (by hand)', () => {
  it('splits a long key, and joins keys that end up the same', () => {
    const { doc, layer } = blank();
    const l = doc.layers.find((x) => x.id === layer.id)!;
    expect(setMouthAt(doc, layer.id, 10, idx('A'))).toBe(true);
    check(l, doc.length);
    expect(l.cels.map((c) => [c.start, c.length])).toEqual([[0, 10], [10, 1], [11, 37]]);
    expect(shown(doc, l, 9, 12)).toEqual(['Rest', 'A I', 'Rest']);
    // The next frame the same: it joins the first one.
    expect(setMouthAt(doc, layer.id, 11, idx('A'))).toBe(true);
    expect(l.cels.map((c) => [c.start, c.length])).toEqual([[0, 10], [10, 2], [12, 36]]);
    // Putting rest back on frame 10 and 11 gives the original single key again.
    setMouthAt(doc, layer.id, 10, idx('rest'));
    setMouthAt(doc, layer.id, 11, idx('rest'));
    expect(l.cels.map((c) => [c.start, c.length])).toEqual([[0, 48]]);
  });

  it('does nothing when the mouth is already right', () => {
    const { doc, layer } = blank();
    expect(setMouthAt(doc, layer.id, 5, idx('rest'))).toBe(false);
  });

  it('changes the first and last frame of a key, and fills a gap', () => {
    const { doc, layer } = blank(20);
    const l = doc.layers.find((x) => x.id === layer.id)!;
    setMouthAt(doc, layer.id, 0, idx('O'));
    expect(l.cels.map((c) => [c.start, c.length])).toEqual([[0, 1], [1, 19]]);
    setMouthAt(doc, layer.id, 19, idx('U'));
    expect(l.cels.map((c) => [c.start, c.length])).toEqual([[0, 1], [1, 18], [19, 1]]);
    // Make a gap by removing a key, then fill one frame of it.
    l.cels = l.cels.filter((c) => c.start !== 1);
    expect(mouthFrameAt(doc, l, 5)).toBe(-1);
    setMouthAt(doc, layer.id, 5, idx('L'));
    check(l, doc.length);
    expect(mouthFrameAt(doc, l, 5)).toBe(idx('L'));
    expect(mouthFrameAt(doc, l, 6)).toBe(-1);
  });

  it('refuses frames outside the animation and layers with no mouth', () => {
    const { doc, layer } = blank(10);
    expect(setMouthAt(doc, layer.id, 10, 1)).toBe(false);
    expect(setMouthAt(doc, layer.id, -1, 1)).toBe(false);
    expect(setMouthAt(doc, doc.layers.find((l) => l.name === 'Head')!.id, 3, 1)).toBe(false);
  });
});

describe('through the store', () => {
  it('is one undo step', () => {
    const { doc, layer } = blank();
    const s = resetStore(doc);
    s.update('Lip sync', (d) => void applyMouths(d, layer.id, 2, ['A', 'A', 'E', 'rest', 'O'] as Mouth[]));
    const after = s.get().doc.layers.find((l) => l.id === layer.id)!;
    expect(after.cels.length).toBeGreaterThan(1);
    s.undo();
    expect(s.get().doc.layers.find((l) => l.id === layer.id)!.cels.map((c) => [c.start, c.length])).toEqual([[0, 48]]);
    expect(s.canUndo()).toBe(false);
  });
});

describe('listening to a sound', () => {
  it('works out the frames a sound covers inside the animation', () => {
    expect(soundFrames({ start: 4, duration: 1 }, 24, 100)).toEqual({ first: 4, frames: 24 });
    expect(soundFrames({ start: 90, duration: 1 }, 24, 100)).toEqual({ first: 90, frames: 10 });
    expect(soundFrames({ start: -10, duration: 1 }, 24, 100)).toEqual({ first: 0, frames: 14 });
    expect(soundFrames({ start: 200, duration: 1 }, 24, 100).frames).toBe(0);
  });
  it('skips the start of a sound that begins before frame 0', () => {
    const ch = new Float32Array(48000).map((_, i) => i);
    expect(samplesFor([ch], 48000, { start: -12 }, 24)[0]).toBe(24000);
    expect(samplesFor([ch], 48000, { start: 5 }, 24)[0]).toBe(0);
  });
  it('says why when there is nothing to do', async () => {
    const { doc } = blank();
    resetStore(doc);
    const r = await lipSync('nope', 'nope');
    expect(r.ok).toBe(false);
  });
});
