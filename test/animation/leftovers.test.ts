// @vitest-environment jsdom
// What was left once animation became opt in: a still that gains frames some other way turns animation on in the same
// step, the animation-only views and sound are greyed with the reason, and the export dialog does not offer a whole
// animation to a picture.
import { beforeAll, describe, expect, it } from 'vitest';
import { ANIMATION_ONLY, ADD_ANIMATION_FIRST, animationKind } from '../../src/core/animationGate';
import { isAnimated } from '../../src/core/animation';
import { newDoc } from '../../src/core/doc';
import { getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { commandEnabled, commandReason } from '../../src/ui/palette';
import { stillGainedFrames } from '../../src/animation/settle';
import { defaultSettings, planExport } from '../../src/export/plan';
import { loadApp } from '../findability/app';

beforeAll(async () => {
  await loadApp();
});

describe('a still that gains frames', () => {
  it('turns animation on in the same step, and Undo takes both back', () => {
    resetStore(newDoc({ animated: false }));
    store().update('Import frames', (d) => void (d.length = 8));
    expect(store().get().doc.length).toBe(8);
    expect(isAnimated(store().get().doc)).toBe(true);
    store().undo();
    expect(store().get().doc.length).toBe(1);
    expect(isAnimated(store().get().doc)).toBe(false);
  });

  it('leaves a drawing alone when it was animation turned off, with its frames kept', () => {
    resetStore(newDoc({ animated: false, length: 12 }));
    store().update('Edit', (d) => void (d.fps = 10));
    expect(store().get().doc.length).toBe(12);
    expect(store().get().doc.animated).toBe(false);
  });

  it('leaves an animation, and a change that does not add frames, alone', () => {
    resetStore(newDoc({ animated: true }));
    store().update('Edit', (d) => void (d.length = 40));
    expect(store().get().doc.animated).toBe(true);
    resetStore(newDoc({ animated: false }));
    store().update('Rename', (d) => void (d.name = 'Picture'));
    expect(store().get().doc.animated).toBe(false);
  });

  it('does not count another artboard opening with a longer length of its own', () => {
    const before = newDoc({ animated: false });
    const after = { ...before, length: 30 };
    expect(stillGainedFrames(after, { before, patches: [{ op: 'replace', path: ['length'], value: 30 }] })).toBe(true);
    expect(stillGainedFrames(after, { before, patches: [{ op: 'replace', path: ['activeArtboard'], value: 'b' }, { op: 'replace', path: ['length'], value: 30 }] })).toBe(false);
  });
});

describe('animation only views and sound on a still', () => {
  const ids = ['view.cleanTimeline', 'view.emptyGhost', 'view.lightTable', 'camera.whilePlaying', 'audio.import', 'symbols.makeFrames'];
  it('are real commands that need animation', () => {
    for (const id of ids) {
      const c = getCommand(id);
      expect(c, id).toBeTruthy();
      expect(ANIMATION_ONLY).toContain(id);
      expect(animationKind(c!), id).toBe('needs');
    }
  });
  it('are greyed on a still with the reason, and work on an animation', () => {
    resetStore(newDoc({ animated: false }));
    for (const id of ids) {
      expect(commandEnabled(getCommand(id)!), id).toBe(false);
      expect(commandReason(getCommand(id)!), id).toBe(ADD_ANIMATION_FIRST);
    }
    resetStore(newDoc({ animated: true }));
    for (const id of ids) expect(commandReason(getCommand(id)!), id).not.toBe(ADD_ANIMATION_FIRST);
  });
});

describe('exporting a picture as a video', () => {
  it('says to add animation first, rather than to try a whole animation', () => {
    const still = newDoc({ animated: false });
    const s = { ...defaultSettings(still), format: 'mp4' as const };
    const plan = planExport(still, s, 0);
    expect(plan.problem).toMatch(/Add animation first/);
    const moving = newDoc({ animated: true, length: 1 });
    expect(planExport(moving, s, 0).problem).toMatch(/whole animation or a clip/);
  });
});
