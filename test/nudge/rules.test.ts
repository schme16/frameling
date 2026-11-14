import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing } from '../../src/core/doc';
import type { PathShape } from '../../src/core/format';
import { DRAWING_TOOLS, MAX_SHOWS, drawnNudgeShows, isFreshVectorPage, nudgesAllowed, drawsStraightAway, pageLineInk, pageLineShows, type DrawnInput, type PageLineInput } from '../../src/nudge/rules';

const box: PathShape = { id: 's1', type: 'path', paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }], fill: '#f00', stroke: null, opacity: 1 };

const page: PageLineInput = { quill: true, choice: 'on', harness: false, fresh: true, drawnOn: false, playing: false, stroking: false };
const drawn: DrawnInput = { quill: true, choice: 'on', harness: false, firstStroke: true, shown: 0, frames: 24, playing: false };

describe('an empty page', () => {
  it('is a new plain vector drawing with nothing on it', () => {
    expect(isFreshVectorPage(newDoc())).toBe(true);
    const d = newDoc();
    d.drawings.x = newVectorDrawing();
    expect(isFreshVectorPage(d)).toBe(true);
  });

  it('stops being empty with the first shape', () => {
    const d = newDoc();
    const dr = newVectorDrawing();
    dr.shapes.push(box);
    d.drawings[dr.id] = dr;
    expect(isFreshVectorPage(d)).toBe(false);
  });

  it('leaves pixel art, artboards and symbols to their own welcomes', () => {
    expect(isFreshVectorPage(newDoc({ pixel: { pixelSize: 8 } }))).toBe(false);
    const withPixelLayer = newDoc();
    withPixelLayer.layers.push(newPixelLayer('Px', 4));
    expect(isFreshVectorPage(withPixelLayer)).toBe(false);
    const withPixels = newDoc();
    const px = newPixelDrawing(4, 4);
    withPixels.drawings[px.id] = px;
    expect(isFreshVectorPage(withPixels)).toBe(false);
    expect(isFreshVectorPage({ ...newDoc(), artboards: [{ id: 'a', name: 'A', x: 0, y: 0, width: 10, height: 10 }] as never })).toBe(false);
    expect(isFreshVectorPage({ ...newDoc(), editing: [{ symbolId: 's', frame: 0 }] as never })).toBe(false);
  });
});

describe('the line on the page', () => {
  it('shows on a fresh page, once Quill and the choice both allow it', () => {
    expect(pageLineShows(page)).toBe(true);
  });

  it('goes with the first stroke and does not come back', () => {
    expect(pageLineShows({ ...page, fresh: false })).toBe(false);
    // Undo back to blank: the file has had its first stroke, so it stays gone.
    expect(pageLineShows({ ...page, fresh: true, drawnOn: true })).toBe(false);
  });

  it('goes the moment the pen touches down, before the stroke is finished', () => {
    expect(pageLineShows({ ...page, stroking: true })).toBe(false);
  });

  it('stays out of the way while playing', () => {
    expect(pageLineShows({ ...page, playing: true })).toBe(false);
  });

  it('stays quiet with Show Quill off, with its choice off, and in the screenshot harness', () => {
    expect(pageLineShows({ ...page, quill: false })).toBe(false);
    expect(pageLineShows({ ...page, choice: 'off' })).toBe(false);
    expect(pageLineShows({ ...page, harness: true })).toBe(false);
    expect(nudgesAllowed({ quill: true, choice: 'on', harness: false })).toBe(true);
  });

  it('names the tool only when it draws straight away', () => {
    for (const t of DRAWING_TOOLS) expect(drawsStraightAway(t)).toBe(true);
    for (const t of ['select', 'hand', 'zoom', 'eraser', '']) expect(drawsStraightAway(t)).toBe(false);
  });

  it('is dark ink on a light page and light ink on a dark one', () => {
    expect(pageLineInk('#ffffff')).toMatch(/^rgba\(40/);
    expect(pageLineInk(null)).toMatch(/^rgba\(40/);
    expect(pageLineInk('#101018')).toMatch(/^rgba\(245/);
    expect(pageLineInk('not a colour')).toMatch(/^rgba\(40/);
  });
});

describe("Quill's tip after the first drawing", () => {
  it('shows on the first stroke of a file', () => {
    expect(drawnNudgeShows(drawn)).toBe(true);
    expect(drawnNudgeShows({ ...drawn, firstStroke: false })).toBe(false);
  });

  it('is said a few times at most', () => {
    expect(drawnNudgeShows({ ...drawn, shown: MAX_SHOWS - 1 })).toBe(true);
    expect(drawnNudgeShows({ ...drawn, shown: MAX_SHOWS })).toBe(false);
  });

  it('needs somewhere to go: more than one frame, and not mid-play', () => {
    expect(drawnNudgeShows({ ...drawn, frames: 1 })).toBe(false);
    expect(drawnNudgeShows({ ...drawn, playing: true })).toBe(false);
  });

  it('is never said with Show Quill off or the choice off', () => {
    expect(drawnNudgeShows({ ...drawn, quill: false })).toBe(false);
    expect(drawnNudgeShows({ ...drawn, choice: 'off' })).toBe(false);
    expect(drawnNudgeShows({ ...drawn, harness: true })).toBe(false);
  });
});
