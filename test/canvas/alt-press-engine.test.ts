// @vitest-environment jsdom
// Alt and click picks a colour, Alt and drag turns the view, through the real canvas engine with real pointer events.
// A pick must never be lost to a stray pixel of movement, and a drag must never leave a pick behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasEngine } from '../../src/canvas/engine';
import { newDoc, newPixelDrawing, newVectorDrawing } from '../../src/core/doc';
import { registerTool, unregisterTool, type Tool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { getTurn, resetTurn } from '../../src/canvas/turn';
import { TURN_SLOP_MOUSE, TURN_SLOP_PEN } from '../../src/canvas/altPress';
import { tempEyedropperTool } from '../../src/tools/eyedropper';

const noop = () => undefined;
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? {} : k === 'measureText' ? () => ({ width: 0 }) : () => undefined) });

let root: HTMLElement;
let stop: () => void;
let toolDowns = 0;
let picks = 0;

const pencil: Tool = {
  id: 'pencil',
  label: 'pencil',
  icon: 'pencil',
  layers: ['vector', 'pixel'],
  down: () => void toolDowns++,
  move: noop,
  up: noop,
  cancel: noop,
  hover: noop,
};

type Kind = 'pointerdown' | 'pointermove' | 'pointerup';
function fire(type: Kind, x: number, y: number, o: { pointerType?: string; alt?: boolean; shift?: boolean } = {}): void {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, altKey: o.alt ?? true, shiftKey: o.shift ?? false });
  Object.defineProperties(e, { pointerId: { value: 1 }, pointerType: { value: o.pointerType ?? 'mouse' }, pressure: { value: type === 'pointerup' ? 0 : 0.5 } });
  root.dispatchEvent(e);
}

function setup(layerKind: 'pixel' | 'vector'): void {
  const doc = newDoc({ width: 200, height: 100 });
  doc.drawings = { d: layerKind === 'pixel' ? { ...newPixelDrawing(16, 16), id: 'd' } : { ...newVectorDrawing(), id: 'd' } } as never;
  doc.layers[0].kind = layerKind as never;
  doc.layers[0].cels = [{ id: 'c1', drawingId: 'd', start: 0, length: 24 }];
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, tool: 'pencil' });
}

beforeEach(() => {
  resetTurn();
  toolDowns = 0;
  picks = 0;
  vi.spyOn(tempEyedropperTool, 'down').mockImplementation(() => void picks++);
  registerTool(pencil);
  HTMLCanvasElement.prototype.getContext = (() => ctx2d) as never;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe = noop;
    disconnect = noop;
  };
  root = document.createElement('div');
  const turnBox = document.createElement('div');
  turnBox.append(document.createElement('div'), document.createElement('canvas'), document.createElement('canvas'));
  root.append(turnBox);
  Object.defineProperty(root, 'clientWidth', { value: 800 });
  Object.defineProperty(root, 'clientHeight', { value: 600 });
  document.body.append(root);
  Object.assign(root, { setPointerCapture: noop, hasPointerCapture: () => false, releasePointerCapture: noop });
  const [stage, main, overlay] = turnBox.children as unknown as [HTMLElement, HTMLCanvasElement, HTMLCanvasElement];
  stop = new CanvasEngine({ root, turn: turnBox, stage, main, overlay }).mount();
});

afterEach(() => {
  stop();
  root.remove();
  unregisterTool('pencil');
  resetTurn();
  vi.restoreAllMocks();
});

describe('Alt and click on a pixel layer', () => {
  beforeEach(() => setup('pixel'));

  it('picks a colour when the pointer does not move', () => {
    fire('pointerdown', 500, 300);
    expect(picks).toBe(0); // it waits to see whether this is a drag
    fire('pointerup', 500, 300);
    expect(picks).toBe(1);
    expect(toolDowns).toBe(0);
    expect(getTurn().angle).toBe(0);
  });

  it('still picks when a shaky hand wobbles inside the distance, then lets go', () => {
    fire('pointerdown', 500, 300);
    for (const [dx, dy] of [[2, 1], [-3, 2], [TURN_SLOP_MOUSE, 0], [0, -TURN_SLOP_MOUSE], [-4, -4], [1, 1]]) fire('pointermove', 500 + dx, 300 + dy);
    fire('pointerup', 501, 301);
    expect(picks).toBe(1);
    expect(getTurn().angle).toBe(0);
  });

  it('turns, and picks nothing, once the pointer goes past the distance', () => {
    fire('pointerdown', 700, 300);
    fire('pointermove', 700, 300 + TURN_SLOP_MOUSE + 2);
    fire('pointermove', 690, 400);
    fire('pointermove', 600, 500);
    fire('pointerup', 600, 500);
    expect(picks).toBe(0);
    expect(toolDowns).toBe(0);
    expect(getTurn().angle).toBeGreaterThan(0);
  });

  it('keeps turning, not picking, if the pointer comes back to where it started', () => {
    fire('pointerdown', 700, 300);
    fire('pointermove', 700, 340);
    fire('pointermove', 700, 300);
    fire('pointerup', 700, 300);
    expect(picks).toBe(0);
  });

  it('a pen picks within its own, larger distance and turns past it', () => {
    fire('pointerdown', 500, 300, { pointerType: 'pen' });
    fire('pointermove', 500 + TURN_SLOP_PEN, 300, { pointerType: 'pen' });
    fire('pointerup', 500, 300, { pointerType: 'pen' });
    expect(picks).toBe(1);
    fire('pointerdown', 700, 300, { pointerType: 'pen' });
    fire('pointermove', 700, 300 + TURN_SLOP_PEN + 3, { pointerType: 'pen' });
    fire('pointermove', 650, 450, { pointerType: 'pen' });
    fire('pointerup', 650, 450, { pointerType: 'pen' });
    expect(picks).toBe(1);
    expect(getTurn().angle).not.toBe(0);
  });

  it('the turn follows the pointer round the middle of the window', () => {
    // The window's middle is (400, 300). From straight right of it to straight below it is a quarter turn clockwise,
    // less the few degrees the pointer had already gone when it passed the small distance and the drag began.
    fire('pointerdown', 700, 300);
    fire('pointermove', 700, 330);
    fire('pointermove', 400, 600);
    fire('pointerup', 400, 600);
    expect(getTurn().angle).toBeCloseTo(90 - (Math.atan(30 / 300) * 180) / Math.PI, 1);
  });

  it('Shift while dragging gives 15 degree steps', () => {
    fire('pointerdown', 700, 300);
    fire('pointermove', 700, 330, { shift: true });
    fire('pointermove', 700, 330 + 60, { shift: true });
    fire('pointerup', 700, 390, { shift: true });
    expect(getTurn().angle % 15).toBe(0);
  });

  it('no Alt, no waiting: the tool just draws', () => {
    fire('pointerdown', 500, 300, { alt: false });
    expect(toolDowns).toBe(1);
    fire('pointerup', 500, 300, { alt: false });
    expect(picks).toBe(0);
  });
});

describe('Alt and click on a vector layer', () => {
  beforeEach(() => setup('vector'));

  it('a click is made as the tool takes it, a drag turns the view and draws nothing', () => {
    fire('pointerdown', 500, 300);
    fire('pointerup', 500, 300);
    expect(toolDowns).toBe(1);
    expect(picks).toBe(0);
    fire('pointerdown', 700, 300);
    fire('pointermove', 700, 340);
    fire('pointermove', 600, 450);
    fire('pointerup', 600, 450);
    expect(toolDowns).toBe(1);
    expect(getTurn().angle).toBeGreaterThan(0);
  });
});

describe('tools that use Alt themselves keep it', () => {
  it('a rectangle drag with Alt (from the middle) does not turn the view', () => {
    setup('vector');
    const rect: Tool = { ...pencil, id: 'rect' };
    registerTool(rect);
    store().setUi({ tool: 'rect' });
    fire('pointerdown', 700, 300);
    expect(toolDowns).toBe(1);
    fire('pointermove', 700, 400);
    fire('pointerup', 700, 400);
    expect(getTurn().angle).toBe(0);
    unregisterTool('rect');
  });
});
