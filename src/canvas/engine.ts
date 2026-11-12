/**
 * The canvas engine: owns the two canvases (stage content and tool overlay), turns pointer, wheel and key events
 * into tool gestures and view changes, and redraws only when something changed. React mounts it (CanvasView.tsx) but
 * stays out of the hot path: nothing here goes through React state while you draw.
 */
import { currentChoice, withChoice } from '../core/choices';
import { getCommand, getTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store, type State } from '../core/store';
import { activeLayer } from '../tools/edit';
import './choices';
import type { SpaceTapMode, WheelMode } from './choices';
import * as ctl from './controller';
import { LIGHT_TABLE_OPACITY, lightTableItems, lightTableTint } from './lightTable';
import { pressesControl, SpaceTap, wheelIntent } from './input';
import { perf } from './perf';
import { neighbourFrames, upcomingFrames } from '../timeline/playback';
import { FramePainter } from './pipeline';
import { subscribeTileUi, tileModeOn } from '../tiles/state';
import { subscribePrefs } from '../ui/prefs';
import { anyOverlayOpen } from '../ui/overlays';
import { controlWantsKey } from '../ui/keyboard';
import { drawTileModeFrame, tileCopyAlpha } from '../tiles/look';
import { maskFocusChanged } from '../effects/stage';
import { cssVar, subscribeTheme } from './theme';
import { getViewSettings, subscribeViewSettings } from './viewSettings';
import { ghostItems } from './ghost';
import { drawDecorations } from './decorations';
import { canvasCamera, canvasLayerCamera, currentView, lookingThrough, overlayCamera, stageCamera } from '../camera/ops';
import { cameraFrameCorners, matrixScale } from '../core/camera';
import { invert, applyMat, type Mat } from '../core/symbols';
import { screenToDoc, stageDeviceRect, wheelZoomFactor, zoomAbout, type Pt } from './view';
import { overlayMatrix, STAGE_TOOLS, toLayerSpace } from '../rig/pose';

export interface EngineElements {
  root: HTMLElement;
  stage: HTMLElement;
  main: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
}

type Gesture =
  | { kind: 'pan'; pointerId: number; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'tool'; pointerId: number; tool: Tool; restoreTool: string | null }
  | { kind: 'grab'; pointerId: number; grab: ctl.CanvasGrab };

/** Spare time per tick that playback may spend rasterising upcoming frames, in ms. */
export const WARM_SLICE_MS = 5;
/** A tick whose own paint took longer than this does no look-ahead work. */
const WARM_SKIP_AFTER_MS = 8;

/** The pixel grid appears once an art pixel is at least this many screen pixels wide (600% on 1:1 pixel art). */
export const GRID_MIN_CELL = 6;

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (TYPING.test(el.tagName)) {
    const type = (el as HTMLInputElement).type;
    // Sliders, colour inputs and checkboxes don't take typing.
    return !type || !['range', 'color', 'checkbox', 'radio', 'button'].includes(type);
  }
  return el.isContentEditable;
}

export class CanvasEngine {
  private mg: CanvasRenderingContext2D;
  private og: CanvasRenderingContext2D;
  private painter = new FramePainter();
  private raf = 0;
  private dirtyMain = true;
  private dirtyOverlay = true;
  private gesture: Gesture | null = null;
  private spaceDown = false;
  private spaceTap = new SpaceTap();
  private altDown = false;
  private inside = false;
  private cursorOverride: string | null = null;
  /** The cursor for a canvas handle under the pointer (a vanishing point), or null. */
  private grabHover: string | null = null;
  private lastPtr: ToolPointer | null = null;
  private selfSwitch = false;
  private zoomingUntil = 0;
  private idleHandle = 0;
  private settleTimer = 0;
  private prev: State;
  private docId: string;
  private bounds = { left: 0, top: 0 };
  private cleanups: (() => void)[] = [];
  private lastDpr = 0;
  /** Called with a friendly message to show near the canvas. */
  onHint: ((msg: string) => void) | null = null;

  readonly ctx: ToolContext;

  constructor(private els: EngineElements) {
    this.mg = els.main.getContext('2d')!;
    this.og = els.overlay.getContext('2d', { desynchronized: true } as CanvasRenderingContext2DSettings)!;
    this.prev = store().get();
    if (perf) perf.painter = this.painter;
    this.docId = this.prev.doc.id;
    const self = this;
    this.ctx = {
      get zoom() {
        return store().get().ui.zoom;
      },
      requestOverlay: () => this.invalidate(false, true),
      hint: (m) => self.onHint?.(m),
    };
  }

  // ---------------------------------------------------------------- lifecycle

  mount(): () => void {
    const { root } = this.els;
    ctl.setSink({
      main: () => this.invalidate(true, false),
      overlay: () => this.invalidate(false, true),
      hint: (m) => this.onHint?.(m),
      cursor: (c) => {
        this.cursorOverride = c;
        this.updateCursor();
      },
    });
    this.listen(root, 'pointerdown', this.onPointerDown as EventListener);
    this.listen(root, 'pointermove', this.onPointerMove as EventListener);
    this.listen(root, 'pointerup', this.onPointerUp as EventListener);
    this.listen(root, 'pointercancel', this.onPointerCancel as EventListener);
    this.listen(root, 'pointerenter', () => ((this.inside = true), this.updateCursor()));
    this.listen(root, 'pointerleave', () => {
      this.inside = false;
      if (!this.gesture) {
        ctl.setHover(null);
        this.invalidate(false, true);
      }
    });
    this.listen(root, 'contextmenu', (e) => e.preventDefault());
    this.listen(root, 'wheel', this.onWheel as EventListener, { passive: false });
    this.listen(window, 'keydown', this.onKeyDown as EventListener, { capture: true });
    this.listen(window, 'keyup', this.onKeyUp as EventListener, { capture: true });
    this.listen(window, 'blur', () => {
      this.spaceDown = false;
      this.spaceTap.reset();
      this.altDown = false;
      this.updateCursor();
    });
    this.listen(window, 'resize', () => this.resize());
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(root);
    this.cleanups.push(() => ro.disconnect());
    this.cleanups.push(store().subscribe(this.onStore));
    this.cleanups.push(subscribeViewSettings(() => this.invalidate(true, true)));
    this.cleanups.push(subscribeTileUi(() => this.invalidate(true, true)));
    this.cleanups.push(subscribePrefs(() => this.invalidate(true, true)));
    // Grid and handle colours come from theme tokens, so a theme or look change repaints both canvases.
    this.cleanups.push(subscribeTheme(() => this.invalidate(true, true)));
    this.resize();
    ctl.fit();
    return () => this.destroy();
  }

  destroy(): void {
    this.cancelGesture();
    for (const c of this.cleanups.splice(0)) c();
    ctl.setSink(null);
    ctl.setLive(null);
    cancelAnimationFrame(this.raf);
    clearTimeout(this.settleTimer);
    if (this.idleHandle) (window.cancelIdleCallback ? window.cancelIdleCallback(this.idleHandle) : clearTimeout(this.idleHandle));
    this.painter.clear();
  }

  private listen(t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions): void {
    t.addEventListener(type, fn, opts);
    this.cleanups.push(() => t.removeEventListener(type, fn, opts));
  }

  // ---------------------------------------------------------------- sizing

  private resize = (): void => {
    const { root, main, overlay } = this.els;
    const w = Math.max(1, root.clientWidth);
    const h = Math.max(1, root.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const dw = Math.max(1, Math.round(w * dpr));
    const dh = Math.max(1, Math.round(h * dpr));
    const changed = main.width !== dw || main.height !== dh || dpr !== this.lastDpr;
    this.lastDpr = dpr;
    if (changed) {
      main.width = overlay.width = dw;
      main.height = overlay.height = dh;
      this.painter.clear();
    }
    ctl.setViewport({ w, h, dpr });
    if (ctl.isAutoFit()) ctl.fit();
    this.invalidate(true, true);
  };

  // ---------------------------------------------------------------- redraw scheduling

  invalidate(main: boolean, overlay: boolean): void {
    if (main) this.dirtyMain = true;
    if (overlay) this.dirtyOverlay = true;
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    this.raf = 0;
    let mainMs = 0;
    if (this.dirtyMain) {
      const t0 = performance.now();
      this.drawMain();
      const t1 = performance.now();
      mainMs = t1 - t0;
      if (perf) {
        perf.mainMs.push(mainMs);
        perf.painted.push({ t: t1, frame: store().get().ui.frame });
      }
    }
    const ui = store().get().ui;
    if (ui.playing) this.warmAhead(mainMs);
    else if (this.dirtyMain === false && mainMs) this.scheduleIdleWarm();
    if (this.dirtyOverlay) {
      const t0 = perf ? performance.now() : 0;
      this.drawOverlay();
      if (perf) {
        const t1 = performance.now();
        perf.overlayMs.push(t1 - t0);
        for (const ts of perf.pending) perf.latency.push(t1 - ts);
        perf.pending.length = 0;
      }
    }
  };

  /**
   * While playing, rasterise the frames coming up in the spare time of each tick (a frame is on screen for several
   * ticks), so by the time the playhead gets there it's only a blit. Gives up the tick quickly when painting this
   * frame already used a lot of it.
   */
  private warmAhead(mainMs: number): void {
    if (mainMs > WARM_SKIP_AFTER_MS) return this.keepWarming();
    const start = performance.now();
    const { doc, ui } = store().get();
    const { dpr } = ctl.getViewport();
    const rect = stageDeviceRect({ zoom: ui.zoom, panX: ui.panX, panY: ui.panY }, doc.width, doc.height, dpr);
    const depth = this.painter.warmDepth(doc, rect);
    if (!depth) return;
    const frames = upcomingFrames(doc, ui.frame, depth, ui.loopPlayback, undefined, !!ui.pingPong);
    if (!frames.length) return;
    const done = this.painter.warm(doc, frames, rect, this.els.main.width, this.els.main.height, start + WARM_SLICE_MS);
    if (!done) this.keepWarming();
  }

  /**
   * After you land on a frame (stepping, scrubbing, a click on the timeline), rasterise the frames either side of it
   * while the machine is idle, so the next step is a blit. Never competes with drawing: it runs in idle callbacks.
   */
  private scheduleIdleWarm(): void {
    if (this.gesture || this.idleHandle || performance.now() < this.zoomingUntil) return;
    const ric = (window as unknown as { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const run = (d?: { timeRemaining(): number }) => {
      this.idleHandle = 0;
      const { doc, ui } = store().get();
      if (ui.playing || this.gesture || performance.now() < this.zoomingUntil) return;
      const { dpr } = ctl.getViewport();
      const rect = stageDeviceRect({ zoom: ui.zoom, panX: ui.panX, panY: ui.panY }, doc.width, doc.height, dpr);
      const frames = neighbourFrames(ui.frame, doc.length, Math.min(2, this.painter.warmDepth(doc, rect)));
      if (!frames.length) return;
      const budget = d ? Math.max(1, d.timeRemaining() - 2) : WARM_SLICE_MS;
      const done = this.painter.warm(doc, frames, rect, this.els.main.width, this.els.main.height, performance.now() + budget);
      if (!done) this.scheduleIdleWarm();
    };
    if (ric) this.idleHandle = ric.call(window, run, { timeout: 1000 });
    else this.idleHandle = window.setTimeout(run, 60);
  }

  private keepWarming(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private onStore = (): void => {
    const s = store().get();
    const p = this.prev;
    this.prev = s;
    if (s === p) return;
    if (s.doc.id !== this.docId) {
      this.docId = s.doc.id;
      this.painter.clear();
      ctl.setLive(null);
      ctl.fit();
    }
    const u = s.ui;
    const q = p.ui;
    if (s.doc !== p.doc || u.frame !== q.frame || u.zoom !== q.zoom || u.panX !== q.panX || u.panY !== q.panY || u.onion !== q.onion || u.lightTable !== q.lightTable || u.playing !== q.playing || maskFocusChanged(s, p)) {
      if (u.zoom !== q.zoom) this.zoomingUntil = performance.now() + 160;
      this.invalidate(true, true);
    } else {
      this.invalidate(false, true);
    }
    if (u.tool !== q.tool) {
      if (this.gesture?.kind === 'tool' && !this.selfSwitch) this.cancelGesture();
      if (!this.selfSwitch) getTool(q.tool)?.leave?.(this.ctx);
      this.updateCursor();
    }
  };

  private drawMain(): void {
    this.dirtyMain = false;
    const { doc, ui } = store().get();
    const { dpr } = ctl.getViewport();
    const rect = stageDeviceRect({ zoom: ui.zoom, panX: ui.panX, panY: ui.panY }, doc.width, doc.height, dpr);

    const st = this.els.stage.style;
    st.left = rect.x / dpr + 'px';
    st.top = rect.y / dpr + 'px';
    st.width = rect.w / dpr + 'px';
    st.height = rect.h / dpr + 'px';
    st.background = doc.background ?? '';
    this.els.stage.classList.toggle('cv-checker', !doc.background);

    const zooming = performance.now() < this.zoomingUntil;
    const lt = ui.playing ? [] : lightTableItems(doc, ui.lightTable, ui.frame);
    const settled = this.painter.paint(this.mg, {
      doc,
      frame: ui.frame,
      rect,
      width: this.els.main.width,
      height: this.els.main.height,
      live: ctl.getLive(),
      onion: ui.onion,
      playing: ui.playing,
      zooming,
      tileMode: tileModeOn(),
      tileCopyAlpha: tileCopyAlpha(),
      camera: canvasCamera()?.view,
      pasteboard: !ui.playing && !doc.editing?.length && !!stageCamera(doc) && !lookingThrough() ? { frame: cameraFrameNow() } : undefined,
      activeLayerId: ui.activeLayerId,
      ghost: getViewSettings().emptyGhost && !ui.playing && !ui.onion.enabled ? ghostItems(doc, ui.frame).filter((g) => !lt.some((l) => l.drawing === g.drawing)) : undefined,
      lightTable: lt.length ? { items: lt, alpha: ui.lightTable?.opacity ?? LIGHT_TABLE_OPACITY, tint: lightTableTint() } : undefined,
    });
    if (!settled) {
      clearTimeout(this.settleTimer);
      this.settleTimer = window.setTimeout(() => {
        this.zoomingUntil = 0;
        this.invalidate(true, false);
      }, 170);
    }
  }

  private drawOverlay(): void {
    this.dirtyOverlay = false;
    const g = this.og;
    const { doc, ui } = store().get();
    const { dpr } = ctl.getViewport();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.els.overlay.width, this.els.overlay.height);
    if (ui.playing) return;
    const rect = stageDeviceRect({ zoom: ui.zoom, panX: ui.panX, panY: ui.panY }, doc.width, doc.height, dpr);
    if (tileModeOn()) drawTileModeFrame(g, rect, dpr);
    this.drawPixelGrid(g, rect, ui.zoom, dpr);
    // Looking through the camera, everything drawn in stage space goes through it too.
    const cam = canvasCamera()?.matrix;
    const stageSpace = () => {
      g.setTransform(rect.w / doc.width, 0, 0, rect.h / doc.height, rect.x, rect.y);
      if (cam) g.transform(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    };
    g.save();
    stageSpace();
    drawDecorations(g, this.ctx);
    g.restore();
    const tool = this.gesture?.kind === 'tool' ? this.gesture.tool : getTool(ui.tool);
    // What is aimed at, and drawn over, the picked layer goes through that layer's own camera speed (a layer at another
    // depth): the tool's marks, guides, grid, the selection edge and the handles. The page frame stays with the plain camera.
    const lc = cam ? overlayCamera(STAGE_TOOLS.has(tool?.id ?? ui.tool)) : null;
    const layerSpace = () => {
      g.setTransform(rect.w / doc.width, 0, 0, rect.h / doc.height, rect.x, rect.y);
      if (lc) g.transform(lc[0], lc[1], lc[2], lc[3], lc[4], lc[5]);
    };
    if (tool?.overlay && !(this.gesture?.kind === 'pan')) {
      g.save();
      layerSpace();
      const bm = overlayMatrix(doc, ui.activeLayerId, ui.frame, tool.id);
      if (bm) g.transform(bm[0], bm[1], bm[2], bm[3], bm[4], bm[5]);
      tool.overlay(g, this.ctx);
      g.restore();
    }
    const extra = ctl.getStageOverlays();
    if (extra.length) {
      g.save();
      layerSpace();
      for (const fn of extra) fn(g, ui.zoom);
      g.restore();
    }
  }

  private drawPixelGrid(g: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, zoom: number, dpr: number): void {
    if (!getViewSettings().pixelGrid) return;
    const { layer } = activeLayer();
    if (!layer || layer.kind !== 'pixel' || layer.pixelSize * zoom < GRID_MIN_CELL) return;
    const { doc } = store().get();
    const cols = Math.ceil(doc.width / layer.pixelSize);
    const rows = Math.ceil(doc.height / layer.pixelSize);
    const lc = canvasLayerCamera();
    if (lc) {
      this.drawPixelGridThroughCamera(g, rect, layer.pixelSize, cols, rows, lc, zoom);
      return;
    }
    const cell = layer.pixelSize * zoom * dpr;
    const W = this.els.overlay.width;
    const H = this.els.overlay.height;
    const i0 = Math.max(0, Math.floor(-rect.x / cell));
    const i1 = Math.min(cols, Math.ceil((W - rect.x) / cell));
    const j0 = Math.max(0, Math.floor(-rect.y / cell));
    const j1 = Math.min(rows, Math.ceil((H - rect.y) / cell));
    const y0 = rect.y + j0 * cell;
    const y1 = rect.y + j1 * cell;
    const x0 = rect.x + i0 * cell;
    const x1 = rect.x + i1 * cell;
    g.save();
    g.beginPath();
    for (let i = i0; i <= i1; i++) {
      const x = Math.round(rect.x + i * cell) + 0.5;
      g.moveTo(x, y0);
      g.lineTo(x, y1);
    }
    for (let j = j0; j <= j1; j++) {
      const y = Math.round(rect.y + j * cell) + 0.5;
      g.moveTo(x0, y);
      g.lineTo(x1, y);
    }
    g.globalAlpha = 0.4;
    g.strokeStyle = cssVar('--faint', '#7d7591');
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }

  /** The pixel grid when looking through the camera: its lines turn and scale with the picture, so they sit on the cells. */
  private drawPixelGridThroughCamera(g: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, ps: number, cols: number, rows: number, m: Mat, zoom: number): void {
    const scale = matrixScale(m);
    if (ps * zoom * scale < GRID_MIN_CELL) return;
    const { doc } = store().get();
    g.save();
    g.beginPath();
    g.rect(rect.x, rect.y, rect.w, rect.h);
    g.clip();
    g.setTransform(rect.w / doc.width, 0, 0, rect.h / doc.height, rect.x, rect.y);
    g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    g.beginPath();
    for (let i = 0; i <= cols; i++) {
      g.moveTo(i * ps, 0);
      g.lineTo(i * ps, rows * ps);
    }
    for (let j = 0; j <= rows; j++) {
      g.moveTo(0, j * ps);
      g.lineTo(cols * ps, j * ps);
    }
    g.globalAlpha = 0.4;
    g.strokeStyle = cssVar('--faint', '#7d7591');
    // One device pixel wide whatever the zoom.
    g.lineWidth = 1 / ((rect.w / doc.width) * scale);
    g.stroke();
    g.restore();
  }

  // ---------------------------------------------------------------- cursor

  private currentTool(): Tool | undefined {
    return getTool(store().get().ui.tool);
  }

  private updateCursor(): void {
    let c: string;
    if (this.gesture?.kind === 'pan') c = 'grabbing';
    else if (this.gesture?.kind === 'grab') c = 'grabbing';
    else if (this.grabHover && !this.spaceDown) c = this.grabHover;
    else if (this.spaceDown && this.inside) c = 'grab';
    else if (this.cursorOverride) c = this.cursorOverride;
    else {
      const t = this.currentTool();
      if (t?.id === 'hand') c = 'grab';
      else if (t?.id === 'zoom') c = this.altDown ? 'zoom-out' : 'zoom-in';
      else c = t?.cursor ?? 'crosshair';
    }
    if (this.els.root.style.cursor !== c) this.els.root.style.cursor = c;
  }

  // ---------------------------------------------------------------- pointer input

  private refreshBounds(): void {
    const r = this.els.root.getBoundingClientRect();
    this.bounds.left = r.left;
    this.bounds.top = r.top;
  }

  /** The screen point in stage space. `forTool`: through the picked layer's own camera speed (a layer at another depth). */
  private toDocPoint(e: { clientX: number; clientY: number }, forTool = false): Pt {
    const { zoom, panX, panY } = store().get().ui;
    const p = screenToDoc({ zoom, panX, panY }, e.clientX - this.bounds.left, e.clientY - this.bounds.top);
    // Through the camera, the screen shows camera space: tools still work in stage space.
    const cam = forTool ? overlayCamera(this.stageToolNow()) : canvasCamera()?.matrix;
    return cam ? applyMat(invert(cam), p.x, p.y) : p;
  }

  /** Bone, pose, hand and the like work on the stage as a whole, not on the picked layer's art. */
  private stageToolNow(): boolean {
    return STAGE_TOOLS.has(this.gesture?.kind === 'tool' ? this.gesture.tool.id : store().get().ui.tool);
  }

  /** On a layer attached to a bone, tools work on the part's own art where it is at rest. */
  private toLayerPoint(p: Pt): Pt {
    const { doc, ui } = store().get();
    return toLayerSpace(doc, ui.activeLayerId, ui.frame, this.gesture?.kind === 'tool' ? this.gesture.tool.id : ui.tool, p);
  }

  private toPointer(e: PointerEvent): ToolPointer {
    const p = this.toLayerPoint(this.toDocPoint(e, true));
    const pen = e.pointerType === 'pen';
    return {
      x: p.x,
      y: p.y,
      pressure: pen ? e.pressure || 0.5 : 0.5,
      hasPressure: pen,
      shift: e.shiftKey,
      alt: e.altKey,
      mod: e.ctrlKey || e.metaKey,
      button: e.button,
      pointerType: e.pointerType,
      time: e.timeStamp,
    };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.gesture) return;
    // Buttons floating over the canvas (the tile banner's Done, the edit bar) get their own click: capturing the
    // pointer here would send the release to the canvas and the click would never happen.
    if (pressesControl(e.target)) return;
    this.spaceTap.spoil();
    this.refreshBounds();
    const active = document.activeElement as HTMLElement | null;
    if (active && isTyping(active)) active.blur();
    const ui = store().get().ui;

    const penEraser = e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0);
    const wantPan = e.button === 1 || (e.button === 0 && (this.spaceDown || ui.tool === 'hand') && !penEraser);
    if (wantPan) {
      e.preventDefault();
      this.els.root.setPointerCapture(e.pointerId);
      this.gesture = { kind: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, panX: ui.panX, panY: ui.panY };
      this.updateCursor();
      return;
    }
    if (e.button !== 0 && !penEraser) return;
    // A press on another artboard opens it first, so the tool works there.
    ctl.runPointerDownHooks(this.toDocPoint(e), penEraser ? 'eraser' : ui.tool);

    // Handles that work with any tool (vanishing points) come before the tool.
    const grab = !penEraser && !ui.playing ? ctl.grabAt(this.toDocPoint(e, true), ui.zoom) : null;
    if (grab) {
      e.preventDefault();
      this.els.root.setPointerCapture(e.pointerId);
      this.gesture = { kind: 'grab', pointerId: e.pointerId, grab };
      grab.down(this.toDocPoint(e, true));
      this.updateCursor();
      this.invalidate(false, true);
      return;
    }

    const tool = penEraser ? getTool('eraser') : getTool(ui.tool);
    if (!tool) return;
    const layer = activeLayer().layer;
    if (layer && !tool.layers.includes(layer.kind)) {
      const kinds = tool.layers.join(' or ');
      this.ctx.hint(`${tool.label} works on ${kinds} layers. Pick one in the timeline first.`);
      return;
    }
    e.preventDefault();
    this.els.root.setPointerCapture(e.pointerId);
    let restoreTool: string | null = null;
    if (penEraser && ui.tool !== 'eraser') {
      restoreTool = ui.tool;
      this.selfSwitch = true;
      store().setUi({ tool: 'eraser' });
      this.selfSwitch = false;
    }
    this.gesture = { kind: 'tool', pointerId: e.pointerId, tool, restoreTool };
    const ptr = this.toPointer(e);
    this.lastPtr = ptr;
    ctl.setHover(null);
    tool.down?.(ptr, this.ctx);
    this.invalidate(false, true);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const g = this.gesture;
    if (!g) {
      if (e.buttons !== 0 && e.pointerType !== 'pen') return;
      this.inside = true;
      this.refreshBounds();
      this.altDown = e.altKey;
      const ui = store().get().ui;
      if (ui.playing) return;
      const ptr = this.toPointer(e);
      ctl.setHover({ x: ptr.x, y: ptr.y });
      const hg = ctl.grabAt(this.toDocPoint(e, true), ui.zoom);
      this.grabHover = hg ? (hg.cursor ?? 'move') : null;
      const tool = this.currentTool();
      tool?.hover?.(ptr, this.ctx);
      this.updateCursor();
      if (tool?.overlay) this.invalidate(false, true);
      return;
    }
    if (e.pointerId !== g.pointerId) return;
    if (g.kind === 'grab') {
      g.grab.move(this.toDocPoint(e, true), e.shiftKey);
      this.invalidate(false, true);
      return;
    }
    if (g.kind === 'pan') {
      ctl.setView(
        { zoom: store().get().ui.zoom, panX: g.panX + (e.clientX - g.startX), panY: g.panY + (e.clientY - g.startY) },
        true,
      );
      return;
    }
    if (perf) perf.pending.push(e.timeStamp);
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const events = list.length ? list : [e];
    let ptr = this.lastPtr!;
    for (const ce of events) {
      ptr = this.toPointer(ce);
      g.tool.move?.(ptr, this.ctx);
    }
    this.lastPtr = ptr;
    const pred = typeof e.getPredictedEvents === 'function' ? e.getPredictedEvents() : [];
    ctl.setPredicted(pred.map((pe) => this.toLayerPoint(this.toDocPoint(pe, true))));
    this.invalidate(false, true);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    if (this.els.root.hasPointerCapture(e.pointerId)) this.els.root.releasePointerCapture(e.pointerId);
    this.gesture = null;
    if (g.kind === 'tool') {
      ctl.setPredicted([]);
      g.tool.up?.(this.toPointer(e), this.ctx);
      this.restoreTool(g);
    } else if (g.kind === 'grab') g.grab.up(this.toDocPoint(e, true));
    this.lastPtr = null;
    this.updateCursor();
    this.invalidate(false, true);
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (this.gesture && e.pointerId === this.gesture.pointerId) this.cancelGesture();
  };

  private restoreTool(g: Gesture): void {
    if (g.kind === 'tool' && g.restoreTool) {
      this.selfSwitch = true;
      store().setUi({ tool: g.restoreTool });
      this.selfSwitch = false;
    }
  }

  cancelGesture(): void {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    if (this.els.root.hasPointerCapture?.(g.pointerId)) this.els.root.releasePointerCapture(g.pointerId);
    if (g.kind === 'grab') g.grab.cancel?.();
    if (g.kind === 'tool') {
      g.tool.cancel?.(this.ctx);
      ctl.setPredicted([]);
      ctl.setLive(null);
      this.restoreTool(g);
    }
    this.lastPtr = null;
    this.updateCursor();
    this.invalidate(true, true);
  }

  // ---------------------------------------------------------------- wheel and keys

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.refreshBounds();
    const sx = e.clientX - this.bounds.left;
    const sy = e.clientY - this.bounds.top;
    const v = { zoom: store().get().ui.zoom, panX: store().get().ui.panX, panY: store().get().ui.panY };
    const intent = wheelIntent(e, currentChoice<WheelMode>('canvas.wheel'));
    if (intent.kind === 'zoom') ctl.setView(zoomAbout(v, v.zoom * wheelZoomFactor(intent.factorDelta, e.deltaMode), sx, sy));
    else ctl.setView({ zoom: v.zoom, panX: v.panX - intent.dx, panY: v.panY - intent.dy });
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Alt') this.altDown = true;
    if (e.key === 'Escape' && this.gesture) {
      e.preventDefault();
      e.stopPropagation();
      this.cancelGesture();
      return;
    }
    if (isTyping(e.target)) return;
    if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey && (this.inside || this.gesture)) {
      // Holding Space turns any drag into a pan, so it must not also reach the shortcuts (or scroll something).
      e.preventDefault();
      e.stopPropagation();
      if (!this.spaceDown) {
        this.spaceDown = true;
        this.spaceTap.press(performance.now());
        this.updateCursor();
      }
      return;
    }
    if (this.spaceDown && !['Shift', 'Alt', 'Control', 'Meta'].includes(e.key)) this.spaceTap.spoil();
    // The chosen tool gets first go at a key between gestures (Enter finishes a pen path), unless a focused control
    // wants it.
    if (!this.gesture && !this.spaceDown && !controlWantsKey(e.target, e) && !anyOverlayOpen()) {
      const tool = this.currentTool();
      if (tool?.onKey?.(e, this.ctx)) {
        e.preventDefault();
        e.stopPropagation();
        this.invalidate(false, true);
        return;
      }
    }
    this.modifiersChanged(e);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Alt') this.altDown = false;
    if (e.code === 'Space' && this.spaceDown) {
      this.spaceDown = false;
      e.preventDefault();
      e.stopPropagation();
      this.updateCursor();
      if (this.spaceTap.release(performance.now()) && !this.gesture) this.onSpaceTap();
      return;
    }
    this.modifiersChanged(e);
  };

  /** A quick tap of Space: plays or pauses, if that's what the person wants (asked the first time). */
  private onSpaceTap(): void {
    withChoice<SpaceTapMode>('canvas.spaceTap', (v) => {
      if (v === 'play') void getCommand('timeline.play')?.run();
    });
  }

  /** Pressing Shift or Alt mid-drag changes the result (constrain, from centre) without the pointer moving. */
  private modifiersChanged(e: KeyboardEvent): void {
    const g = this.gesture;
    if (g?.kind !== 'tool' || !this.lastPtr || !['Shift', 'Alt', 'Control', 'Meta'].includes(e.key)) {
      this.updateCursor();
      return;
    }
    const ptr = { ...this.lastPtr, shift: e.shiftKey, alt: e.altKey, mod: e.ctrlKey || e.metaKey };
    this.lastPtr = ptr;
    g.tool.move?.(ptr, this.ctx);
    this.invalidate(false, true);
    this.updateCursor();
  }
}

/** The camera's view on the playhead's frame, as stage-space corners (for the pasteboard), when it's on. */
function cameraFrameNow(): { x: number; y: number }[] | undefined {
  const s = store().get();
  const cam = stageCamera(s.doc);
  const v = cam?.visible ? currentView(s) : undefined;
  return v ? cameraFrameCorners(s.doc, v) : undefined;
}
