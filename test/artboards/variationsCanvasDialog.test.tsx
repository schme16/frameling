// @vitest-environment jsdom
// Resizing a variation itself through "Canvas size and speed" goes the same way as dragging its edge: the original's
// art stays put, a camera frames it, and the framing stays tracked so resizing the original frames it again.
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { CameraDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { setChoice } from '../../src/core/choices';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { openDocumentSettings } from '../../src/canvas/DocumentSettings';
import { goToArtboard, installArtboards, resizeArtboard } from '../../src/artboards/ops';
import { activeId, findArtboard } from '../../src/artboards/model';
import { makeVariationOf } from '../../src/artboards/variationOps';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const doc = () => store().get().doc;
const camOf = (id: string): CameraDrawing => {
  const a = findArtboard(doc(), id)!;
  const l = (a.content ?? doc()).layers.find((x) => x.kind === 'camera')!;
  return doc().drawings[l.cels[0].drawingId] as CameraDrawing;
};

/** Types a width into the open dialog (height follows, proportions are linked) and presses the main button. */
function resizeThroughDialog(width: number, fps?: number) {
  act(() => openDocumentSettings());
  const input = document.querySelector<HTMLInputElement>('input[aria-label^="Width"]')!;
  const set = (el: HTMLInputElement, v: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  act(() => set(input, String(width)));
  if (fps) act(() => set(document.querySelector<HTMLInputElement>('input[min="1"][max="120"]')!, String(fps)));
  act(() => document.querySelector<HTMLButtonElement>('.io-primary')!.click());
}

beforeEach(() => {
  document.body.innerHTML = '';
  setViewSettings({ throughCamera: false, throughBy: {} });
  setChoice('variations.frame', 'fill');
  const d = newDoc({ name: 'Hero', width: 200, height: 100, length: 4, fps: 12 });
  d.layers = [{ ...newVectorLayer('Body'), id: 'L1' }];
  resetStore(d);
});

describe('Canvas size on a variation', () => {
  it('re-frames the original in the cut, keeps the framing tracked, and the dialog is one undo step', async () => {
    installArtboards();
    const orig = activeId(doc());
    const v = (await makeVariationOf(orig, 'square'))!;
    expect(activeId(doc())).toBe(v);
    expect(doc().width).toBe(100);
    resizeThroughDialog(50);
    expect(doc().width).toBe(50);
    expect(doc().height).toBe(50);
    // The art did not change; the camera frames it for the new size, and the framing is tracked (it was not before this went the same way).
    expect(findArtboard(doc(), v)!.framing?.mode).toBe('fill');
    expect(camOf(v).view.zoom).toBeCloseTo(0.5, 5);
    expect(doc().layers.some((l) => l.id === 'L1')).toBe(true);
    // The original is left alone, and resizing it frames the cut again, because the framing is still tracked.
    goToArtboard(orig);
    expect(doc().width).toBe(200);
    resizeArtboard(orig, 400, 200);
    const a = findArtboard(doc(), v)!;
    expect(a.content!.width).toBe(50);
    expect(camOf(v).view.zoom).toBeCloseTo(0.25, 5);
    // Undo takes the original's resize back (the cut keeps the dialog's size), then the move to the original, then the dialog's own step.
    store().undo();
    expect(camOf(v).view.zoom).toBeCloseTo(0.5, 5);
    store().undo();
    store().undo();
    expect(activeId(doc())).toBe(v);
    expect(doc().width).toBe(100);
    expect(camOf(v).view.zoom).toBeCloseTo(1, 5);
  });

  it('page settings of the same dialog (speed) still apply in the same step', async () => {
    installArtboards();
    const v = (await makeVariationOf(activeId(doc()), 'square'))!;
    resizeThroughDialog(50, 24);
    expect(doc().fps).toBe(24);
    expect(doc().width).toBe(50);
    expect(findArtboard(doc(), v)!.framing).toBeDefined();
    store().undo();
    expect(doc().fps).toBe(12);
    expect(doc().width).toBe(100);
  });

  it('the original itself still goes the page way, reframing its cuts', async () => {
    installArtboards();
    const orig = activeId(doc());
    const v = (await makeVariationOf(orig, 'square'))!;
    goToArtboard(orig);
    resizeThroughDialog(400);
    expect(doc().width).toBe(400);
    expect(findArtboard(doc(), v)!.content!.width).toBe(100);
    expect(camOf(v).view.zoom).toBeCloseTo(0.5, 5);
  });

  it('a variation has no anchor picker (there is nothing to anchor) and says so; the original keeps it', async () => {
    installArtboards();
    const orig = activeId(doc());
    await makeVariationOf(orig, 'square');
    act(() => openDocumentSettings());
    expect(document.querySelector('.ds-anchor')).toBeNull();
    expect(document.querySelector('.ds-anchor-note')?.textContent).toMatch(/camera frames it/);
    act(() => document.querySelector<HTMLButtonElement>('.io-primary')!.click());
    document.body.innerHTML = '';
    goToArtboard(orig);
    act(() => openDocumentSettings());
    expect(document.querySelector('.ds-anchor')).not.toBeNull();
    expect(document.querySelector('.ds-anchor-note')?.textContent).toMatch(/Drawing stays at the/);
  });
});
