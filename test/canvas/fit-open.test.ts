// Opening a document, or "Fit all", leaves the page (or every artboard) whole and centred with margins.
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { addArtboard, allBounds } from '../../src/artboards/model';
import { allBoardsView, fitAllArtboards } from '../../src/artboards/ops';
import { fit, getView, setViewport } from '../../src/canvas/controller';
import { fitRectView } from '../../src/canvas/view';

describe('fitting a box of the document', () => {
  it('shows it whole, centred, with the margin and the room for names kept free', () => {
    const v = fitRectView({ x: 0, y: 0, w: 2000, h: 500 }, 900, 600, 48, 28);
    expect(v.zoom).toBeCloseTo((900 - 96) / 2000);
    // Left and right margins match, and the top margin holds the names.
    expect(v.panX).toBeCloseTo(900 - 2000 * v.zoom - v.panX);
    const top = v.panY;
    const bottom = 600 - (v.panY + 500 * v.zoom);
    expect(top - bottom).toBeCloseTo(28);
    expect(Math.min(v.panX, top - 28, bottom)).toBeGreaterThanOrEqual(48 - 1e-6);
  });
});

describe('several artboards', () => {
  const two = () => {
    const doc = newDoc({ width: 1280, height: 720 });
    addArtboard(doc, { width: 1280, height: 720 });
    return doc;
  };

  it('are all in view, with a margin all round, when a document opens or Fit all is pressed', () => {
    const doc = two();
    const v = allBoardsView(doc, { w: 884, h: 544 })!;
    const b = allBounds(doc);
    const left = v.panX + b.x * v.zoom;
    const right = 884 - (v.panX + (b.x + b.w) * v.zoom);
    expect(left).toBeGreaterThanOrEqual(47.9);
    expect(right).toBeGreaterThanOrEqual(47.9);
    expect(left).toBeCloseTo(right);
    expect(v.panY + b.y * v.zoom).toBeGreaterThanOrEqual(48);
    expect(544 - (v.panY + (b.y + b.h) * v.zoom)).toBeGreaterThanOrEqual(47.9);
  });

  it('a file with one board has no all-boards view (the plain page fit is used)', () => {
    expect(allBoardsView(newDoc(), { w: 900, h: 600 })).toBeNull();
  });

  it('the automatic fit shows all boards, the Fit command still fits the open page', () => {
    const s = resetStore(two());
    setViewport({ w: 884, h: 544, dpr: 1 });
    fit(true);
    const all = getView();
    expect(all.zoom).toBeLessThan(0.4);
    fit();
    expect(getView().zoom).toBeGreaterThan(0.6);
    fitAllArtboards();
    expect(getView().zoom).toBeCloseTo(all.zoom);
    expect(s.get().doc.artboards).toHaveLength(2);
  });
});

describe('opening a document', () => {
  it('counts every load, so the canvas refits even when it is the same file again', () => {
    const s = resetStore(newDoc());
    const doc = s.get().doc;
    const before = s.loads;
    s.load(doc);
    s.load(doc);
    expect(s.loads).toBe(before + 2);
  });
});
