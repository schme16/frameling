/**
 * The "Record a move" tool: press on the canvas and the timeline plays from the playhead; whatever is selected follows
 * your hand while you drag, and when you let go the drag becomes keys (see recording.ts). Nothing here changes the
 * document for good: while dragging the thing is moved live, and at the end all of that is taken back and the result
 * is added as one undo step.
 */
import { celAt, findLayer } from '../core/doc';
import type { InstanceShape } from '../core/format';
import { MAX_RECORD_SECONDS, type Sample } from '../core/recordMotion';
import { registerTool, type Tool, type ToolContext } from '../core/registry';
import { store } from '../core/store';
import { isInstance } from '../core/symbols';
import { cssVar } from '../canvas/theme';
import { registerDecoration } from '../canvas/decorations';
import { toast } from '../ui/toast';
import { backTo, beginLive, clearTake, commitTake, getTake, historyMark, moveLive, recordWhere, takeIsLatest, type Live } from './recording';
import type { MotionWhere } from './motions';
import { RecordOptions } from './RecordOptions';

interface Going {
  live: Live;
  where: MotionWhere;
  saved: { frame: number; activeLayerId: string | null; selection: string[] };
  mark: number | null;
  /** The press, by the event clock (ms), and by the page clock (to drive the playhead). */
  t0: number;
  clock0: number;
  samples: Sample[];
  x0: number;
  y0: number;
  latest: { x: number; y: number };
  dirty: boolean;
  frame: number;
  raf: number;
  ctx: ToolContext;
}

let going: Going | null = null;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const frame = (cb: () => void): number => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : (setTimeout(cb, 16) as unknown as number));
const unframe = (id: number) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));

/** The playhead follows the clock while you drag, and the thing follows the hand. */
function tick(): void {
  const g = going;
  if (!g) return;
  const fps = store().get().doc.fps;
  const secs = Math.min(MAX_RECORD_SECONDS, (now() - g.clock0) / 1000);
  const f = g.live.start + Math.floor(secs * fps);
  const moved = f !== g.frame;
  if (moved) {
    g.frame = f;
    store().setUi({ frame: f, selection: g.live.targets });
  }
  if (g.dirty || moved) {
    g.dirty = false;
    moveLive(g.live, g.latest.x - g.x0, g.latest.y - g.y0, f);
    g.ctx.requestOverlay();
  }
  if (secs >= MAX_RECORD_SECONDS) {
    toast('That is the longest one recording can be (30 seconds), so it stopped there.', { kind: 'info' });
    finish(true);
    return;
  }
  g.raf = frame(tick);
}

/** Ends the drag: takes back everything done live, then turns what the hand did into keys. */
function finish(keep: boolean): void {
  const g = going;
  if (!g) return;
  going = null;
  unframe(g.raf);
  backTo(g.mark);
  store().setUi({ ...g.saved, playing: false });
  g.ctx.requestOverlay();
  if (keep && g.samples.length > 1) commitTake(g.samples, g.where, g.saved);
}

export const recordTool: Tool = {
  id: 'record-move',
  group: 'rig',
  groupAt: 4,
  label: 'Record a move',
  icon: 'record',
  layers: ['vector', 'pixel'],
  order: 96,
  help: 'record-motion',
  cursor: 'grab',
  options: RecordOptions,
  down(e, ctx) {
    if (going) return;
    clearTake();
    const w = recordWhere();
    if (!w) return void ctx.hint('Add a layer first, then draw something to move.');
    const { ui } = store().get();
    const saved = { frame: ui.frame, activeLayerId: ui.activeLayerId, selection: [...ui.selection] };
    const mark = historyMark();
    const r = beginLive(w);
    if ('why' in r) return void ctx.hint(r.why);
    store().setUi({ activeLayerId: r.live.layerId, selection: r.live.targets, playing: false });
    going = { live: r.live, where: w, saved, mark, t0: e.time, clock0: now(), samples: [{ t: 0, x: e.x, y: e.y }], x0: e.x, y0: e.y, latest: { x: e.x, y: e.y }, dirty: false, frame: ui.frame, raf: 0, ctx };
    going.raf = frame(tick);
  },
  move(e) {
    const g = going;
    if (!g) return;
    g.samples.push({ t: (e.time - g.t0) / 1000, x: e.x, y: e.y });
    g.latest = { x: e.x, y: e.y };
    g.dirty = true;
  },
  up(e) {
    const g = going;
    if (!g) return;
    g.samples.push({ t: (e.time - g.t0) / 1000, x: e.x, y: e.y });
    finish(true);
  },
  cancel() {
    if (!going) return;
    finish(false);
  },
  leave() {
    if (going) finish(false);
  },
  overlay(g, ctx) {
    const r = going;
    if (!r || r.samples.length < 2) return;
    g.lineWidth = 2.5 / ctx.zoom;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = cssVar('--grape');
    g.globalAlpha = 0.7;
    g.beginPath();
    g.moveTo(r.samples[0].x, r.samples[0].y);
    for (const p of r.samples) g.lineTo(p.x, p.y);
    g.stroke();
    g.globalAlpha = 1;
    const last = r.samples[r.samples.length - 1];
    g.beginPath();
    g.arc(last.x, last.y, 6 / ctx.zoom, 0, Math.PI * 2);
    g.fillStyle = cssVar('--sunny', '#ffc94a');
    g.fill();
    g.lineWidth = 1.5 / ctx.zoom;
    g.stroke();
  },
};

registerTool(recordTool);

/** After a recording: the hand's own route, faint, and a dot where each key landed, so tidying shows as fewer dots. */
registerDecoration((g, ctx) => {
  const t = getTake();
  if (!t || !takeIsLatest(t)) return;
  const { doc, ui } = store().get();
  if (ui.playing) return;
  const layer = findLayer(doc, ui.activeLayerId);
  if (!layer) return;
  const z = ctx.zoom;
  const ink = cssVar('--grape');
  // The hand's route, placed where the thing started.
  const first = t.samples[0];
  const start = celAt(layer, t.start);
  const d0 = start ? doc.drawings[start.drawingId] : undefined;
  const inst0 = d0?.kind === 'vector' ? (d0.shapes.find((s) => ui.selection.includes(s.id) && isInstance(s)) as InstanceShape | undefined) : undefined;
  if (!inst0 || !first || d0?.kind !== 'vector') return;
  const at = d0.shapes.indexOf(inst0);
  g.lineWidth = 1.5 / z;
  g.strokeStyle = ink;
  g.globalAlpha = 0.35;
  g.setLineDash([3 / z, 4 / z]);
  g.beginPath();
  t.samples.forEach((p, i) => {
    const x = inst0.transform.x + p.x - first.x;
    const y = inst0.transform.y + p.y - first.y;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;
  for (const c of layer.cels) {
    if (c.start < t.start || c.start > t.start + t.frames) continue;
    const dr = doc.drawings[c.drawingId];
    // The clones of a key keep their shapes in the same order, so the same place in the list is the same thing.
    const s = dr?.kind === 'vector' ? dr.shapes[at] : undefined;
    if (!s || s.type !== 'instance') continue;
    g.beginPath();
    g.arc(s.transform.x, s.transform.y, 4 / z, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 1.4 / z;
    g.strokeStyle = ink;
    g.stroke();
  }
});
