import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStore } from '../../src/core/store';
import { setChoice } from '../../src/core/choices';
import { acceptTweenOffer, closeTweenOffer, dismissTweenOffer, installTweenOffer, offerTweenAt, resetTweenOffer, tweenOffer, tweenOfferAt } from '../../src/timeline/tweenOffer';
import { docWith } from './helpers';
import type { Doc, PathShape } from '../../src/core/format';

let n = 0;
function newRect(): PathShape {
  const x = 10 + 5 * n++;
  return { id: `r${n}`, type: 'path', paths: [{ closed: true, points: [{ x, y: 10 }, { x: x + 10, y: 10 }, { x: x + 10, y: 20 }, { x, y: 20 }] }], fill: '#ff0000', stroke: null, opacity: 1 };
}

/** Two keys, frames 0 to 3 and 4 to 7, each with a rectangle on it. */
function twoKeys(): Doc {
  const doc = docWith([[0, 4], [4, 4]], 10);
  for (const c of doc.layers[0].cels) {
    const d = doc.drawings[c.drawingId];
    if (d.kind === 'vector') d.shapes.push(newRect());
  }
  return doc;
}

beforeEach(() => resetTweenOffer());
afterEach(() => setChoice('timeline.tweenOffer', undefined));

describe('where in-betweens are offered', () => {
  it('a held frame with a key after it offers both moving and morphing for plain drawings', () => {
    const doc = twoKeys();
    const o = tweenOfferAt(doc, doc.layers[0], 2)!;
    expect(o).toMatchObject({ start: 0, end: 3, morph: true });
  });
  it('not on a key itself, not after the last key, and not where in-betweens already are', () => {
    const doc = twoKeys();
    expect(tweenOfferAt(doc, doc.layers[0], 0)).toBeNull();
    expect(tweenOfferAt(doc, doc.layers[0], 6)).toBeNull();
    doc.layers[0].cels[0].tween = { ease: 'linear' };
    expect(tweenOfferAt(doc, doc.layers[0], 2)).toBeNull();
  });
  it('an empty gap before the next key counts too', () => {
    const doc = docWith([[0, 2], [6, 2]], 10);
    for (const c of doc.layers[0].cels) {
      const d = doc.drawings[c.drawingId];
      if (d.kind === 'vector') d.shapes.push(newRect());
    }
    expect(tweenOfferAt(doc, doc.layers[0], 4)).toMatchObject({ start: 0, end: 5 });
  });
  it('nothing to offer on a locked layer or an empty drawing', () => {
    const doc = twoKeys();
    doc.layers[0].locked = true;
    expect(tweenOfferAt(doc, doc.layers[0], 2)).toBeNull();
    const bare = docWith([[0, 4], [4, 4]], 10);
    expect(tweenOfferAt(bare, bare.layers[0], 2)).toBeNull();
  });
});

describe('the offer', () => {
  it('making it is one undo step', () => {
    const s = resetStore(twoKeys());
    offerTweenAt(s.get().doc, s.get().doc.layers[0], 2);
    acceptTweenOffer('shape');
    expect(tweenOffer.get()).toBeNull();
    expect(s.get().doc.layers[0].cels[0].tween?.kind).toBe('shape');
    s.undo();
    expect(s.get().doc.layers[0].cels[0].tween).toBeUndefined();
  });
  it('once dismissed it stays away for that span until the layer changes', () => {
    const s = resetStore(twoKeys());
    const layer = () => s.get().doc.layers[0];
    offerTweenAt(s.get().doc, layer(), 2);
    dismissTweenOffer(s.get().doc);
    expect(offerTweenAt(s.get().doc, layer(), 3)).toBeNull();
    s.update('rename', (d) => void (d.layers[0].name = 'changed'));
    expect(offerTweenAt(s.get().doc, layer(), 3)).not.toBeNull();
  });
  it('can be turned off in Behaviour', () => {
    const s = resetStore(twoKeys());
    setChoice('timeline.tweenOffer', 'off');
    expect(offerTweenAt(s.get().doc, s.get().doc.layers[0], 2)).toBeNull();
  });
  it('goes away when playback starts or the playhead leaves the span', () => {
    const s = resetStore(twoKeys());
    const off = installTweenOffer(s);
    s.setUi({ frame: 2, activeLayerId: s.get().doc.layers[0].id });
    offerTweenAt(s.get().doc, s.get().doc.layers[0], 2);
    s.setUi({ frame: 3 });
    expect(tweenOffer.get()).not.toBeNull();
    s.setUi({ frame: 5 });
    expect(tweenOffer.get()).toBeNull();
    s.setUi({ frame: 2 });
    offerTweenAt(s.get().doc, s.get().doc.layers[0], 2);
    s.setUi({ playing: true });
    expect(tweenOffer.get()).toBeNull();
    closeTweenOffer();
    off();
  });
});
