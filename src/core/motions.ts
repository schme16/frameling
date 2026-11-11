/**
 * One-click motions (bounce, wobble, float, pop in, shake, fade in): the poses each one goes through, as plain data.
 * A motion is a short list of poses, each an offset from where the thing already is (its rest pose), with the easing
 * to the next one. It always ends back at rest, so it can loop and it leaves the drawing as it was found.
 * Pure: no store, no DOM. symbols/motions.ts turns these into keys and in-betweens.
 */
import type { Easing, Transform2D } from './format';

export type MotionId = 'bounce' | 'wobble' | 'float' | 'popIn' | 'shake' | 'fadeIn';

export interface MotionDef {
  id: MotionId;
  /** Plain words, as on the menu. */
  label: string;
  /** What it does, for tooltips and the palette. */
  description: string;
  /** Seconds it takes. */
  seconds: number;
}

export const MOTIONS: MotionDef[] = [
  { id: 'bounce', label: 'Bounce', description: 'Hops up and lands with a little squash, like a ball.', seconds: 0.8 },
  { id: 'wobble', label: 'Wobble', description: 'Rocks side to side and settles, like jelly.', seconds: 0.8 },
  { id: 'float', label: 'Float', description: 'Drifts gently up and back down, like it is bobbing on water.', seconds: 2 },
  { id: 'popIn', label: 'Pop in', description: 'Springs up from small and clear, with a little overshoot.', seconds: 0.4 },
  { id: 'shake', label: 'Shake', description: 'Shudders side to side, quick and getting smaller.', seconds: 0.5 },
  { id: 'fadeIn', label: 'Fade in', description: 'Starts clear and fades up to how it is now.', seconds: 0.6 },
];

export function motionDef(id: MotionId): MotionDef {
  return MOTIONS.find((m) => m.id === id) ?? MOTIONS[0];
}

/** A pose: how far from rest, at `at` (0 to 1) of the way through, easing into the next pose. */
export interface MotionPose {
  at: number;
  dx?: number;
  dy?: number;
  /** Multiplies the rest scale. */
  sx?: number;
  sy?: number;
  /** Added to the rest turn, degrees. */
  rot?: number;
  /** Multiplies the rest opacity. */
  op?: number;
  ease: Easing;
}

/** The poses of a motion for something `w` by `h` stage pixels big. The last one is always rest. */
export function motionPoses(id: MotionId, w: number, h: number): MotionPose[] {
  const size = Math.max(8, Math.min(w, h) || 0);
  switch (id) {
    case 'bounce': {
      const up = Math.max(12, h * 0.6);
      return [
        // Squash a little before take off (anticipation), up, land squashed, settle.
        { at: 0, ease: 'easeOut' },
        { at: 0.12, sx: 1.08, sy: 0.92, ease: 'easeOut' },
        { at: 0.45, dy: -up, sx: 0.95, sy: 1.06, ease: 'easeIn' },
        { at: 0.75, sx: 1.15, sy: 0.85, ease: 'easeOut' },
        { at: 1, ease: 'linear' },
      ];
    }
    case 'wobble':
      return [
        { at: 0, ease: 'easeInOut' },
        { at: 0.2, rot: -12, ease: 'easeInOut' },
        { at: 0.4, rot: 9, ease: 'easeInOut' },
        { at: 0.6, rot: -5, ease: 'easeInOut' },
        { at: 0.8, rot: 2, ease: 'easeInOut' },
        { at: 1, ease: 'linear' },
      ];
    case 'float':
      return [
        { at: 0, ease: 'easeInOut' },
        { at: 0.5, dy: -Math.max(4, size * 0.15), ease: 'easeInOut' },
        { at: 1, ease: 'linear' },
      ];
    case 'popIn':
      return [
        { at: 0, sx: 0.3, sy: 0.3, op: 0, ease: 'backOut' },
        { at: 1, ease: 'linear' },
      ];
    case 'shake': {
      const amp = Math.max(3, size * 0.08);
      const swing = [-1, 1, -0.75, 0.75, -0.4, 0.4];
      return [{ at: 0, ease: 'easeInOut' }, ...swing.map((m, i): MotionPose => ({ at: (i + 1) / (swing.length + 1), dx: m * amp, ease: 'easeInOut' })), { at: 1, ease: 'linear' }];
    }
    case 'fadeIn':
      return [
        { at: 0, op: 0, ease: 'easeOut' },
        { at: 1, ease: 'linear' },
      ];
  }
}

export interface MotionKey {
  /** Frames from the start of the motion. */
  frame: number;
  ease: Easing;
  transform: Transform2D;
  opacity: number;
}

/** How many frames a motion takes at `fps` (enough for each pose to get its own frame). */
export function motionFrames(id: MotionId, fps: number, poses = motionPoses(id, 100, 100)): number {
  return Math.max(poses.length - 1, Math.round(motionDef(id).seconds * fps));
}

/**
 * The keys for a motion `frames` long, from a rest transform and opacity. Each pose lands on its own frame, so a
 * motion squeezed into very few frames still has every pose. The last key is the rest pose.
 */
export function motionKeys(id: MotionId, rest: { transform: Transform2D; opacity: number }, size: { w: number; h: number }, frames: number): MotionKey[] {
  const poses = motionPoses(id, size.w, size.h);
  const n = Math.max(poses.length - 1, Math.round(frames));
  const out: MotionKey[] = [];
  let last = -1;
  poses.forEach((p, i) => {
    // Never two poses on one frame, and leave room for the ones still to come.
    const left = poses.length - 1 - i;
    const f = Math.min(n - left, Math.max(last + 1, Math.round(p.at * n)));
    last = f;
    const t = rest.transform;
    out.push({
      frame: f,
      ease: p.ease,
      transform: {
        ...t,
        x: t.x + (p.dx ?? 0),
        y: t.y + (p.dy ?? 0),
        scaleX: t.scaleX * (p.sx ?? 1),
        scaleY: t.scaleY * (p.sy ?? 1),
        rotation: t.rotation + (p.rot ?? 0),
      },
      opacity: Math.max(0, Math.min(1, rest.opacity * (p.op ?? 1))),
    });
  });
  return out;
}
