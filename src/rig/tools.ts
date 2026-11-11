/**
 * The Bone tool (K: draw and adjust the skeleton) and the Pose tool (O: turn bones, drag hands and feet with IK,
 * move the whole skeleton, pin bones), plus how bones look on the canvas.
 */
import type { Id } from '../core/format';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { rememberedChoice, withChoice } from '../core/choices';
import { cssVar } from '../canvas/theme';
import { requestOverlay } from '../canvas/controller';
import { aimBone, applyPins, capturePins, descendants, ikChain, moveBone, rigState, solveIK, stretchBone, type PinHold, type Pt, type RigState } from './math';
import { rigPoseAt, type RigLayer } from './pose';
import { addBone, currentRig, deleteBone, ensureRig, moveJoint, needsNewPoseKey, setPin, setPose } from './ops';
import { rigUi, setRigUi, type BoneLook } from './state';
import { BoneOptions, PoseOptions } from './Options';
import type { Pose } from '../core/format';

// ---------------------------------------------------------------- hit testing

export type Part = 'tip' | 'base' | 'body';

/** The bone part under a point, nearest first: handles beat bodies, and later (child) bones beat earlier ones. */
export function hitBone(st: RigState, p: Pt, zoom: number, prefer?: Id | null): { id: Id; part: Part } | undefined {
  const r = 8 / zoom;
  const list = [...st.values()].reverse();
  if (prefer) {
    const s = st.get(prefer);
    if (s) list.unshift(s);
  }
  for (const s of list) if (Math.hypot(p.x - s.tip.x, p.y - s.tip.y) <= r) return { id: s.bone.id, part: 'tip' };
  // Where joints share a point (hips and thighs), the root wins, so dragging it moves the whole skeleton.
  const bases = [...list.filter((s) => !s.bone.parent), ...list.filter((s) => s.bone.parent)];
  for (const s of bases) if (Math.hypot(p.x - s.base.x, p.y - s.base.y) <= r) return { id: s.bone.id, part: 'base' };
  for (const s of list) {
    const dx = s.tip.x - s.base.x;
    const dy = s.tip.y - s.base.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = ((p.x - s.base.x) * dx + (p.y - s.base.y) * dy) / l2;
    if (t < 0 || t > 1) continue;
    const d = Math.hypot(p.x - (s.base.x + dx * t), p.y - (s.base.y + dy * t));
    const half = Math.max(6 / zoom, Math.min(Math.sqrt(l2) * 0.14, 14 / zoom));
    if (d <= half) return { id: s.bone.id, part: 'body' };
  }
  return undefined;
}

function stateNow(rig: RigLayer): RigState {
  const { doc, ui } = store().get();
  return rigState(rig.rig, rigPoseAt(doc, rig, ui.frame));
}

// ---------------------------------------------------------------- drawing bones

/** Draws a skeleton in document space. `look` picks between the two styles (see brand/ab/bones). */
export function drawSkeleton(g: CanvasRenderingContext2D, st: RigState, zoom: number, opts: { selected?: Id | null; hover?: Id | null; look?: BoneLook; faded?: boolean } = {}): void {
  const look = opts.look ?? 'kite';
  const base = cssVar('--grape') || '#9b7bff';
  const sel = cssVar('--sunny') || '#ffc94a';
  const pin = cssVar('--rose') || '#ff6f91';
  const ink = '#1d1b26';
  const u = 1 / zoom;
  g.save();
  g.globalAlpha = opts.faded ? 0.45 : 1;
  for (const s of st.values()) {
    const on = s.bone.id === opts.selected;
    const hot = s.bone.id === opts.hover;
    const col = on ? sel : base;
    const { x: ax, y: ay } = s.base;
    const { x: bx, y: by } = s.tip;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (bx - ax) / len;
    const ny = (by - ay) / len;
    if (look === 'kite') {
      const w = Math.max(3 * u, Math.min(len * 0.13, 12 * u));
      const mx = ax + nx * len * 0.2;
      const my = ay + ny * len * 0.2;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(mx - ny * w, my + nx * w);
      g.lineTo(bx, by);
      g.lineTo(mx + ny * w, my - nx * w);
      g.closePath();
      g.fillStyle = col;
      g.globalAlpha = (opts.faded ? 0.45 : 1) * (on || hot ? 0.7 : 0.45);
      g.fill();
      g.globalAlpha = opts.faded ? 0.45 : 1;
      g.lineWidth = 1.5 * u;
      g.strokeStyle = ink;
      g.stroke();
      g.lineWidth = 1 * u;
      g.strokeStyle = col;
      g.stroke();
    } else {
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.lineWidth = (on || hot ? 9 : 7) * u;
      g.strokeStyle = ink;
      g.globalAlpha = (opts.faded ? 0.45 : 1) * 0.5;
      g.stroke();
      g.lineWidth = (on || hot ? 6 : 4.5) * u;
      g.strokeStyle = col;
      g.globalAlpha = (opts.faded ? 0.45 : 1) * 0.85;
      g.stroke();
      g.globalAlpha = opts.faded ? 0.45 : 1;
    }
    // Joint and tip.
    g.beginPath();
    g.arc(ax, ay, 4.2 * u, 0, Math.PI * 2);
    g.fillStyle = s.bone.pin ? pin : col;
    g.fill();
    g.lineWidth = 1.5 * u;
    g.strokeStyle = ink;
    g.stroke();
    g.beginPath();
    g.arc(bx, by, 2.6 * u, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = 1.5 * u;
    g.stroke();
    if (s.bone.pin) {
      // A little pin head above the joint.
      g.beginPath();
      g.moveTo(ax, ay - 5 * u);
      g.lineTo(ax, ay - 12 * u);
      g.strokeStyle = pin;
      g.lineWidth = 2 * u;
      g.stroke();
      g.beginPath();
      g.arc(ax, ay - 13 * u, 3 * u, 0, Math.PI * 2);
      g.fillStyle = pin;
      g.fill();
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- the Bone tool

type BoneDrag =
  | { kind: 'new'; rigId: Id; from: Pt; to: Pt; parent: Id | null }
  | { kind: 'joint'; rigId: Id; id: Id; part: 'base' | 'tip'; moved: boolean };

let boneDrag: BoneDrag | null = null;
let hover: Id | null = null;
const DRAG_PX = 4;

function startBone(e: ToolPointer, ctx: ToolContext): void {
  const rig = currentRig();
  const st = rig ? stateNow(rig) : undefined;
  const hit = st ? hitBone(st, e, ctx.zoom, rigUi().selected) : undefined;
  const adjust = rigUi().mode === 'adjust' !== e.alt;
  if (hit && rig && adjust) {
    setRigUi({ selected: hit.id });
    if (hit.part !== 'body') boneDrag = { kind: 'joint', rigId: rig.id, id: hit.id, part: hit.part, moved: false };
    return;
  }
  // Drawing a new bone: from a bone's tip it hangs from that bone, from its body it branches off it there.
  let from: Pt = { x: e.x, y: e.y };
  let parent: Id | null = null;
  if (hit && st) {
    const s = st.get(hit.id)!;
    if (hit.part === 'tip') from = { ...s.tip };
    else if (hit.part === 'base') from = { ...s.base };
    // From a joint it hangs from the same parent, except at a root's joint, where it hangs from the root (legs from
    // the hips).
    parent = hit.part === 'base' && s.bone.parent ? s.bone.parent : hit.id;
  }
  const rigId = rig?.id ?? '';
  boneDrag = { kind: 'new', rigId, from, to: from, parent };
}

export const boneTool: Tool = {
  id: 'bone',
  label: 'Bone',
  icon: 'bone',
  key: 'k',
  layers: ['vector', 'pixel', 'tilemap'],
  order: 70,
  help: 'rig-bones',
  cursor: 'crosshair',
  options: BoneOptions,
  down(e, ctx) {
    startBone(e, ctx);
    ctx.requestOverlay();
  },
  move(e, ctx) {
    const d = boneDrag;
    if (!d) return;
    if (d.kind === 'new') d.to = { x: e.x, y: e.y };
    else {
      d.moved = true;
      moveJoint(d.rigId, d.id, d.part, e);
    }
    ctx.requestOverlay();
  },
  up(e, ctx) {
    const d = boneDrag;
    boneDrag = null;
    if (d?.kind === 'new') {
      const far = Math.hypot(e.x - d.from.x, e.y - d.from.y) * ctx.zoom;
      if (far < DRAG_PX) {
        // A click: picks (or clears) the bone under it.
        const rig = currentRig();
        const hit = rig ? hitBone(stateNow(rig), e, ctx.zoom) : undefined;
        setRigUi({ selected: hit?.id ?? null });
      } else {
        const rigId = d.rigId || ensureRig();
        const first = !currentRig()?.rig.bones.length;
        const id = addBone(rigId, d.from, { x: e.x, y: e.y }, d.parent);
        if (id) setRigUi({ selected: id });
        if (first) ctx.hint('Nice, your first bone! Keep drawing from its tip to make a chain.');
      }
    }
    ctx.requestOverlay();
  },
  hover(e, ctx) {
    const rig = currentRig();
    const h = rig ? (hitBone(stateNow(rig), e, ctx.zoom)?.id ?? null) : null;
    if (h !== hover) {
      hover = h;
      ctx.requestOverlay();
    }
  },
  cancel(ctx) {
    boneDrag = null;
    ctx.requestOverlay();
  },
  overlay(g, ctx) {
    const rig = currentRig();
    if (rig) drawSkeleton(g, stateNow(rig), ctx.zoom, { selected: rigUi().selected, hover, look: rigUi().look });
    const d = boneDrag;
    if (d?.kind === 'new' && Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) > 0) {
      const ghost = new Map(); // A preview bone, drawn the same way.
      const len = Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y);
      ghost.set('~new', {
        bone: { id: '~new', name: '', x: d.from.x, y: d.from.y, angle: 0, length: len },
        rest: [1, 0, 0, 1, 0, 0],
        posed: [1, 0, 0, 1, 0, 0],
        skin: [1, 0, 0, 1, 0, 0],
        angle: 0,
        base: d.from,
        tip: d.to,
      });
      drawSkeleton(g, ghost as RigState, ctx.zoom, { selected: '~new', look: rigUi().look });
    }
  },
};

// ---------------------------------------------------------------- the Pose tool

interface PoseDrag {
  rigId: Id;
  id: Id;
  part: Part;
  start: Pt;
  pose0: Pose;
  holds: Map<Id, PinHold>;
  chain: Id[];
  /** Shift-drag on a tip: squash or stretch the bone instead of bending the chain. */
  stretch?: boolean;
}
let poseDrag: PoseDrag | null = null;

/** The pose for the drag so far: always worked out from where the drag began, so nothing drifts. */
export function dragPose(rig: RigLayer, d: PoseDrag, p: Pt): Pose {
  const r = rig.rig;
  const b = r.bones.find((x) => x.id === d.id);
  if (!b) return d.pose0;
  let pose: Pose;
  let skip: Set<Id>;
  if (d.stretch) {
    pose = stretchBone(r, d.pose0, d.id, p);
    skip = descendants(r, d.id);
  } else if (d.part === 'base' && !b.parent) {
    // The root's joint moves the whole skeleton; pinned feet stay planted.
    pose = moveBone(r, d.pose0, d.id, p.x - d.start.x, p.y - d.start.y);
    skip = new Set([d.id]);
  } else if (d.part === 'tip' && d.chain.length > 1) {
    pose = solveIK(r, d.pose0, d.chain, p);
    skip = descendants(r, d.chain[0]);
  } else {
    const pivot = d.part === 'base' && b.parent ? b.parent : d.id;
    pose = aimBone(r, d.pose0, pivot, d.start, p);
    skip = descendants(r, pivot);
  }
  return applyPins(r, pose, d.holds, skip);
}

export const poseTool: Tool = {
  id: 'pose',
  label: 'Pose',
  icon: 'pose',
  key: 'Shift+K',
  layers: ['vector', 'pixel', 'tilemap'],
  order: 71,
  help: 'rig-posing',
  cursor: 'default',
  options: PoseOptions,
  down(e, ctx) {
    const rig = currentRig();
    if (!rig?.rig.bones.length) {
      ctx.hint('There are no bones to pose yet. Draw some with the Bone tool (K).');
      return;
    }
    const pose0 = rigPoseAt(store().get().doc, rig, store().get().ui.frame);
    const hit = hitBone(rigState(rig.rig, pose0), e, ctx.zoom, rigUi().selected);
    if (!hit) {
      setRigUi({ selected: null });
      ctx.requestOverlay();
      return;
    }
    setRigUi({ selected: hit.id });
    if (e.alt) {
      const b = rig.rig.bones.find((x) => x.id === hit.id)!;
      setPin(rig.id, hit.id, !b.pin);
      ctx.hint(b.pin ? `${b.name} is free again.` : `${b.name} is pinned: it stays put while you move the rest.`);
      return;
    }
    const begin = () => {
      const stretch = e.shift && hit.part !== 'base';
      poseDrag = { rigId: rig.id, id: hit.id, part: hit.part, start: { x: e.x, y: e.y }, pose0, holds: capturePins(rig.rig, pose0), chain: hit.part === 'tip' && !stretch ? ikChain(rig.rig, hit.id) : [hit.id], stretch };
    };
    // The first time a pose lands on a frame without one, ask whether in-betweens glide or jump.
    if (needsNewPoseKey(rig, store().get().ui.frame) && rememberedChoice('rig.newPose') === undefined) {
      let now = true;
      withChoice('rig.newPose', () => {
        if (now) begin();
        else ctx.hint('Got it. Now drag the bone again.');
      });
      now = false;
      return;
    }
    begin();
  },
  move(e, ctx) {
    const d = poseDrag;
    if (!d) return;
    const rig = store().get().doc.layers.find((l) => l.id === d.rigId) as RigLayer | undefined;
    if (!rig?.rig) return;
    setPose(d.rigId, dragPose(rig, d, e), 'Pose bones', `rig-pose-${d.id}`);
    ctx.requestOverlay();
  },
  up(_e, ctx) {
    poseDrag = null;
    ctx.requestOverlay();
  },
  hover(e, ctx) {
    const rig = currentRig();
    const h = rig ? (hitBone(stateNow(rig), e, ctx.zoom)?.id ?? null) : null;
    if (h !== hover) {
      hover = h;
      ctx.requestOverlay();
    }
  },
  cancel(ctx) {
    poseDrag = null;
    ctx.requestOverlay();
  },
  overlay(g, ctx) {
    const rig = currentRig();
    if (rig) drawSkeleton(g, stateNow(rig), ctx.zoom, { selected: rigUi().selected, hover, look: rigUi().look });
  },
};

registerTool(boneTool);
registerTool(poseTool);

/** Deletes the selected bone (the Delete key, while the Bone tool is out). */
export function deleteSelectedBone(): boolean {
  const rig = currentRig();
  const id = rigUi().selected;
  if (!rig || !id || !rig.rig.bones.some((b) => b.id === id)) return false;
  deleteBone(rig.id, id);
  setRigUi({ selected: null });
  requestOverlay();
  return true;
}
