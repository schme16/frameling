// @vitest-environment jsdom
// The canvas engine with the view turned or flipped: a pointer on the screen must still reach the document point the
// person is looking at, and turning must not change the document.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CanvasEngine } from '../../src/canvas/engine';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import { registerTool, unregisterTool, type Tool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { getTurn, resetTurn, setTurn } from '../../src/canvas/turn';

const noop = () => undefined;
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? {} : k === 'measureText' ? () => ({ width: 0 }) : () => undefined) });

let root: HTMLElement;
let turnBox: HTMLElement;
let stop: () => void;
let downs: { x: number; y: number }[] = [];

const probe: Tool = {
  id: 'brush',
  label: 'brush',
  icon: 'brush',
  layers: ['vector', 'pixel'],
  down: (p) => void downs.push({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }),
  move: noop,
  up: noop,
  cancel: noop,
  hover: noop,
};

function tap(x: number, y: number): void {
  const mk = (type: string) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
    Object.defineProperties(e, { pointerId: { value: 1 }, pointerType: { value: 'mouse' }, pressure: { value: 0.5 } });
    root.dispatchEvent(e);
  };
  mk('pointerdown');
  mk('pointerup');
}

beforeEach(() => {
  const doc = newDoc({ width: 200, height: 100 });
  doc.drawings = { dv: { ...newVectorDrawing(), id: 'dv' } };
  doc.layers[0].cels = [{ id: 'c1', drawingId: 'dv', start: 0, length: 24 }];
  resetStore(doc);
  resetTurn();
  store().setUi({ activeLayerId: doc.layers[0].id, tool: 'brush' });
  downs = [];
  registerTool(probe);
  HTMLCanvasElement.prototype.getContext = (() => ctx2d) as never;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe = noop;
    disconnect = noop;
  };
  root = document.createElement('div');
  turnBox = document.createElement('div');
  const stage = document.createElement('div');
  const main = document.createElement('canvas');
  const overlay = document.createElement('canvas');
  turnBox.append(stage, main, overlay);
  root.append(turnBox);
  Object.defineProperty(root, 'clientWidth', { value: 800 });
  Object.defineProperty(root, 'clientHeight', { value: 600 });
  document.body.append(root);
  Object.assign(root, { setPointerCapture: noop, hasPointerCapture: () => false, releasePointerCapture: noop });
  const engine = new CanvasEngine({ root, turn: turnBox, stage, main, overlay });
  stop = engine.mount();
});

afterEach(() => {
  stop();
  root.remove();
  unregisterTool('brush');
  resetTurn();
});

describe('a turned view', () => {
  it('tools see the same page point under the middle of the screen, however it is turned', () => {
    for (const t of [{ angle: 0, flip: false }, { angle: 30, flip: false }, { angle: 90, flip: true }, { angle: 0, flip: true }]) {
      setTurn(t);
      downs = [];
      tap(400, 300);
      expect(downs[0].x).toBeCloseTo(100, 0);
      expect(downs[0].y).toBeCloseTo(50, 0);
    }
  });

  it('a flipped view reaches the other side of the page', () => {
    tap(300, 300);
    const straight = downs[0];
    setTurn({ angle: 0, flip: true });
    downs = [];
    tap(500, 300);
    expect(downs[0].x).toBeCloseTo(straight.x, 0);
    expect(downs[0].y).toBeCloseTo(straight.y, 0);
  });

  it('a quarter turn clockwise: the top of the page is now on the right', () => {
    setTurn({ angle: 90, flip: false });
    const z = store().get().ui.zoom;
    downs = [];
    // The page is 200 x 100; its top-middle is 50 above the centre of the page, so 50 * zoom to the right of the screen's middle.
    tap(400 + 50 * z, 300);
    expect(downs[0].x).toBeCloseTo(100, 0);
    expect(downs[0].y).toBeCloseTo(0, 0);
  });

  it('puts the CSS turn on the layers box, and takes it off again', () => {
    setTurn({ angle: 30, flip: true });
    expect(turnBox.style.transform).toBe('scaleX(-1) rotate(30deg)');
    resetTurn();
    expect(turnBox.style.transform).toBe('');
    expect(getTurn()).toEqual({ angle: 0, flip: false });
  });

  it('never changes the document', () => {
    const before = store().get().doc;
    setTurn({ angle: 45, flip: true });
    tap(100, 100);
    resetTurn();
    expect(store().get().doc).toBe(before);
  });

  it('a new document starts straight', () => {
    setTurn({ angle: 45, flip: true });
    store().load(newDoc({ width: 50, height: 50 }));
    expect(getTurn()).toEqual({ angle: 0, flip: false });
  });
});
