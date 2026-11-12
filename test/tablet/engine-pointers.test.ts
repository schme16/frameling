// @vitest-environment jsdom
// The canvas engine's pointer handling driven by synthetic pen, mouse and finger events: a seeded random sequence of
// presses, moves, lifts, cancels, Escape and tool changes. When every pointer is up again nothing may be left stuck
// (a stroke open, the eraser end's tool swap, a finger counted as down, palm rejection on).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CanvasEngine } from '../../src/canvas/engine';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import { registerTool, unregisterTool, type Tool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { resetPen, setToolPen } from '../../src/tablet/settings';
import { resetOffer } from '../../src/tablet/check/state';

const noop = () => undefined;
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? {} : k === 'measureText' ? () => ({ width: 0 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) : noop), set: () => true });

let root: HTMLElement;
let engine: CanvasEngine;
let stop: () => void;
let captured = new Set<number>();
let calls: string[] = [];
let brushOpen = 0;
let eraserOpen = 0;

const probe = (id: string, counter: () => void, un: () => void): Tool => ({
  id,
  label: id,
  icon: 'brush',
  layers: ['vector', 'pixel'],
  down: () => (counter(), calls.push(`${id}.down`)),
  move: () => void calls.push(`${id}.move`),
  up: () => (un(), calls.push(`${id}.up`)),
  cancel: () => (un(), calls.push(`${id}.cancel`)),
  hover: noop,
});

beforeEach(() => {
  resetPen();
  const doc = newDoc({ width: 200, height: 100 });
  doc.drawings = { dv: { ...newVectorDrawing(), id: 'dv' } };
  doc.layers[0].cels = [{ id: 'c1', drawingId: 'dv', start: 0, length: 24 }];
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, tool: 'brush' });
  calls = [];
  brushOpen = eraserOpen = 0;
  registerTool(probe('brush', () => brushOpen++, () => brushOpen--));
  registerTool(probe('eraser', () => eraserOpen++, () => eraserOpen--));
  HTMLCanvasElement.prototype.getContext = (() => ctx2d) as never;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe = noop;
    disconnect = noop;
  };
  root = document.createElement('div');
  const stage = document.createElement('div');
  const main = document.createElement('canvas');
  const overlay = document.createElement('canvas');
  root.append(stage, main, overlay);
  document.body.append(root);
  captured = new Set();
  Object.assign(root, {
    setPointerCapture: (id: number) => void captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => void captured.delete(id),
  });
  engine = new CanvasEngine({ root, stage, main, overlay });
  stop = engine.mount();
});

afterEach(() => {
  resetOffer();
  stop();
  root.remove();
  unregisterTool('brush');
  unregisterTool('eraser');
});

let clock = 1000;
function fire(type: string, o: { id: number; kind: 'pen' | 'mouse' | 'touch'; x?: number; y?: number; buttons?: number; button?: number; pressure?: number; target?: Element }) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: o.x ?? 50, clientY: o.y ?? 50, button: o.button ?? 0, buttons: o.buttons ?? 0 });
  Object.defineProperties(e, { pointerId: { value: o.id }, pointerType: { value: o.kind }, pressure: { value: o.pressure ?? 0.5 }, timeStamp: { value: (clock += 8) }, tiltX: { value: 0 }, tiltY: { value: 0 }, twist: { value: 0 } });
  (o.target ?? root).dispatchEvent(e);
  // A browser lets go of the pointer's capture itself once it lifts.
  if (type === 'pointerup' || type === 'pointercancel' || type === 'lostpointercapture') captured.delete(o.id);
}
const gestureOf = () => (engine as unknown as { gesture: unknown }).gesture;
const touchesOf = () => (engine as unknown as { touches: Map<number, unknown> }).touches.size;

describe('the pen', () => {
  it('a press, a drag and a lift is one stroke', () => {
    fire('pointerdown', { id: 7, kind: 'pen', buttons: 1 });
    fire('pointermove', { id: 7, kind: 'pen', x: 60, buttons: 1 });
    fire('pointerup', { id: 7, kind: 'pen', x: 70 });
    expect(calls).toEqual(['brush.down', 'brush.move', 'brush.up']);
    expect(gestureOf()).toBeNull();
  });

  it('the eraser end swaps to the eraser for the press and gives the tool back', () => {
    fire('pointerdown', { id: 7, kind: 'pen', button: 5, buttons: 32 });
    expect(calls).toEqual(['eraser.down']);
    expect(store().get().ui.tool).toBe('eraser');
    fire('pointerup', { id: 7, kind: 'pen', button: 5 });
    expect(store().get().ui.tool).toBe('brush');
    expect(gestureOf()).toBeNull();
  });

  it('Escape drops the stroke and a later lift draws nothing more, even with the stabilizer on', () => {
    setToolPen('brush', { stabilizer: 80, stabMode: 'string' });
    fire('pointerdown', { id: 7, kind: 'pen', buttons: 1 });
    fire('pointermove', { id: 7, kind: 'pen', x: 90, buttons: 1 });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(calls.at(-1)).toBe('brush.cancel');
    const n = calls.length;
    fire('pointermove', { id: 7, kind: 'pen', x: 120, buttons: 1 });
    fire('pointerup', { id: 7, kind: 'pen', x: 130 });
    expect(calls.length).toBe(n);
    expect(brushOpen).toBe(0);
  });

  it('a lifted pen leaves no stroke open when the stabilizer walks the rest of the way', () => {
    setToolPen('brush', { stabilizer: 80, stabMode: 'string' });
    fire('pointerdown', { id: 7, kind: 'pen', buttons: 1 });
    fire('pointermove', { id: 7, kind: 'pen', x: 150, buttons: 1 });
    fire('pointerup', { id: 7, kind: 'pen', x: 150 });
    expect(calls.filter((c) => c === 'brush.up')).toHaveLength(1);
    expect(calls.at(-1)).toBe('brush.up');
    expect(brushOpen).toBe(0);
  });
});

describe('a release that never comes', () => {
  const strokeOpen = () => (gestureOf() as { kind?: string } | null)?.kind === 'tool';

  it('lost pointer capture ends the stroke and keeps what was drawn', () => {
    fire('pointerdown', { id: 7, kind: 'pen', buttons: 1 });
    fire('pointermove', { id: 7, kind: 'pen', x: 60, buttons: 1 });
    fire('lostpointercapture', { id: 7, kind: 'pen' });
    expect(calls).toEqual(['brush.down', 'brush.move', 'brush.up']);
    expect(gestureOf()).toBeNull();
    expect(captured.size).toBe(0);
    // Moves that follow draw nothing, and the pen no longer counts as touching: a finger works once it has gone.
    fire('pointermove', { id: 7, kind: 'pen', x: 80, buttons: 0 });
    expect(calls).toHaveLength(3);
    fire('pointerleave', { id: 7, kind: 'pen' });
    clock += 1000;
    fire('pointerdown', { id: 2, kind: 'touch', buttons: 1 });
    expect(calls.at(-1)).toBe('brush.down');
    fire('pointerup', { id: 2, kind: 'touch' });
  });

  it('a lost capture after a normal release changes nothing', () => {
    fire('pointerdown', { id: 1, kind: 'mouse', buttons: 1 });
    fire('pointerup', { id: 1, kind: 'mouse' });
    fire('lostpointercapture', { id: 1, kind: 'mouse' });
    expect(calls).toEqual(['brush.down', 'brush.up']);
  });

  it('the window losing focus mid-stroke ends it, and forgets fingers', () => {
    fire('pointerdown', { id: 1, kind: 'mouse', buttons: 1 });
    fire('pointermove', { id: 1, kind: 'mouse', x: 90, buttons: 1 });
    window.dispatchEvent(new Event('blur'));
    expect(calls).toEqual(['brush.down', 'brush.move', 'brush.up']);
    expect(gestureOf()).toBeNull();
    expect(brushOpen).toBe(0);
    fire('pointerdown', { id: 21, kind: 'touch', buttons: 1 });
    expect(touchesOf()).toBe(1);
    window.dispatchEvent(new Event('blur'));
    expect(touchesOf()).toBe(0);
  });

  it('a mouse move with no button down ends the stroke where it was', () => {
    fire('pointerdown', { id: 1, kind: 'mouse', buttons: 1 });
    fire('pointermove', { id: 1, kind: 'mouse', x: 90, buttons: 1 });
    fire('pointermove', { id: 1, kind: 'mouse', x: 150, buttons: 0 });
    expect(calls).toEqual(['brush.down', 'brush.move', 'brush.up']);
    expect(strokeOpen()).toBe(false);
    fire('pointermove', { id: 1, kind: 'mouse', x: 160, buttons: 0 });
    expect(calls).toHaveLength(3);
  });

  it('a pen move with no button down ends the stroke too', () => {
    fire('pointerdown', { id: 7, kind: 'pen', buttons: 1 });
    fire('pointermove', { id: 7, kind: 'pen', x: 90, buttons: 0 });
    expect(calls).toEqual(['brush.down', 'brush.up']);
    expect(brushOpen).toBe(0);
  });

  it('a tip lifted with the barrel button still held ends the stroke instead of drawing on hover', () => {
    fire('pointerdown', { id: 7, kind: 'pen', buttons: 1, pressure: 0.6 });
    fire('pointermove', { id: 7, kind: 'pen', x: 70, buttons: 1, pressure: 0.6 });
    fire('pointermove', { id: 7, kind: 'pen', x: 80, buttons: 2, pressure: 0 });
    expect(calls).toEqual(['brush.down', 'brush.move', 'brush.up']);
    fire('pointermove', { id: 7, kind: 'pen', x: 90, buttons: 2, pressure: 0 });
    fire('pointermove', { id: 7, kind: 'pen', x: 100, buttons: 2, pressure: 0 });
    expect(calls).toHaveLength(3);
    expect(gestureOf()).toBeNull();
  });

  it('a first sample of 0 pressure does not end a stroke that has not had any yet', () => {
    fire('pointerdown', { id: 7, kind: 'pen', buttons: 1, pressure: 0 });
    fire('pointermove', { id: 7, kind: 'pen', x: 70, buttons: 1, pressure: 0 });
    expect(strokeOpen()).toBe(true);
    fire('pointermove', { id: 7, kind: 'pen', x: 75, buttons: 1, pressure: 0.4 });
    fire('pointermove', { id: 7, kind: 'pen', x: 80, buttons: 1, pressure: 0 });
    expect(strokeOpen()).toBe(false);
  });

  it('a tool drawn by hovering keeps going with no button and no pressure', () => {
    registerTool({ ...probe('floater', () => brushOpen++, () => brushOpen--), hoverDrag: true });
    try {
      store().setUi({ tool: 'floater' });
      fire('pointerdown', { id: 7, kind: 'pen', buttons: 1, pressure: 0.5 });
      fire('pointermove', { id: 7, kind: 'pen', x: 70, buttons: 0, pressure: 0 });
      expect(strokeOpen()).toBe(true);
      fire('pointerup', { id: 7, kind: 'pen' });
      expect(calls).toEqual(['floater.down', 'floater.move', 'floater.up']);
    } finally {
      unregisterTool('floater');
    }
  });
});

describe('fingers and palms', () => {
  it('a finger is ignored while the pen is near and counts again after it has gone', () => {
    fire('pointermove', { id: 7, kind: 'pen', x: 20 });
    fire('pointerdown', { id: 1, kind: 'touch', buttons: 1 });
    expect(calls).toEqual([]);
    fire('pointerup', { id: 1, kind: 'touch' });
    fire('pointerleave', { id: 7, kind: 'pen' });
    clock += 1000;
    fire('pointerdown', { id: 2, kind: 'touch', buttons: 1 });
    expect(calls).toEqual(['brush.down']);
    fire('pointerup', { id: 2, kind: 'touch' });
    expect(touchesOf()).toBe(0);
    expect(gestureOf()).toBeNull();
  });
});

// ---------------------------------------------------------------- seeded random operations

type Dev = { id: number; kind: 'pen' | 'mouse' | 'touch' };
describe('random pointer sequences (seeded)', () => {
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  for (const seed of Array.from({ length: 60 }, (_, i) => i + 1)) {
    it(`seed ${seed}: once every pointer is up nothing is left stuck`, () => {
      const r = rng(seed * 7919);
      const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
      const devs: Dev[] = [{ id: 1, kind: 'mouse' }, { id: 7, kind: 'pen' }, { id: 21, kind: 'touch' }, { id: 22, kind: 'touch' }, { id: 23, kind: 'touch' }];
      const down = new Map<number, { buttons: number }>();
      setToolPen('brush', { stabilizer: pick([0, 50, 90]), stabMode: pick(['string', 'average'] as const) });
      const log: string[] = [];
      for (let step = 0; step < 120; step++) {
        const d = pick(devs);
        const x = 10 + Math.floor(r() * 180);
        const op = pick(['down', 'down', 'move', 'move', 'move', 'up', 'up', 'cancel', 'esc', 'hover', 'eraser', 'barrel', 'leave', 'wait', 'lost', 'blur']);
        log.push(`${op}:${d.kind}${d.id}`);
        if (op === 'down' && !down.has(d.id)) {
          const buttons = d.kind === 'pen' ? pick([1, 1, 1, 2, 4, 32]) : 1;
          const button = d.kind === 'pen' && buttons === 32 ? 5 : buttons === 2 ? 2 : buttons === 4 ? 1 : 0;
          down.set(d.id, { buttons });
          fire('pointerdown', { ...d, x, buttons, button });
        } else if (op === 'eraser' && d.kind === 'pen' && !down.has(d.id)) {
          down.set(d.id, { buttons: 32 });
          fire('pointerdown', { ...d, x, buttons: 32, button: 5 });
        } else if (op === 'barrel' && d.kind === 'pen' && !down.has(d.id)) {
          down.set(d.id, { buttons: 2 });
          fire('pointerdown', { ...d, x, buttons: 2, button: 2 });
        } else if (op === 'move') fire('pointermove', { ...d, x, buttons: down.get(d.id)?.buttons ?? 0, pressure: d.kind === 'pen' ? pick([0.5, 0.5, 0.5, 0]) : 0.5 });
        else if (op === 'lost') fire('lostpointercapture', { ...d });
        else if (op === 'blur') window.dispatchEvent(new Event('blur'));
        else if (op === 'hover') fire('pointermove', { ...d, x, buttons: 0 });
        else if (op === 'up' && down.has(d.id)) {
          down.delete(d.id);
          fire('pointerup', { ...d, x });
        } else if (op === 'cancel' && down.has(d.id)) {
          down.delete(d.id);
          fire('pointercancel', { ...d, x });
        } else if (op === 'esc') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        else if (op === 'leave' && d.kind === 'pen') fire('pointerleave', { ...d });
        else if (op === 'wait') clock += pick([100, 500, 12000]);
        // At every step: a stroke is open exactly while the engine holds a tool gesture, and never twice.
        const g = gestureOf() as { kind: string; tool?: { id: string } } | null;
        const open = brushOpen + eraserOpen;
        expect(open, `step ${step} ${log.join(' ')}`).toBe(g?.kind === 'tool' && ['brush', 'eraser'].includes(g.tool!.id) ? 1 : 0);
        if (g?.kind !== 'tool') expect(store().get().ui.tool, `step ${step} ${log.join(' ')}`).toBe('brush');
      }
      // Everything lifted.
      for (const [id] of [...down]) {
        const d = devs.find((v) => v.id === id)!;
        fire('pointerup', { ...d });
        down.delete(id);
      }
      const where = `after: ${log.join(' ')}`;
      expect(gestureOf(), where).toBeNull();
      expect(touchesOf(), where).toBe(0);
      expect(brushOpen, where).toBe(0);
      expect(eraserOpen, where).toBe(0);
      expect(store().get().ui.tool, where).toBe('brush');
      expect(captured.size, where).toBe(0);
      // And the canvas answers a fresh press.
      clock += 20000;
      calls.length = 0;
      fire('pointerdown', { id: 7, kind: 'pen', buttons: 1 });
      fire('pointerup', { id: 7, kind: 'pen' });
      expect(calls.filter((c) => c !== 'brush.move'), where).toEqual(['brush.down', 'brush.up']);
      // Palm rejection lets go too: with the pen gone for a while, a finger draws again.
      clock += 20000;
      calls.length = 0;
      fire('pointerdown', { id: 30, kind: 'touch', buttons: 1 });
      fire('pointerup', { id: 30, kind: 'touch' });
      expect(calls.filter((c) => c !== 'brush.move'), where).toEqual(['brush.down', 'brush.up']);
    });
  }
});

describe('the pen check offer', () => {
  it('never lands in the middle of a stroke, and comes after the lift instead', async () => {
    const { vi } = await import('vitest');
    const { overlays } = await import('../../src/ui/overlays');
    const { OFFER_DELAY_MS, resetOffer, setCheckMemory } = await import('../../src/tablet/check/state');
    vi.useFakeTimers();
    try {
      resetOffer();
      setCheckMemory({ done: false, declined: false });
      overlays.set((o) => ({ ...o, penCheck: undefined }));
      fire('pointermove', { id: 7, kind: 'pen', x: 40 });
      fire('pointerdown', { id: 7, kind: 'pen', buttons: 1 });
      vi.advanceTimersByTime(OFFER_DELAY_MS + 100);
      expect(overlays.get().penCheck).toBeUndefined();
      fire('pointerup', { id: 7, kind: 'pen' });
      vi.advanceTimersByTime(OFFER_DELAY_MS + 100);
      expect(overlays.get().penCheck).toBe('offer');
    } finally {
      overlays.set((o) => ({ ...o, penCheck: undefined }));
      resetOffer();
      vi.useRealTimers();
    }
  });
});
