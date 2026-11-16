// A drawing is an animation when it asks to be: the rule, the round trip that never loses a frame, the words, the file,
// and the starters. Pure functions first, then the store, then the file.
import { describe, expect, it } from 'vitest';
import { addAnimation, addedWords, ANIMATION_FRAMES, framesDrawn, hasFrames, hiddenWords, hideAnimation, isAnimated, PIXEL_ANIMATION_FRAMES, startFrames } from '../../src/core/animation';
import { newDoc, newPixelLayer, newVectorDrawing } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { resetStore } from '../../src/core/store';
import { addAnimationNow, hideAnimationNow } from '../../src/animation/ops';
import { docFromCustom, docFromPreset, PRESETS } from '../../src/ui/presets';
import { TEMPLATES } from '../../src/templates';
import { DEFAULT_CUSTOM } from '../../src/ui/presets';

/** A drawing with a different drawing on each of `n` frames of layer 1. */
function framesDoc(n: number, extra: Partial<Doc> = {}): Doc {
  const doc = newDoc({ name: 'Frames', length: Math.max(n, 1), animated: true });
  for (let i = 0; i < n; i++) {
    const d = newVectorDrawing();
    doc.drawings[d.id] = d;
    doc.layers[0].cels.push({ id: `c${i}`, start: i, length: 1, drawingId: d.id });
  }
  return Object.assign(doc, extra);
}

describe('is it an animation?', () => {
  it('says so when the file says so', () => {
    expect(isAnimated({ length: 1, animated: true })).toBe(true);
    expect(isAnimated({ length: 40, animated: false })).toBe(false);
  });
  it('is the old rule when the file does not say: more than one frame', () => {
    expect(isAnimated({ length: 1 })).toBe(false);
    expect(isAnimated({ length: 2 })).toBe(true);
    expect(isAnimated({ length: 24 })).toBe(true);
  });
  it('looks at the drawing, not the symbol being edited, so the timeline does not vanish inside a symbol', () => {
    const inside = { length: 1, editing: [{ symbolId: 's', layers: [], length: 24, frame: 0, activeLayerId: null, matrix: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number] }] };
    expect(isAnimated(inside)).toBe(true);
    expect(isAnimated({ ...inside, editing: [{ ...inside.editing[0], length: 1 }] })).toBe(false);
  });
});

describe('newDoc', () => {
  it('keeps the old defaults when nobody says anything: 24 frames and no field', () => {
    const d = newDoc();
    expect(d.length).toBe(24);
    expect('animated' in d).toBe(false);
    expect(isAnimated(d)).toBe(true);
  });
  it('a still is one frame, and says so', () => {
    const d = newDoc({ animated: false });
    expect(d.length).toBe(1);
    expect(d.animated).toBe(false);
    expect(isAnimated(d)).toBe(false);
  });
  it('an animation that asks for a length gets it', () => {
    expect(newDoc({ animated: true, length: 8 }).length).toBe(8);
    expect(newDoc({ animated: false, length: 8 }).length).toBe(8);
  });
});

describe('frames', () => {
  it('counts the frames that hold a drawing of their own, across layers', () => {
    const d = framesDoc(3);
    d.layers.push({ ...newPixelLayer('p', 1), cels: [{ id: 'x', start: 1, length: 1, drawingId: 'dx' }, { id: 'y', start: 5, length: 1, drawingId: 'dy' }] });
    expect(framesDrawn(d)).toBe(4);
  });
  it('a long empty timeline is not frames, and one drawing is not frames', () => {
    expect(hasFrames(newDoc({ animated: true, length: 24 }))).toBe(false);
    expect(hasFrames(framesDoc(1, { length: 24 }))).toBe(false);
    expect(hasFrames(framesDoc(2))).toBe(true);
  });
  it('pixel art starts small, everything else gets two seconds', () => {
    expect(startFrames(newDoc({ animated: false }))).toBe(ANIMATION_FRAMES);
    expect(startFrames(newDoc({ animated: false, pixel: { pixelSize: 8 } }))).toBe(PIXEL_ANIMATION_FRAMES);
    expect(startFrames({ layers: [] })).toBe(ANIMATION_FRAMES);
  });
});

describe('adding and turning off', () => {
  it('adding to a still gives it frames and keeps what is on frame 1', () => {
    const d = newDoc({ animated: false });
    d.layers[0].cels.push({ id: 'c', start: 0, length: 1, drawingId: 'd' });
    const a = addAnimation(d);
    expect(a).toEqual({ frames: 24, kept: false });
    expect(d.animated).toBe(true);
    expect(d.length).toBe(24);
    expect(d.layers[0].cels).toHaveLength(1);
  });
  it('turning off and on again keeps every frame, whatever the number', () => {
    for (const n of [2, 5, 12]) {
      const d = framesDoc(n);
      const before = JSON.stringify(d.layers);
      const h = hideAnimation(d);
      expect(h.kept).toBe(n);
      expect(isAnimated(d)).toBe(false);
      expect(d.length).toBe(n);
      expect(JSON.stringify(d.layers)).toBe(before);
      const a = addAnimation(d);
      expect(a).toEqual({ frames: n, kept: true });
      expect(isAnimated(d)).toBe(true);
      expect(JSON.stringify(d.layers)).toBe(before);
    }
  });
  it('turning off a drawing with no frames of its own says nothing about frames', () => {
    const h = hideAnimation(newDoc({ animated: true }));
    expect(h.kept).toBe(0);
    expect(hiddenWords(h)).not.toMatch(/frames are kept/);
  });
  it('says plainly what happened to frames, with no em dashes', () => {
    expect(hiddenWords({ kept: 12 })).toMatch(/12 frames are kept/);
    expect(hiddenWords({ kept: 12 })).toMatch(/Add animation brings the timeline back/);
    expect(addedWords({ frames: 12, kept: true })).toMatch(/12 frames are back/);
    expect(addedWords({ frames: 24, kept: false })).toMatch(/24 frames to draw on/);
    for (const t of [hiddenWords({ kept: 3 }), hiddenWords({ kept: 0 }), addedWords({ frames: 3, kept: true }), addedWords({ frames: 3, kept: false })]) expect(t).not.toMatch(/[–—]/);
  });
});

describe('in the store: one step of Undo each', () => {
  it('adds, then undoes, then redoes', () => {
    const s = resetStore(newDoc({ animated: false }));
    expect(addAnimationNow()).toEqual({ frames: 24, kept: false });
    expect(isAnimated(s.get().doc)).toBe(true);
    s.undo();
    expect(isAnimated(s.get().doc)).toBe(false);
    expect(s.get().doc.length).toBe(1);
    s.redo();
    expect(s.get().doc.length).toBe(24);
  });
  it('does nothing when there is nothing to do', () => {
    resetStore(newDoc({ animated: false }));
    expect(hideAnimationNow()).toBeNull();
    resetStore(newDoc({ animated: true }));
    expect(addAnimationNow()).toBeNull();
  });
  it('turning off puts the playhead back on frame 1 and stops playing, and Undo brings the animation back', () => {
    const s = resetStore(framesDoc(6));
    s.setUi({ frame: 4, playing: true });
    expect(hideAnimationNow()).toEqual({ kept: 6 });
    expect(s.get().ui.frame).toBe(0);
    expect(s.get().ui.playing).toBe(false);
    s.undo();
    expect(isAnimated(s.get().doc)).toBe(true);
    expect(s.get().doc.length).toBe(6);
  });
});

describe('the file says so', () => {
  const roundTrip = async (doc: Doc): Promise<Doc> => (await loadFile(saveFile(doc, '1.2.3'))).doc;

  it('a still comes back a still, and an animation an animation', async () => {
    const still = await roundTrip(newDoc({ animated: false }));
    expect(still.animated).toBe(false);
    expect(isAnimated(still)).toBe(false);
    const anim = await roundTrip(newDoc({ animated: true, length: 8 }));
    expect(anim.animated).toBe(true);
    expect(isAnimated(anim)).toBe(true);
  });
  it('turned off with frames in it, it comes back off with every frame', async () => {
    const d = framesDoc(7);
    hideAnimation(d);
    const back = await roundTrip(d);
    expect(isAnimated(back)).toBe(false);
    expect(back.length).toBe(7);
    expect(framesDrawn(back)).toBe(7);
  });
  it('an older file has no field, is left without one, and is an animation if it has frames', async () => {
    const old = newDoc({ length: 12 });
    const back = await roundTrip(old);
    expect('animated' in back).toBe(false);
    expect(isAnimated(back)).toBe(true);
    const oldStill = await roundTrip(newDoc({ length: 1 }));
    expect('animated' in oldStill).toBe(false);
    expect(isAnimated(oldStill)).toBe(false);
  });
  it('a field that is not true or false is ignored rather than trusted', async () => {
    const d = newDoc({ length: 5 });
    (d as unknown as Record<string, unknown>).animated = 'yes';
    const back = await roundTrip(d);
    expect('animated' in back).toBe(false);
    expect(isAnimated(back)).toBe(true);
  });
});

describe('what starts as a picture and what starts as an animation', () => {
  it('every preset is a picture, on one frame', () => {
    for (const p of PRESETS) {
      const d = docFromPreset(p);
      expect(d.animated, p.id).toBe(false);
      expect(d.length, p.id).toBe(1);
    }
  });
  it('Custom is a picture unless Add animation is ticked', () => {
    expect(docFromCustom({ ...DEFAULT_CUSTOM, animate: false }).animated).toBe(false);
    expect(docFromCustom({ ...DEFAULT_CUSTOM, animate: false }).length).toBe(1);
    const on = docFromCustom({ ...DEFAULT_CUSTOM, animate: true });
    expect(on.animated).toBe(true);
    expect(on.length).toBeGreaterThan(1);
    expect(docFromCustom({ ...DEFAULT_CUSTOM, pixel: true, animate: true }).animated).toBe(true);
  });
  it('an old saved Custom spec with no answer keeps what it did: vector animates, pixel art is a picture', () => {
    const { animate: _a, ...spec } = DEFAULT_CUSTOM;
    expect(docFromCustom(spec).animated).toBe(true);
    expect(docFromCustom({ ...spec, pixel: true }).animated).toBe(false);
  });

  // Every starter says what it is. A starter that is an animation turns it on itself and asks nothing; a picture says no.
  const STILLS = ['blank-level'];
  it('every template says, and only the listed ones are pictures', () => {
    for (const t of TEMPLATES) {
      const d = t.make();
      expect(typeof d.animated, t.id).toBe('boolean');
      expect(d.animated, t.id).toBe(!STILLS.includes(t.id));
      expect(isAnimated(d), t.id).toBe(!STILLS.includes(t.id));
    }
  });
  it('the starters that are pictures have a single frame', () => {
    for (const t of TEMPLATES.filter((x) => STILLS.includes(x.id))) expect(t.make().length).toBe(1);
  });
  it('the starters that are animations have frames to play', () => {
    for (const t of TEMPLATES.filter((x) => !STILLS.includes(x.id))) expect(t.make().length, t.id).toBeGreaterThan(1);
  });
});
