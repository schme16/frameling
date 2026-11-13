import { afterEach, describe, expect, it } from 'vitest';
import '../../src/canvas/choices';
import { currentChoice, getChoiceDef, setChoice, setChoiceAsker, withChoice } from '../../src/core/choices';
import { SPACE_TAP_MS, SpaceTap, wheelIntent, zoomStep, type WheelLike } from '../../src/canvas/input';
import { wheelZoomFactor } from '../../src/canvas/view';

const wheel = (over: Partial<WheelLike> = {}): WheelLike => ({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...over });

describe('wheel', () => {
  it('zooms with a plain wheel in zoom mode, and scrolls in scroll mode', () => {
    expect(wheelIntent(wheel(), 'zoom').kind).toBe('zoom');
    expect(wheelIntent(wheel(), 'scroll')).toEqual({ kind: 'pan', dx: 0, dy: 100 });
  });
  it('ctrl and pinch always zoom', () => {
    expect(wheelIntent(wheel({ ctrlKey: true }), 'zoom').kind).toBe('zoom');
    expect(wheelIntent(wheel({ ctrlKey: true }), 'scroll').kind).toBe('zoom');
    expect(wheelIntent(wheel({ metaKey: true, deltaY: -3 }), 'scroll').kind).toBe('zoom');
  });
  it('shift+wheel scrolls sideways in both modes', () => {
    expect(wheelIntent(wheel({ shiftKey: true }), 'zoom')).toEqual({ kind: 'pan', dx: 100, dy: 0 });
    expect(wheelIntent(wheel({ shiftKey: true }), 'scroll')).toEqual({ kind: 'pan', dx: 100, dy: 0 });
  });
  it('two-finger trackpad scrolling (it has sideways movement) pans rather than zooms', () => {
    expect(wheelIntent(wheel({ deltaX: 4, deltaY: 9 }), 'zoom')).toEqual({ kind: 'pan', dx: 4, dy: 9 });
  });
  it('scales line and page deltas for panning', () => {
    expect(wheelIntent(wheel({ deltaMode: 1, deltaY: 3 }), 'scroll')).toEqual({ kind: 'pan', dx: 0, dy: 48 });
  });
});

describe('space tap', () => {
  it('a quick press and release is a tap', () => {
    const t = new SpaceTap();
    t.press(1000);
    expect(t.release(1000 + SPACE_TAP_MS - 1)).toBe(true);
  });
  it('a slow press is not', () => {
    const t = new SpaceTap();
    t.press(1000);
    expect(t.release(1000 + SPACE_TAP_MS + 50)).toBe(false);
  });
  it('key repeat does not restart the clock', () => {
    const t = new SpaceTap();
    t.press(1000);
    t.press(1150);
    t.press(1300);
    expect(t.release(1310)).toBe(false);
  });
  it('a drag or another key spoils the tap, and the next press starts clean', () => {
    const t = new SpaceTap();
    t.press(0);
    t.spoil();
    expect(t.release(50)).toBe(false);
    t.press(100);
    expect(t.release(150)).toBe(true);
  });
  it('a release with no press is not a tap', () => {
    expect(new SpaceTap().release(5)).toBe(false);
  });
});

describe('the canvas choices', () => {
  afterEach(() => {
    setChoice('canvas.spaceTap', undefined);
    setChoice('canvas.wheel', undefined);
    setChoiceAsker(null);
  });

  it('are registered with the agreed defaults', () => {
    const wheelDef = getChoiceDef('canvas.wheel')!;
    expect(wheelDef.default).toBe('zoom');
    expect(wheelDef.silent).toBe(true);
    expect(wheelDef.options.map((o) => o.value)).toEqual(['zoom', 'scroll']);
    const tapDef = getChoiceDef('canvas.spaceTap')!;
    expect(tapDef.default).toBe('play');
    expect(tapDef.silent).toBeFalsy();
    expect(tapDef.options.map((o) => o.value)).toEqual(['play', 'pan-only']);
    expect(currentChoice('canvas.wheel')).toBe('zoom');
  });

  it('a remembered wheel preference is read straight away', () => {
    setChoice('canvas.wheel', 'scroll');
    expect(currentChoice('canvas.wheel')).toBe('scroll');
  });

  it('space tap acts at once when remembered, and asks first when not', async () => {
    const seen: string[] = [];
    setChoice('canvas.spaceTap', 'pan-only');
    withChoice('canvas.spaceTap', (v) => seen.push(v));
    expect(seen).toEqual(['pan-only']);
    setChoice('canvas.spaceTap', undefined);
    setChoiceAsker(async () => ({ value: 'play', remember: true }));
    withChoice('canvas.spaceTap', (v) => seen.push(v));
    expect(seen).toEqual(['pan-only']);
    await new Promise((r) => setTimeout(r));
    expect(seen).toEqual(['pan-only', 'play']);
  });
});

describe('three sizes of zoom step', () => {
  const ev = (o: Partial<WheelLike> = {}): WheelLike => ({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...o });

  it('Alt takes careful steps, whichever way the wheel is set', () => {
    expect(zoomStep(ev({ altKey: true }), 'zoom')).toBe('fine');
    expect(zoomStep(ev({ altKey: true, ctrlKey: true }), 'scroll')).toBe('fine');
  });

  it('a Ctrl that was not needed to zoom takes big ones', () => {
    expect(zoomStep(ev({ ctrlKey: true }), 'zoom')).toBe('coarse');
    // With the wheel set to scroll, Ctrl is what starts the zoom, so it stays the usual size.
    expect(zoomStep(ev({ ctrlKey: true }), 'scroll')).toBe('normal');
    expect(zoomStep(ev({ ctrlKey: true, shiftKey: true }), 'scroll')).toBe('coarse');
  });

  it('a plain wheel is the usual size, and the intent carries it', () => {
    expect(zoomStep(ev(), 'zoom')).toBe('normal');
    const i = wheelIntent(ev({ altKey: true }), 'zoom');
    expect(i).toEqual({ kind: 'zoom', factorDelta: 100, step: 'fine' });
  });

  it('a careful step moves less than usual, and a big one more', () => {
    const fine = wheelZoomFactor(-100, 0, 'fine');
    const normal = wheelZoomFactor(-100, 0);
    const coarse = wheelZoomFactor(-100, 0, 'coarse');
    expect(fine).toBeLessThan(normal);
    expect(normal).toBeLessThan(coarse);
    // A trackpad pinch keeps its own size: its fingers are already careful.
    expect(wheelZoomFactor(-8, 0, 'coarse')).toBe(wheelZoomFactor(-8, 0));
  });
});
