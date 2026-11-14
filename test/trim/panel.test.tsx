// @vitest-environment jsdom
// The Draw on panel and its commands, on the open document.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/trim';
import type { Doc, PathShape } from '../../src/core/format';
import { newDoc } from '../../src/core/doc';
import { forgetAnswers, rememberedChoice, setChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp, getPanel } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { trimOf } from '../../src/core/trimTween';
import { addVectorLayer, hold, linePath, pathShape, vectorDrawing } from '../../src/templates/build';
import { TrimPanel } from '../../src/trim/TrimPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let shape: PathShape;

function start(shapes: PathShape[] = [pathShape([linePath([[100, 100], [500, 100]])], null, { color: '#222222', width: 8 })]): Doc {
  const doc = newDoc({ length: 48, fps: 24 });
  const layer = addVectorLayer(doc, 'Line');
  doc.layers = [layer];
  shape = shapes[0];
  hold(layer, vectorDrawing(doc, shapes).id, 0, 48);
  resetStore(doc);
  store().setUi({ activeLayerId: layer.id, frame: 0, selection: shapes.map((s) => s.id), tool: 'select' });
  return doc;
}

const keys = () => store().get().doc.layers[0].cels.map((c) => c.start);
const run = (id: string) => act(() => void getCommand(id)!.run());

beforeEach(() => {
  forgetAnswers(['trim.order']);
  setChoiceAsker(null);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('the commands', () => {
  it('are in the palette with words, help and keys', () => {
    for (const id of ['trim.drawOn', 'trim.drawOff', 'trim.whole']) {
      const c = getCommand(id)!;
      expect(c.label).not.toMatch(/—/);
      expect(c.help).toBe('draw-on');
      expect(c.description).toBeTruthy();
    }
    expect(getCommand('trim.drawOn')!.keys).toEqual(['Mod+Alt+W']);
    expect(getHelp('draw-on')?.media).toBe('draw-on.mp4');
    expect(getPanel('draw-on')?.title).toBe('Draw on');
  });

  it('Make the line draw itself makes the keys, selects the line and goes to the start', () => {
    start();
    store().setUi({ frame: 0 });
    run('trim.drawOn');
    expect(keys()).toEqual([0, 24]);
    expect(store().get().ui.frame).toBe(0);
    expect(store().get().ui.selection).toHaveLength(1);
    const d = store().get().doc.drawings[store().get().doc.layers[0].cels[0].drawingId];
    expect(d.kind === 'vector' && trimOf(d.shapes[0])).toMatchObject({ end: 0 });
  });

  it('is one undo step', () => {
    start();
    run('trim.drawOn');
    act(() => store().undo());
    expect(keys()).toEqual([0]);
  });

  it('Make the line erase itself and Show the whole line', () => {
    start();
    run('trim.drawOff');
    expect(keys()).toEqual([0, 24]);
    run('trim.whole');
    const doc = store().get().doc;
    for (const c of doc.layers[0].cels) {
      const d = doc.drawings[c.drawingId];
      expect(d.kind === 'vector' && trimOf(d.shapes[0])).toBeUndefined();
    }
  });

  it('with nothing picked it changes nothing and says what to do', () => {
    start();
    store().setUi({ selection: [] });
    run('trim.drawOn');
    expect(keys()).toEqual([0]);
  });

  it('asks how several outlines go, once, and remembers', () => {
    start([pathShape([linePath([[0, 0], [100, 0]]), linePath([[0, 40], [100, 40]])], null, { color: '#000000', width: 4 })]);
    const asked: string[] = [];
    setChoiceAsker(async (def) => {
      asked.push(def.id);
      return { value: 'inOrder', remember: true };
    });
    run('trim.drawOn');
    return new Promise((r) => setTimeout(r, 10)).then(() => {
      expect(asked).toEqual(['trim.order']);
      expect(rememberedChoice('trim.order')).toBe('inOrder');
      const d = store().get().doc.drawings[store().get().doc.layers[0].cels[0].drawingId];
      expect(d.kind === 'vector' && trimOf(d.shapes[0])).toMatchObject({ order: 'inOrder' });
    });
  });

  it('does not ask for a shape with one outline', () => {
    start();
    const asked: string[] = [];
    setChoiceAsker(async (def) => {
      asked.push(def.id);
      return null;
    });
    run('trim.drawOn');
    expect(asked).toEqual([]);
  });

  it('uses the remembered answer without asking', () => {
    start([pathShape([linePath([[0, 0], [100, 0]]), linePath([[0, 40], [100, 40]])], null, { color: '#000000', width: 4 })]);
    setChoice('trim.order', 'together');
    run('trim.drawOn');
    const d = store().get().doc.drawings[store().get().doc.layers[0].cels[0].drawingId];
    expect(d.kind === 'vector' && trimOf(d.shapes[0])).toMatchObject({ start: 0, end: 0 });
    expect(d.kind === 'vector' && trimOf(d.shapes[0])?.order).toBeUndefined();
  });
});

describe('the Draw on panel', () => {
  const text = () => host.textContent ?? '';
  const sliders = () => [...host.querySelectorAll<HTMLElement>('[role="slider"], input[type="range"]')];

  it('tells you to pick a line when nothing is picked', () => {
    start();
    store().setUi({ selection: [] });
    act(() => root.render(<TrimPanel />));
    expect(text()).toContain('Pick a line on the canvas');
    expect(sliders()).toHaveLength(0);
  });

  it('shows Start, End and Offset for a picked line, and the three quick buttons', () => {
    start();
    act(() => root.render(<TrimPanel />));
    for (const w of ['Start', 'End', 'Offset', 'Draw it on', 'Rub it out', 'Show it all']) expect(text()).toContain(w);
    expect(text()).not.toContain('Several outlines');
  });

  it('Draw it on does what the command does', () => {
    start();
    act(() => root.render(<TrimPanel />));
    const b = [...host.querySelectorAll('button')].find((x) => x.textContent === 'Draw it on')!;
    act(() => b.click());
    expect(keys()).toEqual([0, 24]);
    // The panel now shows the line on its first key at nothing, and that it glides.
    expect(text()).toContain('0%');
  });

  it('offers the several-outlines choice only for a shape made of several', () => {
    start([pathShape([linePath([[0, 0], [100, 0]]), linePath([[0, 40], [100, 40]])], null, { color: '#000000', width: 4 })]);
    act(() => root.render(<TrimPanel />));
    expect(text()).toContain('Several outlines');
    expect(text()).toContain('One after another');
  });

  it('says when a slider will cut a key here', () => {
    start();
    store().setUi({ frame: 10 });
    act(() => root.render(<TrimPanel />));
    expect(text()).toContain('partway through a key, on frame 11');
  });
});
