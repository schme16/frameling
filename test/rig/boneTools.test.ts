// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { Id, VectorLayer } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { _resetChoicesForTests, rememberedChoice, setChoice } from '../../src/core/choices';
import { nextBoneFrom, stepBone } from '../../src/rig/math';
import { addBone, attachLayer, childBones, currentRig, deleteBone, ensureRig, removeBoneChoice } from '../../src/rig/ops';
import { poseTool, boneEditTool, boneRemoveTool, boneTool, addNextBone, deleteSelectedBone, removeBone } from '../../src/rig/tools';
import { rigUi, setRigUi } from '../../src/rig/state';

/** A chain Hips > Spine > Head, an arm branch Arm > Hand off the spine, and a layer attached to the hand. */
function chain() {
  const doc = newDoc({ width: 400, height: 400, length: 10 });
  resetStore(doc);
  store().setUi({ activeLayerId: doc.layers[0].id, frame: 0 });
  const rigId = ensureRig();
  const hips = addBone(rigId, { x: 100, y: 300 }, { x: 100, y: 250 }, null, 'Hips')!;
  const spine = addBone(rigId, { x: 100, y: 250 }, { x: 100, y: 200 }, hips, 'Spine')!;
  const head = addBone(rigId, { x: 100, y: 200 }, { x: 100, y: 150 }, spine, 'Head')!;
  const arm = addBone(rigId, { x: 100, y: 220 }, { x: 160, y: 220 }, spine, 'Arm')!;
  const hand = addBone(rigId, { x: 160, y: 220 }, { x: 190, y: 220 }, arm, 'Hand')!;
  attachLayer(doc.layers[0].id, rigId, hand);
  return { rigId, hips, spine, head, arm, hand, layerId: doc.layers[0].id };
}
const bones = (rigId: Id) => (store().get().doc.layers.find((l) => l.id === rigId) as VectorLayer).rig!.bones;
const names = (rigId: Id) => bones(rigId).map((b) => b.name);

describe('three bone tools', () => {
  it('Add, Edit and Remove are tools of their own, side by side in the rig group', () => {
    expect([boneTool.id, boneEditTool.id, boneRemoveTool.id]).toEqual(['bone', 'bone-edit', 'bone-remove']);
    expect([boneTool, boneEditTool, boneRemoveTool].map((t) => t.group)).toEqual(['rig', 'rig', 'rig']);
    expect([boneTool, boneEditTool, boneRemoveTool].map((t) => t.groupAt)).toEqual([0, 1, 2]);
    expect(new Set([boneTool, boneEditTool, boneRemoveTool].map((t) => t.key)).size).toBe(3);
    for (const t of [boneTool, boneEditTool, boneRemoveTool]) {
      expect(t.options).toBeTruthy();
      expect(t.help).toBe('rig-bone-tools');
    }
  });
});

describe('removing a bone', () => {
  let c: ReturnType<typeof chain>;
  beforeEach(() => {
    _resetChoicesForTests();
    c = chain();
  });

  it('keeps the bones hanging from it, which move up to its parent (the usual way)', () => {
    deleteBone(c.rigId, c.arm);
    expect(names(c.rigId)).toEqual(['Hips', 'Spine', 'Head', 'Hand']);
    expect(bones(c.rigId).find((b) => b.name === 'Hand')!.parent).toBe(c.spine);
  });

  it('takes the whole branch with it when asked', () => {
    deleteBone(c.rigId, c.arm, true);
    expect(names(c.rigId)).toEqual(['Hips', 'Spine', 'Head']);
  });

  it('moves a layer attached to a removed branch up to the nearest bone left', () => {
    deleteBone(c.rigId, c.arm, true);
    const l = store().get().doc.layers.find((x) => x.id === c.layerId)!;
    expect(l.bind?.bone).toBe(c.spine);
  });

  it('removing the root with its branch leaves a layer unattached when no bones are left', () => {
    deleteBone(c.rigId, c.hips, true);
    expect(bones(c.rigId)).toHaveLength(0);
    expect(store().get().doc.layers.find((x) => x.id === c.layerId)!.bind).toBeUndefined();
  });

  it('is one undo step', () => {
    deleteBone(c.rigId, c.arm, true);
    store().undo();
    expect(names(c.rigId)).toHaveLength(5);
  });

  it('removeBone follows the remembered answer, and the Remove tool click does the same', () => {
    setRigUi({ selected: c.arm });
    setChoice('rig.removeBone', 'branch');
    removeBone(c.rigId, c.arm);
    expect(names(c.rigId)).toEqual(['Hips', 'Spine', 'Head']);
    expect(rigUi().selected).toBeNull();
  });

  it('removeBone with no answer yet keeps the children (no asker in tests)', () => {
    removeBone(c.rigId, c.arm);
    expect(names(c.rigId)).toEqual(['Hips', 'Spine', 'Head', 'Hand']);
  });

  it('a bone with nothing hanging from it needs no answer and remembers none', () => {
    removeBone(c.rigId, c.hand);
    expect(names(c.rigId)).toEqual(['Hips', 'Spine', 'Head', 'Arm']);
    expect(rememberedChoice('rig.removeBone')).toBeUndefined();
  });

  it('Delete (the old way) goes through the same answer', () => {
    setRigUi({ selected: c.spine });
    setChoice('rig.removeBone', 'branch');
    expect(deleteSelectedBone()).toBe(true);
    expect(names(c.rigId)).toEqual(['Hips']);
  });

  it('the question is a registered choice with a safe default', () => {
    expect(removeBoneChoice.default).toBe('keep');
    expect(removeBoneChoice.options.map((o) => o.value)).toEqual(['keep', 'branch']);
  });

  it('childBones lists what hangs straight from a bone', () => {
    const rig = currentRig()!.rig;
    expect(childBones(rig, c.spine).map((b) => b.name)).toEqual(['Head', 'Arm']);
    expect(childBones(rig, c.head)).toEqual([]);
  });
});

describe('adding the next bone without dragging', () => {
  it('starts at the tip and carries on the same way, a little shorter', () => {
    const { from, to } = nextBoneFrom({ base: { x: 0, y: 0 }, tip: { x: 100, y: 0 } });
    expect(from).toEqual({ x: 100, y: 0 });
    expect(to.x).toBeCloseTo(185);
    expect(to.y).toBeCloseTo(0);
  });

  it('is never tiny or huge', () => {
    const small = nextBoneFrom({ base: { x: 0, y: 0 }, tip: { x: 3, y: 0 } });
    expect(small.to.x - small.from.x).toBe(16);
    const big = nextBoneFrom({ base: { x: 0, y: 0 }, tip: { x: 0, y: 1000 } });
    expect(big.to.y - big.from.y).toBe(160);
  });

  it('a bone with no length still gives a usable direction', () => {
    const { to } = nextBoneFrom({ base: { x: 5, y: 5 }, tip: { x: 5, y: 5 } });
    expect(Number.isFinite(to.x) && Number.isFinite(to.y)).toBe(true);
  });

  it('adds a bone hanging from the picked one, and picks the new one', () => {
    _resetChoicesForTests();
    const c = chain();
    setRigUi({ selected: c.head });
    expect(addNextBone()).toBe(true);
    const added = bones(c.rigId).at(-1)!;
    expect(added.parent).toBe(c.head);
    expect(rigUi().selected).toBe(added.id);
    // Tip of Head was at y 150; the new bone goes on up from there.
    expect(added.y).toBeCloseTo(150);
    expect(added.angle).toBeCloseTo(-90);
  });

  it('does nothing with no bone picked', () => {
    const c = chain();
    setRigUi({ selected: null });
    expect(addNextBone()).toBe(false);
    expect(bones(c.rigId)).toHaveLength(5);
  });
});

describe('clicking with the tools', () => {
  const ctx = { zoom: 1, requestOverlay() {}, hint() {} };
  const at = (x: number, y: number, extra = {}) => ({ x, y, ...extra }) as never;

  it('the Remove tool takes the bone under the click away, whichever part is hit', () => {
    _resetChoicesForTests();
    const c = chain();
    boneRemoveTool.down!(at(190, 220), ctx);
    expect(names(c.rigId)).not.toContain('Hand');
    boneRemoveTool.down!(at(100, 175), ctx); // the middle of Head
    expect(names(c.rigId)).not.toContain('Head');
  });

  it('the Remove tool on empty canvas does nothing', () => {
    const c = chain();
    boneRemoveTool.down!(at(350, 350), ctx);
    expect(bones(c.rigId)).toHaveLength(5);
  });

  it('the Add tool with Alt held still moves a joint, the old way', () => {
    const c = chain();
    boneTool.down!(at(190, 220, { alt: true }), ctx);
    boneTool.move!(at(200, 230), ctx);
    boneTool.up!(at(200, 230), ctx);
    expect(bones(c.rigId)).toHaveLength(5);
    const hand = bones(c.rigId).find((b) => b.name === 'Hand')!;
    expect(hand.length).not.toBeCloseTo(30);
  });

  it('the Edit tool moves a joint with no key held, and with Alt it draws instead', () => {
    const c = chain();
    boneEditTool.down!(at(190, 220), ctx);
    boneEditTool.up!(at(190, 220), ctx);
    expect(bones(c.rigId)).toHaveLength(5);
    boneEditTool.down!(at(300, 300, { alt: true }), ctx);
    boneEditTool.move!(at(340, 300), ctx);
    boneEditTool.up!(at(340, 300), ctx);
    expect(bones(c.rigId)).toHaveLength(6);
  });
});

describe('the Pose tool buttons', () => {
  const ctx = { zoom: 1, requestOverlay() {}, hint() {} };
  it('Pin turns a click into a pin and a second click frees it, no Alt needed', () => {
    const c = chain();
    setRigUi({ grab: 'pin' });
    poseTool.down!({ x: 100, y: 175 } as never, ctx);
    expect(bones(c.rigId).find((b) => b.name === 'Head')!.pin).toBe(true);
    poseTool.down!({ x: 100, y: 175 } as never, ctx);
    expect(bones(c.rigId).find((b) => b.name === 'Head')!.pin).toBeUndefined();
    setRigUi({ grab: 'turn' });
  });
});

describe('stepping along the chain', () => {
  it('goes up to the parent and down to the first child', () => {
    const c = chain();
    const rig = currentRig()!.rig;
    expect(stepBone(rig, c.head, 'parent')).toBe(c.spine);
    expect(stepBone(rig, c.spine, 'child')).toBe(c.head);
    expect(stepBone(rig, c.hips, 'parent')).toBeUndefined();
    expect(stepBone(rig, c.hand, 'child')).toBeUndefined();
    expect(stepBone(rig, 'nope', 'child')).toBeUndefined();
  });
});
