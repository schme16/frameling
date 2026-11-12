/**
 * The "Paint how much it bends" tool (weight painting) for a layer that bends with the bones: pick a bone, then paint
 * more or less of its pull with a soft brush, or smooth it out. A heat map shows the picked bone's pull: red follows
 * it fully, blue not at all. Each stroke is one undo step.
 */
import { useSyncExternalStore } from 'react';
import type { Doc, Id, Layer, SkinMesh } from '../core/format';
import { findLayer } from '../core/doc';
import { type Tool, type ToolContext } from '../core/registry';
import { store } from '../core/store';
import { requestOverlay } from '../canvas/controller';
import { cssVar } from '../canvas/theme';
import { bindRig, meshAt, rigStateAt, type RigLayer } from './pose';
import { drawSkeleton, hitBone } from './tools';
import { rigUi, setRigUi } from './state';
import { boneWeights, heatColour, normaliseWeights, paintWeights, smoothWeights, type BrushMode } from './weights';
import { WeightsOptions } from './WeightsOptions';
import type { Pt } from './math';

// ---------------------------------------------------------------- brush settings (not part of the document)

export interface WeightBrush {
  mode: BrushMode;
  /** Radius in document pixels. */
  size: number;
  /** 0 to 1. */
  strength: number;
}

let brush: WeightBrush = { mode: 'more', size: 30, strength: 0.35 };
const listeners = new Set<() => void>();

export function weightBrush(): WeightBrush {
  return brush;
}

export function setWeightBrush(p: Partial<WeightBrush>): void {
  brush = { ...brush, ...p, size: Math.max(2, Math.min(400, p.size ?? brush.size)), strength: Math.max(0.02, Math.min(1, p.strength ?? brush.strength)) };
  for (const fn of listeners) fn();
  requestOverlay();
}

export function useWeightBrush(): WeightBrush {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    weightBrush,
  );
}

// ---------------------------------------------------------------- the layer being painted

export interface PaintTarget {
  layer: Layer & { bind: NonNullable<Layer['bind']> & { mesh: SkinMesh } };
  rig: RigLayer;
}

/** The active layer, if it bends with bones (has a mesh). */
export function paintTarget(doc: Doc = store().get().doc, activeId: Id | null = store().get().ui.activeLayerId): PaintTarget | undefined {
  const layer = findLayer(doc, activeId);
  if (!layer?.bind?.mesh?.points.length) return undefined;
  const rig = bindRig(doc, layer);
  return rig ? { layer: layer as PaintTarget['layer'], rig } : undefined;
}

/** The bone being painted: the picked one if it's in this rig, else the one the layer mostly follows. */
export function paintBone(t: PaintTarget): Id {
  const sel = rigUi().selected;
  return sel && t.rig.rig.bones.some((b) => b.id === sel) ? sel : t.layer.bind.bone;
}

/** Replaces a layer's mesh (one undo step, or part of one while `coalesce` stays the same). */
export function setLayerMesh(layerId: Id, mesh: SkinMesh, label: string, coalesce?: string): void {
  store().update(
    label,
    (d) => {
      const l = d.layers.find((x) => x.id === layerId);
      if (l?.bind) l.bind.mesh = mesh;
    },
    coalesce ? { coalesce } : {},
  );
}

const NO_MESH = 'Pick a layer that bends with the bones first: Rig > Bend this layer with the bones.';

export function normaliseActive(): string | undefined {
  const t = paintTarget();
  if (!t) return NO_MESH;
  setLayerMesh(t.layer.id, normaliseWeights(t.layer.bind.mesh, t.rig.rig), 'Even out bending');
  return undefined;
}

export function smoothActive(): string | undefined {
  const t = paintTarget();
  if (!t) return NO_MESH;
  setLayerMesh(t.layer.id, smoothWeights(t.layer.bind.mesh, t.rig.rig), 'Smooth bending');
  return undefined;
}

// ---------------------------------------------------------------- the tool

/** How the pull is shown: a blue-to-red heat map (the default), or one colour that gets stronger (see brand/ab/weights). */
let look: 'heat' | 'gold' = 'heat';
export function setWeightsLook(l: 'heat' | 'gold'): void {
  look = l;
  requestOverlay();
}

let stroke = 0;
let painting: { layerId: Id; key: string; last: Pt } | null = null;
let cursor: Pt | null = null;

function dab(p: Pt, alt: boolean): void {
  const { doc, ui } = store().get();
  const t = paintTarget(doc, ui.activeLayerId);
  if (!t || !painting) return;
  const posed = meshAt(doc, t.layer, ui.frame) ?? t.layer.bind.mesh.points;
  const mode: BrushMode = alt && brush.mode !== 'smooth' ? (brush.mode === 'more' ? 'less' : 'more') : brush.mode;
  const next = paintWeights(t.layer.bind.mesh, t.rig.rig, paintBone(t), posed, { at: p, radius: brush.size, strength: brush.strength, mode });
  if (next !== t.layer.bind.mesh) setLayerMesh(t.layer.id, next, mode === 'smooth' ? 'Smooth bending' : 'Paint bending', painting.key);
}

/** Dabs along the way from the last point, a third of the brush apart, so a quick stroke has no gaps. */
function strokeTo(p: Pt, alt: boolean): void {
  if (!painting) return;
  const step = Math.max(1, brush.size / 3);
  const d = Math.hypot(p.x - painting.last.x, p.y - painting.last.y);
  if (d < step) return;
  const n = Math.floor(d / step);
  for (let i = 1; i <= n; i++) dab({ x: painting.last.x + ((p.x - painting.last.x) * i) / n, y: painting.last.y + ((p.y - painting.last.y) * i) / n }, alt);
  painting.last = { ...p };
}

export const weightsTool: Tool = {
  id: 'weights',
  group: 'rig',
  groupAt: 2,
  label: 'Paint how much it bends',
  icon: 'weights',
  layers: ['vector', 'pixel'],
  order: 72,
  help: 'rig-weights',
  cursor: 'none',
  options: WeightsOptions,
  down(e, ctx) {
    const t = paintTarget();
    if (!t) {
      ctx.hint(NO_MESH);
      return;
    }
    // Ctrl (or Cmd) + click picks the bone under the pointer to paint.
    if (e.mod) {
      const { doc, ui } = store().get();
      const hit = hitBone(rigStateAt(doc, t.rig, ui.frame), e, ctx.zoom);
      if (hit) {
        setRigUi({ selected: hit.id });
        ctx.hint(`Painting ${t.rig.rig.bones.find((b) => b.id === hit.id)?.name ?? 'that bone'}.`);
      }
      ctx.requestOverlay();
      return;
    }
    painting = { layerId: t.layer.id, key: `weights-${++stroke}`, last: { x: e.x, y: e.y } };
    dab(e, e.alt);
    ctx.requestOverlay();
  },
  move(e, ctx) {
    cursor = { x: e.x, y: e.y };
    strokeTo(e, e.alt);
    ctx.requestOverlay();
  },
  up(_e, ctx) {
    painting = null;
    ctx.requestOverlay();
  },
  hover(e, ctx) {
    cursor = { x: e.x, y: e.y };
    ctx.requestOverlay();
  },
  cancel(ctx) {
    painting = null;
    ctx.requestOverlay();
  },
  overlay(g, ctx) {
    drawWeightsOverlay(g, ctx);
  },
};

/** The heat map of the picked bone's pull over the bent layer, the bones, and the brush. */
export function drawWeightsOverlay(g: CanvasRenderingContext2D, ctx: Pick<ToolContext, 'zoom'>, opts: { cursor?: Pt | null } = {}): void {
  const { doc, ui } = store().get();
  const t = paintTarget(doc, ui.activeLayerId);
  const u = 1 / ctx.zoom;
  if (t) {
    const mesh = t.layer.bind.mesh;
    const pts = meshAt(doc, t.layer, ui.frame) ?? mesh.points;
    const w = boneWeights(mesh, paintBone(t));
    const tr = mesh.triangles;
    g.save();
    g.globalAlpha = 0.55;
    // Each triangle is split into three, one per corner, so the colours blend across it.
    for (let i = 0; i < tr.length; i += 3) {
      const a = tr[i], b = tr[i + 1], c = tr[i + 2];
      const cx = (pts[a * 2] + pts[b * 2] + pts[c * 2]) / 3;
      const cy = (pts[a * 2 + 1] + pts[b * 2 + 1] + pts[c * 2 + 1]) / 3;
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const v = (w[p] + w[q] + (w[a] + w[b] + w[c]) / 3) / 3;
        if (look === 'gold') g.fillStyle = `rgba(255,190,40,${(0.08 + v * 0.92).toFixed(3)})`;
        else {
          const [r, gg, bb] = heatColour(v);
          g.fillStyle = `rgb(${r},${gg},${bb})`;
        }
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(pts[p * 2], pts[p * 2 + 1]);
        g.lineTo(pts[q * 2], pts[q * 2 + 1]);
        g.closePath();
        g.fill();
      }
    }
    g.globalAlpha = 0.25;
    g.strokeStyle = '#1d1b26';
    g.lineWidth = u;
    g.beginPath();
    for (let i = 0; i < tr.length; i += 3) {
      const a = tr[i] * 2, b = tr[i + 1] * 2, c = tr[i + 2] * 2;
      g.moveTo(pts[a], pts[a + 1]);
      g.lineTo(pts[b], pts[b + 1]);
      g.lineTo(pts[c], pts[c + 1]);
      g.closePath();
    }
    g.stroke();
    g.restore();
    drawSkeleton(g, rigStateAt(doc, t.rig, ui.frame), ctx.zoom, { selected: paintBone(t), look: rigUi().look, faded: true });
  }
  const at = opts.cursor === undefined ? cursor : opts.cursor;
  if (at) {
    g.save();
    g.beginPath();
    g.arc(at.x, at.y, brush.size, 0, Math.PI * 2);
    g.lineWidth = 2.5 * u;
    g.strokeStyle = '#1d1b26';
    g.stroke();
    g.lineWidth = 1.2 * u;
    g.strokeStyle = cssVar('--sunny') || '#ffc94a';
    g.stroke();
    g.beginPath();
    g.arc(at.x, at.y, brush.size * 0.5, 0, Math.PI * 2);
    g.setLineDash([3 * u, 3 * u]);
    g.lineWidth = u;
    g.stroke();
    g.restore();
  }
}

