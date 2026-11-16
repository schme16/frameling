// @vitest-environment jsdom
// Effects on a picked shape: the Effects panel switches to the shape when one is picked, the effect commands ask once
// whether it goes on the shape or the layer, and every edit is one undo step on the drawing.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FillShape } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { allCommands, getCommand } from '../../src/core/registry';
import { currentChoice, resetChoices, setChoice } from '../../src/core/choices';
import '../../src/renderer/features';
import { EffectsPanel } from '../../src/effects/EffectsPanel';
import * as ops from '../../src/effects/ops';
import { pickedShapes } from '../../src/effects/shapeOps';
import { ellipsePath, fill, hold, rectPath, vectorDrawing } from '../../src/templates/build';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  resetChoices();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

/** A layer with two shapes; `pick` says which are picked. */
function mount(pick: number[]) {
  const doc = newDoc({ width: 100, height: 100, length: 4 });
  doc.layers = [];
  const l = Object.assign(newVectorLayer('Hero'), { id: 'hero' });
  doc.layers.push(l);
  const d = vectorDrawing(doc, [fill([rectPath(0, 0, 10, 10)], '#ff0000'), fill([ellipsePath(50, 50, 20, 8)], '#000000')]);
  hold(l, d.id, 0, 4);
  const s = resetStore(doc);
  s.setUi({ activeLayerId: 'hero', selection: pick.map((i) => d.shapes[i].id) });
  act(() => root.render(<EffectsPanel />));
  return { s, drawingId: d.id };
}
const run = (id: string) => act(() => void getCommand(id)!.run());
const shapesNow = (drawingId: string) => (store().get().doc.drawings[drawingId] as { shapes: FillShape[] }).shapes;
const text = () => host.textContent ?? '';

describe('the Effects panel', () => {
  it('offers the layer when nothing is picked, and does not mention shapes', () => {
    mount([]);
    expect(host.querySelector('[data-testid="fx-shape-note"]')).toBeNull();
    expect(text()).toContain('Hero');
    expect(text()).toContain('Blend');
  });

  it('switches to the picked shape: says so, and leaves out what only a layer has', () => {
    mount([1]);
    expect(text()).toContain('Shape: the one you picked');
    expect(host.querySelector('[data-testid="fx-shape-note"]')?.textContent).toMatch(/the picked shape only, before anything the layer does/);
    expect(text()).not.toContain('Blend');
    expect(text()).not.toContain('Clip to the layer below');
    expect(text()).toContain('Take effects off');
  });

  it('counts several picked shapes', () => {
    mount([0, 1]);
    expect(text()).toContain('Shape: 2 you picked');
  });

  it('shows the effects on the shape and no keyframe button, since shape effects are not animated', () => {
    const { drawingId } = mount([1]);
    act(() => void ops.addEffect({ shapes: true }, 'glow'));
    expect(shapesNow(drawingId)[1].effects).toHaveLength(1);
    expect(shapesNow(drawingId)[0].effects).toBeUndefined();
    expect(host.querySelector('.fx-card')).not.toBeNull();
    expect(host.querySelector('.fx-anim')).toBeNull();
  });
});

describe('editing the picked shapes', () => {
  it('adds, changes and removes an effect on the picked shape only, one undo step each', () => {
    const { drawingId } = mount([1]);
    expect(pickedShapes()).toHaveLength(1);
    act(() => void ops.addEffect({ shapes: true }, 'blur'));
    const fx = shapesNow(drawingId)[1].effects![0];
    act(() => void ops.setEffectValue({ shapes: true }, fx.id, 'radius', 7));
    expect(shapesNow(drawingId)[1].effects![0].values.radius).toBe(7);
    act(() => void store().undo());
    expect(shapesNow(drawingId)[1].effects![0].values.radius).not.toBe(7);
    act(() => void store().undo());
    expect(shapesNow(drawingId)[1].effects).toBeUndefined();
    act(() => void store().redo());
    act(() => void ops.removeEffect({ shapes: true }, fx.id));
    expect(shapesNow(drawingId)[1].effects).toBeUndefined();
  });

  it('puts the same effect on every picked shape', () => {
    const { drawingId } = mount([0, 1]);
    act(() => void ops.addEffect({ shapes: true }, 'shadow'));
    const [a, b] = shapesNow(drawingId);
    expect(a.effects![0].id).toBe(b.effects![0].id);
    act(() => void ops.resetLook({ shapes: true }));
    expect(shapesNow(drawingId).some((s) => s.effects)).toBe(false);
  });
});

describe('the commands', () => {
  it('has a command to take the effects off the picked shapes, and it is only on when a picked shape has one', () => {
    expect(allCommands().some((c) => c.id === 'effects.shapesReset')).toBe(true);
    const { s, drawingId } = mount([1]);
    const cmd = getCommand('effects.shapesReset')!;
    expect(cmd.enabled?.(s.get())).toBe(false);
    act(() => void ops.addEffect({ shapes: true }, 'blur'));
    expect(cmd.enabled?.(store().get())).toBe(true);
    run('effects.shapesReset');
    expect(shapesNow(drawingId)[1].effects).toBeUndefined();
    expect(cmd.reason?.(store().get())).toMatch(/Pick a shape/);
  });

  it('adds an effect to the picked shape, or the layer when its answer says so, and the layer when nothing is picked', () => {
    // The first time it asks (here, with nobody to ask, the usual answer: the shape).
    expect(currentChoice('effects.addTarget')).toBe('shapes');
    const { drawingId } = mount([1]);
    run('effects.add.glow');
    expect(shapesNow(drawingId)[1].effects?.[0].kind).toBe('glow');
    expect(store().get().doc.layers[0].effects).toBeUndefined();
    act(() => void ops.resetLook({ shapes: true }));
    setChoice('effects.addTarget', 'layer');
    run('effects.add.blur');
    expect(store().get().doc.layers[0].effects?.[0].kind).toBe('blur');
    expect(shapesNow(drawingId)[1].effects).toBeUndefined();
    // Nothing picked: always the layer.
    setChoice('effects.addTarget', 'shapes');
    store().setUi({ selection: [] });
    run('effects.add.shadow');
    expect(store().get().doc.layers[0].effects?.map((e) => e.kind)).toEqual(['blur', 'shadow']);
  });
});
