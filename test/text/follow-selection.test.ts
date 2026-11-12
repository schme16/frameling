import { describe, expect, it } from 'vitest';
import type { PathShape, VectorDrawing } from '../../src/core/format';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { newTextShape } from '../../src/text/model';
import { selectedTexts } from '../../src/text/ops';

const box = (id: string): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }], fill: '#f00', stroke: null, opacity: 1 });
const txt = (id: string, text: string) => newTextShape(id, { x: 10, y: 20 }, { text });

// Key 1 (frames 0-4): a box and "Hello". Key 2 (5-9): copies with new ids, "Hello" moved. Key 3 (10-14): no text.
function setup() {
  const doc = newDoc({ width: 200, height: 100, length: 15 });
  const mk = (shapes: VectorDrawing['shapes']) => {
    const d = newVectorDrawing();
    d.shapes.push(...shapes);
    doc.drawings[d.id] = d;
    return d;
  };
  const a = mk([box('a-box'), txt('a-text', 'Hello')]);
  const b = mk([box('b-box'), txt('b-text', 'Hello')]);
  const c = mk([box('c-box')]);
  doc.layers[0].cels = [
    { id: 'k1', start: 0, length: 5, drawingId: a.id, tween: { kind: 'shape', ease: 'linear' } },
    { id: 'k2', start: 5, length: 5, drawingId: b.id },
    { id: 'k3', start: 10, length: 5, drawingId: c.id },
  ];
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, frame: 1, selection: ['a-text'], tool: 'text' });
  return doc;
}

const sel = () => store().get().ui.selection;

describe('selected text stays selected while the playhead moves', () => {
  it('follows the text into the next key, so the Text panel still has it', () => {
    setup();
    store().setUi({ frame: 5 });
    expect(sel()).toEqual(['b-text']);
    expect(selectedTexts().map((t) => t.id)).toEqual(['b-text']);
  });

  it('keeps it through playback ticks and scrubbing back and forth', () => {
    setup();
    for (let f = 2; f <= 8; f++) store().setUi({ frame: f });
    expect(sel()).toEqual(['b-text']);
    store().setUi({ frame: 0 });
    expect(sel()).toEqual(['a-text']);
    store().setUi({ frame: 9 });
    expect(selectedTexts()).toHaveLength(1);
  });

  it('keeps the same selection inside one key', () => {
    setup();
    store().setUi({ frame: 3 });
    expect(sel()).toEqual(['a-text']);
  });

  it('no text on the new frame leaves nothing selected there, and it comes back with the text', () => {
    setup();
    store().setUi({ frame: 12 });
    expect(selectedTexts()).toHaveLength(0);
    expect(sel()).toEqual([]);
    // Back where the text is, it is selected again.
    store().setUi({ frame: 2 });
    expect(selectedTexts().map((t) => t.id)).toEqual(['a-text']);
  });

  it('other shapes follow too (old documents match by place)', () => {
    setup();
    store().setUi({ selection: ['a-box'] });
    store().setUi({ frame: 6 });
    expect(sel()).toEqual(['b-box']);
  });

  it('respects a selection set together with the frame, and another layer', () => {
    setup();
    store().setUi({ frame: 6, selection: [] });
    expect(sel()).toEqual([]);
    store().setUi({ frame: 1, selection: ['a-text'] });
    store().setUi({ frame: 6, activeLayerId: 'other' });
    expect(sel()).toEqual(['a-text']);
  });
});
