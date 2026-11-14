// @vitest-environment jsdom
// Markers and clips belong to the scene. Inside an open symbol their lanes give way to a note, and nothing can add one:
// a marker made there would land on the scene at the symbol's frame numbers and fire at the wrong moment.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, InstanceShape, PathShape } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { getCommand } from '../../src/core/registry';
import '../../src/timeline';
import * as ops from '../../src/timeline/ops';
import { TimelinePanel } from '../../src/timeline/TimelinePanel';
import { setTl } from '../../src/timeline/state';
import { editInstance, leaveSymbol, makeSymbolFromSelection } from '../../src/symbols/ops';
import { toasts } from '../../src/ui/toast';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.hasPointerCapture = () => false;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
});

const square = (id: string): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }] }], fill: '#ff0000', stroke: null, opacity: 1 });

/** A scene with a marker and a clip, and a symbol made from one shape. */
function scene(): void {
  const doc = newDoc({ width: 100, height: 100, length: 12 });
  const d = newVectorDrawing();
  d.shapes.push(square('a'));
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 12, drawingId: d.id });
  doc.markers = [{ id: 'm1', name: 'Footstep', frame: 5 }];
  doc.clips = [{ id: 'k1', name: 'idle', start: 0, end: 3, loop: true }];
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, frame: 0, selection: ['a'] });
  makeSymbolFromSelection();
}
const instance = (): InstanceShape => {
  const { doc } = store().get();
  const cel = doc.layers[0].cels[0];
  return (doc.drawings[cel.drawingId] as { shapes: InstanceShape[] }).shapes.find((s) => s.type === 'instance')!;
};
const root_ = (): Doc => store().rootDoc();
const q = (sel: string) => host.querySelector<HTMLElement>(sel);

beforeEach(() => {
  setTl({ cw: 20, clipId: null, editing: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  scene();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

describe('markers and clips inside a symbol', () => {
  it('show on the scene, and are hidden while a symbol is open, with a note that says why', () => {
    act(() => root.render(<TimelinePanel />));
    expect(q('[data-region="markers"]')).not.toBeNull();
    expect(q('[data-region="clips"]')).not.toBeNull();
    expect(q('[data-testid="timeline.sceneOnly"]')).toBeNull();
    act(() => void editInstance(instance().id));
    expect(store().get().doc.editing).toHaveLength(1);
    expect(q('[data-region="markers"]')).toBeNull();
    expect(q('[data-region="clips"]')).toBeNull();
    expect(q('[data-testid="timeline.sceneOnly"]')?.textContent).toBe('Markers and clips belong to the main scene. Go back out of the symbol to use them.');
    act(() => void leaveSymbol());
    expect(q('[data-region="markers"]')).not.toBeNull();
    expect(q('[data-testid="timeline.sceneOnly"]')).toBeNull();
  });

  it('cannot be added, renamed, moved or removed from inside, and the scene\'s stay as they were', () => {
    editInstance(instance().id);
    const before = JSON.stringify([root_().markers, root_().clips]);
    for (const o of [ops.addMarker(), ops.addMarker(3, 'Boing'), ops.addClip(0, 2), ops.renameMarker('m1', 'x'), ops.moveMarker('m1', 2), ops.removeMarker('m1'), ops.renameClip('k1', 'x'), ops.setClipRange('k1', 0, 1), ops.setClipLoop('k1', false), ops.removeClip('k1')]) {
      expect(o.ok).toBe(false);
      expect(o.reason).toBe('in-symbol');
      expect(ops.whyNot(o)).toBe('Markers and clips belong to the main scene. Go back out of the symbol first.');
    }
    expect(JSON.stringify([root_().markers, root_().clips])).toBe(before);
    leaveSymbol();
    expect(ops.addMarker(4, 'Back out').ok).toBe(true);
    expect(store().get().doc.markers.map((m) => m.name)).toContain('Back out');
  });

  it('the Add a marker command says why instead of adding one', () => {
    editInstance(instance().id);
    const n = root_().markers.length;
    act(() => getCommand('timeline.addMarker')!.run());
    expect(root_().markers).toHaveLength(n);
    expect(toasts.get().map((t) => t.message)).toContain('Markers and clips belong to the main scene. Go back out of the symbol first.');
  });
});
