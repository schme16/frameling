/**
 * On the canvas: the "Path to follow" tool (draw the line in-betweens travel along) and the motion trail, a dot for
 * every in-between of the key under the playhead, so you can see the spacing that the easing makes.
 */
import { celAt, findLayer } from '../core/doc';
import type { InstanceShape } from '../core/format';
import { registerTool, type Tool } from '../core/registry';
import { store } from '../core/store';
import { instanceAt, isInstance, nextKey, pairInstances, tweenInstance } from '../core/symbols';
import { cssVar } from '../canvas/theme';
import { registerDecoration } from '../canvas/decorations';
import { setMotionPath, simplify } from './ops';

let drawing: { x: number; y: number }[] | null = null;

export const motionPathTool: Tool = {
  id: 'motion-path',
  group: 'rig',
  groupAt: 3,
  label: 'Path to follow',
  icon: 'path',
  layers: ['vector'],
  order: 95,
  help: 'motion-paths',
  cursor: 'crosshair',
  down(e) {
    drawing = [{ x: e.x, y: e.y }];
  },
  move(e, ctx) {
    if (!drawing) return;
    drawing.push({ x: e.x, y: e.y });
    ctx.requestOverlay();
  },
  up(_e, ctx) {
    const pts = drawing;
    drawing = null;
    if (!pts || pts.length < 2) return;
    const r = setMotionPath(simplify(pts, 1.5 / ctx.zoom));
    if (!r) store().setUi({ tool: 'select' });
    else ctx.hint(r);
    ctx.requestOverlay();
  },
  cancel(ctx) {
    drawing = null;
    ctx.requestOverlay();
  },
  overlay(g, ctx) {
    if (!drawing || drawing.length < 2) return;
    g.lineWidth = 2 / ctx.zoom;
    g.strokeStyle = cssVar('--grape');
    g.setLineDash([6 / ctx.zoom, 4 / ctx.zoom]);
    g.beginPath();
    g.moveTo(drawing[0].x, drawing[0].y);
    for (const p of drawing) g.lineTo(p.x, p.y);
    g.stroke();
  },
};

registerTool(motionPathTool);

/** Where the first instance of the key under the playhead sits on each frame of its in-betweens. */
export function trailPoints(): { pts: { x: number; y: number }[]; line: { x: number; y: number }[]; current: number } | null {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, ui.activeLayerId);
  const cel = layer ? celAt(layer, ui.frame) : undefined;
  if (!layer || !cel?.tween || !nextKey(layer, cel)) return null;
  const d = doc.drawings[cel.drawingId];
  const first = d?.kind === 'vector' ? (d.shapes.find(isInstance) as InstanceShape | undefined) : undefined;
  if (!first) return null;
  const pts: { x: number; y: number }[] = [];
  for (let f = cel.start; f <= cel.start + cel.length; f++) {
    const at = f < cel.start + cel.length ? instanceAt(doc, layer, f, first.id) : undefined;
    if (at) pts.push({ x: at.transform.x, y: at.transform.y });
    else {
      // The end key: its own first instance.
      const n = celAt(layer, f);
      const nd = n ? doc.drawings[n.drawingId] : undefined;
      const s = nd?.kind === 'vector' ? (nd.shapes.find(isInstance) as InstanceShape | undefined) : undefined;
      if (s) pts.push({ x: s.transform.x, y: s.transform.y });
    }
  }
  // The route itself, evenly in time without easing, so a motion path shows as a smooth curve.
  const line: { x: number; y: number }[] = [];
  const nk = nextKey(layer, cel)!;
  const nd = doc.drawings[nk.drawingId];
  const to = nd?.kind === 'vector' ? pairInstances([first], nd.shapes.filter(isInstance))[0] : undefined;
  for (let k = 0; k <= 64; k++) {
    const at = tweenInstance(first, to, cel.tween, k / 64);
    line.push({ x: at.transform.x, y: at.transform.y });
  }
  return { pts, line, current: ui.frame - cel.start };
}

registerDecoration((g, ctx) => {
  const { ui } = store().get();
  if (ui.playing) return;
  const t = trailPoints();
  if (!t || t.pts.length < 2) return;
  const z = ctx.zoom;
  const ink = cssVar('--grape');
  g.lineWidth = 1.5 / z;
  g.strokeStyle = ink;
  g.globalAlpha = 0.55;
  g.setLineDash([4 / z, 4 / z]);
  g.beginPath();
  g.moveTo(t.line[0].x, t.line[0].y);
  for (const p of t.line) g.lineTo(p.x, p.y);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;
  t.pts.forEach((p, i) => {
    const end = i === 0 || i === t.pts.length - 1;
    g.beginPath();
    g.arc(p.x, p.y, (end ? 4.5 : i === t.current ? 4 : 2.5) / z, 0, Math.PI * 2);
    g.fillStyle = end ? ink : i === t.current ? cssVar('--sunny', '#ffc94a') : '#ffffff';
    g.fill();
    g.lineWidth = 1.2 / z;
    g.strokeStyle = ink;
    g.stroke();
  });
});
