/**
 * The camera on the canvas: its frame (what the camera sees) drawn over the stage, and the Camera tool that pans,
 * zooms and turns it. Looking through the camera, the tool drags the scene instead (Shift zooms, Alt turns).
 */
import type { CameraView } from '../core/format';
import { registerTool, type Tool, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { cameraFrameCorners, cameraMatrix } from '../core/camera';
import { applyMat, invert, type Mat } from '../core/symbols';
import { cssVar } from '../canvas/theme';
import { registerDecoration } from '../canvas/decorations';
import { canvasCamera, currentView, lookingThrough, setView, stageCamera } from './ops';

/** How the frame looks: A dims what's outside and draws a solid outline; B is a dashed viewfinder with corner marks. */
export type FrameLook = 'dim' | 'viewfinder';
let look: FrameLook = 'dim';
export function setFrameLook(l: FrameLook): void {
  look = l;
}
// For the A/B pictures: ?debug pages can switch the look.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) (globalThis as { __framelingCameraLook?: typeof setFrameLook }).__framelingCameraLook = setFrameLook;

const KNOB_GAP = 26;
const HANDLE = 6;

type P = { x: number; y: number };

function knobPoint(c: P[], zoom: number): P {
  // Above the middle of the top edge, away from the frame's centre.
  const mid = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 };
  const ctr = { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 };
  const dx = mid.x - ctr.x;
  const dy = mid.y - ctr.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: mid.x + (dx / len) * (KNOB_GAP / zoom), y: mid.y + (dy / len) * (KNOB_GAP / zoom) };
}

/** Draws the camera frame for a view, in stage space. `active` adds the handles. */
export function drawCameraFrame(g: CanvasRenderingContext2D, doc: { width: number; height: number }, view: CameraView, zoom: number, active: boolean, style: FrameLook = look): void {
  const c = cameraFrameCorners(doc, view);
  const accent = cssVar('--grape', '#9b7bff');
  const ink = '#1d1b26';
  g.save();
  if (style === 'dim') {
    // Everything outside the frame is dimmed, so what the camera sees stands out.
    g.beginPath();
    const big = 1e5;
    g.rect(-big, -big, big * 2, big * 2);
    g.moveTo(c[0].x, c[0].y);
    for (let i = 3; i >= 1; i--) g.lineTo(c[i].x, c[i].y);
    g.closePath();
    g.fillStyle = ink;
    g.globalAlpha = active ? 0.38 : 0.22;
    g.fill('evenodd');
    g.globalAlpha = 1;
    g.beginPath();
    g.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < 4; i++) g.lineTo(c[i].x, c[i].y);
    g.closePath();
    g.lineWidth = 2 / zoom;
    g.strokeStyle = accent;
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < 4; i++) g.lineTo(c[i].x, c[i].y);
    g.closePath();
    g.setLineDash([8 / zoom, 6 / zoom]);
    g.lineWidth = 1.5 / zoom;
    g.strokeStyle = accent;
    g.stroke();
    g.setLineDash([]);
    // Viewfinder corner marks.
    g.lineWidth = 3 / zoom;
    for (let i = 0; i < 4; i++) {
      const p = c[i];
      const a = c[(i + 1) % 4];
      const b = c[(i + 3) % 4];
      const k = 0.08;
      g.beginPath();
      g.moveTo(p.x + (a.x - p.x) * k, p.y + (a.y - p.y) * k);
      g.lineTo(p.x, p.y);
      g.lineTo(p.x + (b.x - p.x) * k, p.y + (b.y - p.y) * k);
      g.stroke();
    }
  }
  // A small tab naming it, with the zoom.
  const label = `Camera ${Math.round(view.zoom * 100)}%`;
  g.translate(c[0].x, c[0].y);
  g.rotate(Math.atan2(c[1].y - c[0].y, c[1].x - c[0].x));
  g.font = `600 ${11 / zoom}px system-ui, sans-serif`;
  const w = g.measureText(label).width + 10 / zoom;
  const h = 16 / zoom;
  g.fillStyle = accent;
  g.fillRect(0, -h, w, h);
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  g.fillText(label, 5 / zoom, -h / 2);
  g.restore();
  if (!active) return;
  g.save();
  g.lineWidth = 1.5 / zoom;
  for (const p of c) {
    g.fillStyle = '#ffffff';
    g.strokeStyle = accent;
    g.fillRect(p.x - HANDLE / zoom, p.y - HANDLE / zoom, (HANDLE * 2) / zoom, (HANDLE * 2) / zoom);
    g.strokeRect(p.x - HANDLE / zoom, p.y - HANDLE / zoom, (HANDLE * 2) / zoom, (HANDLE * 2) / zoom);
  }
  const k = knobPoint(c, zoom);
  const mid = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 };
  g.beginPath();
  g.moveTo(mid.x, mid.y);
  g.lineTo(k.x, k.y);
  g.strokeStyle = accent;
  g.stroke();
  g.beginPath();
  g.arc(k.x, k.y, 6 / zoom, 0, Math.PI * 2);
  g.fillStyle = cssVar('--sunny', '#ffc94a');
  g.fill();
  g.strokeStyle = ink;
  g.stroke();
  g.restore();
}

registerDecoration((g, ctx) => {
  const s = store().get();
  if (s.ui.playing || s.doc.editing?.length || lookingThrough(s)) return;
  const cam = stageCamera(s.doc);
  if (!cam || !cam.visible) return;
  const view = currentView(s);
  if (!view) return;
  drawCameraFrame(g, s.doc, view, ctx.zoom, s.ui.activeLayerId === cam.id && s.ui.tool === 'camera');
});

// ---------------------------------------------------------------- the Camera tool

type Grab = 'pan' | 'zoom' | 'turn';
let drag: { grab: Grab; start: P; view: CameraView; through: Mat | null; key: string } | null = null;

function hit(p: P, view: CameraView, zoom: number): Grab {
  const { doc } = store().get();
  const c = cameraFrameCorners(doc, view);
  const r = (HANDLE + 4) / zoom;
  const k = knobPoint(c, zoom);
  if (Math.hypot(p.x - k.x, p.y - k.y) <= r + 2 / zoom) return 'turn';
  if (c.some((q) => Math.hypot(p.x - q.x, p.y - q.y) <= r)) return 'zoom';
  return 'pan';
}

function angleDeg(a: P, b: P): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export const cameraTool: Tool = {
  id: 'camera',
  label: 'Camera',
  icon: 'camera',
  layers: ['camera'],
  order: 1,
  help: 'camera',
  cursor: 'move',
  down(e, ctx) {
    const s = store().get();
    const cam = stageCamera(s.doc);
    if (!cam) {
      ctx.hint('Add a camera first (Animate > Add a camera).');
      return;
    }
    if (cam.locked) {
      ctx.hint('The camera layer is locked. Unlock it in the timeline to move it.');
      return;
    }
    const view = currentView(s);
    if (!view) {
      ctx.hint('The camera has no key on this frame. Add one in the timeline first.');
      return;
    }
    const through = canvasCamera(s)?.matrix ?? null;
    drag = { grab: through ? 'pan' : hit(e, view, ctx.zoom), start: { x: e.x, y: e.y }, view: { ...view }, through, key: `camera-${Date.now()}` };
  },
  move(e, ctx) {
    if (!drag) return;
    const d = drag;
    const v = d.view;
    if (d.through) {
      // The tool gets stage points through the camera as it is now; map them back through the camera as it was,
      // so the scene follows the pointer without feeding back on itself.
      const now = canvasCamera()?.matrix ?? d.through;
      const raw = applyMat(invert(d.through), ...xy(applyMat(now, e.x, e.y)));
      const a = applyMat(d.through, d.start.x, d.start.y);
      const b = applyMat(d.through, raw.x, raw.y);
      if (e.shift) setView({ zoom: v.zoom * Math.pow(2, -(b.y - a.y) / 200) }, 'Zoom the camera', d.key);
      else if (e.alt) setView({ rotation: snap(v.rotation + (b.x - a.x) * 0.3, false) }, 'Turn the camera', d.key);
      else setView({ x: v.x - (raw.x - d.start.x), y: v.y - (raw.y - d.start.y) }, 'Move the camera', d.key);
    } else if (d.grab === 'pan') {
      setView({ x: v.x + (e.x - d.start.x), y: v.y + (e.y - d.start.y) }, 'Move the camera', d.key);
    } else if (d.grab === 'zoom') {
      const c = { x: v.x, y: v.y };
      const r0 = Math.hypot(d.start.x - c.x, d.start.y - c.y) || 1;
      const r1 = Math.max(1, Math.hypot(e.x - c.x, e.y - c.y));
      setView({ zoom: v.zoom * (r0 / r1) }, 'Zoom the camera', d.key);
    } else {
      const c = { x: v.x, y: v.y };
      const turn = angleDeg(c, e) - angleDeg(c, d.start);
      setView({ rotation: snap(v.rotation + turn, e.shift) }, 'Turn the camera', d.key);
    }
    ctx.requestOverlay();
  },
  up(_e, ctx) {
    drag = null;
    ctx.requestOverlay();
  },
  cancel(ctx) {
    drag = null;
    ctx.requestOverlay();
  },
  hover(e: ToolPointer, ctx) {
    void e;
    void ctx;
  },
};

function xy(p: P): [number, number] {
  return [p.x, p.y];
}

function snap(deg: number, on: boolean): number {
  const r = Math.round(deg * 10) / 10;
  return on ? Math.round(deg / 15) * 15 : r;
}

registerTool(cameraTool);

/** For the A/B pictures and tests: the frame's corners for a view. */
export { cameraFrameCorners, cameraMatrix };
