/**
 * The canvas engine: owns the two canvases (stage content and tool overlay), turns pointer, wheel and key events
 * into tool gestures and view changes, and redraws only when something changed. React mounts it (CanvasView.tsx) but
 * stays out of the hot path: nothing here goes through React state while you draw.
 */
import { getTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store, type State } from '../core/store';
import { activeLayer } from '../tools/edit';
import * as ctl from './controller';
import { FramePainter } from './pipeline';
import { cssVar } from './theme';
import { getViewSettings, subscribeViewSettings } from './viewSettings';
import { screenToDoc, stageDeviceRect, wheelZoomFactor, zoomAbout, type Pt } from './view';

export interface EngineElements {
  root: HTMLElement;
  stage: HTMLElement;
  main: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
}

type Gesture =
  | { kind: 'pan'; pointerId: number; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'tool'; pointerId: number; tool: Tool; restoreTool: string | null };

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
  private altDown = false;
  private inside = false;
  private cursorOverride: string | null = null;
  private lastPtr: ToolPointer | null = null;
  private selfSwitch = false;
  private zoomingUntil = 0;
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
      this.altDown = false;
      this.updateCursor();
    });
    this.listen(window, 'resize', () => this.resize());
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(root);
    this.cleanups.push(() => ro.disconnect());
    this.cleanups.push(store().subscribe(this.onStore));
    this.cleanups.push(subscribeViewSettings(() => this.invalidate(false, true)));
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
    if (this.dirtyMain) this.drawMain();
    if (this.dirtyOverlay) this.drawOverlay();
  };

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
    if (s.doc !== p.doc || u.frame !== q.frame || u.zoom !== q.zoom || u.panX !== q.panX || u.panY !== q.panY || u.onion !== q.onion || u.playing !== q.playing) {
      if (u.zoom !== q.zoom) this.zoomingUntil = performance.now() + 160;
      this.invalidate(true, true);
    } else {
      this.invalidate(false, true);
    }
    if (u.tool !== q.tool) {
      if (this.gesture?.kind === 'tool' && !this.selfSwitch) this.cancelGesture();
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
    this.drawPixelGrid(g, rect, ui.zoom, dpr);
    const tool = this.gesture?.kind === 'tool' ? this.gesture.tool : getTool(ui.tool);
    if (tool?.overlay && !(this.gesture?.kind === 'pan')) {
      g.save();
      g.setTransform(rect.w / doc.width, 0, 0, rect.h / doc.height, rect.x, rect.y);
      tool.overlay(g, this.ctx);
      g.restore();
    }
  }

  private drawPixelGrid(g: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, zoom: number, dpr: number): void {
    if (!getViewSettings().pixelGrid) return;
    const { layer } = activeLayer();
    if (!layer || layer.kind !== 'pixel' || layer.pixelSize * zoom < GRID_MIN_CELL) return;
    const { doc } = store().get();
    const cell = layer.pixelSize * zoom * dpr;
    const cols = Math.ceil(doc.width / layer.pixelSize);
    const rows = Math.ceil(doc.height / layer.pixelSize);
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

  // ---------------------------------------------------------------- cursor

  private currentTool(): Tool | undefined {
    return getTool(store().get().ui.tool);
  }

  private updateCursor(): void {
    let c: string;
    if (this.gesture?.kind === 'pan') c = 'grabbing';
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

  private toDocPoint(e: { clientX: number; clientY: number }): Pt {
    const { zoom, panX, panY } = store().get().ui;
    return screenToDoc({ zoom, panX, panY }, e.clientX - this.bounds.left, e.clientY - this.bounds.top);
  }

  private toPointer(e: PointerEvent): ToolPointer {
    const p = this.toDocPoint(e);
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
      const tool = this.currentTool();
      tool?.hover?.(ptr, this.ctx);
      this.updateCursor();
      if (tool?.overlay) this.invalidate(false, true);
      return;
    }
    if (e.pointerId !== g.pointerId) return;
    if (g.kind === 'pan') {
      ctl.setView(
        { zoom: store().get().ui.zoom, panX: g.panX + (e.clientX - g.startX), panY: g.panY + (e.clientY - g.startY) },
        true,
      );
      return;
    }
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const events = list.length ? list : [e];
    let ptr = this.lastPtr!;
    for (const ce of events) {
      ptr = this.toPointer(ce);
      g.tool.move?.(ptr, this.ctx);
    }
    this.lastPtr = ptr;
    const pred = typeof e.getPredictedEvents === 'function' ? e.getPredictedEvents() : [];
    ctl.setPredicted(pred.map((pe) => this.toDocPoint(pe)));
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
    }
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
    if (e.ctrlKey || e.metaKey) {
      ctl.setView(zoomAbout(v, v.zoom * wheelZoomFactor(e.deltaY, e.deltaMode), sx, sy));
      return;
    }
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    let dx = e.deltaX * scale;
    let dy = e.deltaY * scale;
    if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0];
    ctl.setView({ zoom: v.zoom, panX: v.panX - dx, panY: v.panY - dy });
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
        this.updateCursor();
      }
      return;
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
      return;
    }
    this.modifiersChanged(e);
  };

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
