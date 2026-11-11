import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { withChoice } from '../core/choices';
import { clashFor, type HoldChoice } from './choices';
import { celAt } from '../core/doc';
import type { Cel, Clip, Id, Layer } from '../core/format';
import { store, useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { say } from './commands';
import { keyHint } from './cmd';
import { MAX_LENGTH } from './edit-core';
import { frameAtX, holdWords, labelStep, visibleFrames, zoomScroll } from './geometry';
import { LayerList, LayerTools, ROW_H } from './Layers';
import { ContextMenu, InlineName, type MenuItem } from './Menu';
import * as ops from './ops';
import { goTo } from './playback';
import { nextKey } from '../core/symbols';
import { ease } from '../core/ease';
import { makeTween, removeTween } from '../symbols/ops';
import '../symbols/symbols.css';
import { MAX_CW, MIN_CW, setTl, tl, useTl } from './state';

export const SIDE_W = 216;
const RULER_H = 26;
const MARKS_H = 20;
const CLIPS_H = 22;
/** Empty frames shown past the end, so there is room to drag the end further out. */
const SLACK = 24;

type Drag =
  | { kind: 'scrub'; pause: boolean }
  | { kind: 'length' }
  | { kind: 'move'; layerId: Id; celId: Id; grab: number; startX: number; startY: number; moved: boolean }
  | { kind: 'resize'; layerId: Id; celId: Id; start: number }
  | { kind: 'marker'; id: Id; startX: number; moved: boolean }
  | { kind: 'clipNew'; a: number }
  | { kind: 'clip'; id: Id; startX: number; moved: boolean }
  | { kind: 'clipEdge'; id: Id; edge: 'start' | 'end' };

type Ghost =
  | { kind: 'cel'; layerId: Id; start: number; length: number; trim: boolean }
  | { kind: 'length'; length: number }
  | { kind: 'marker'; id: Id; frame: number }
  | { kind: 'clip'; id: Id | null; start: number; end: number };

// ---------------------------------------------------------------- the pieces that move often

/** The playhead: a pink line and a soft column on the frame you're on. It only re-renders when the frame changes. */
const Playhead = memo(function Playhead({ part, cw, activeRow }: { part: 'ruler' | 'rows'; cw: number; activeRow: number }) {
  const frame = useStore((s) => s.ui.frame);
  return (
    <div className={`tl-playhead is-${part}`} style={{ width: cw, transform: `translateX(${frame * cw}px)` }} aria-hidden="true">
      {part === 'ruler' ? <span className="tl-playhead-head">{cw >= 18 ? frame + 1 : ''}</span> : <span className="tl-cursor" style={{ top: activeRow * ROW_H, height: ROW_H }} />}
    </div>
  );
});

/** One layer's row of drawings. Only draws the cels that are on screen. */
const GridRow = memo(function GridRow({ layer, cw, from, to, active }: { layer: Layer; cw: number; from: number; to: number; active: boolean }) {
  const shown: Cel[] = [];
  for (const c of layer.cels) {
    if (c.start > to) break;
    if (c.start + c.length >= from) shown.push(c);
  }
  return (
    <div className={`tl-row${active ? ' is-active' : ''}${layer.visible ? '' : ' is-hidden'}${layer.locked ? ' is-locked' : ''}`} style={{ height: ROW_H }} data-layer={layer.id}>
      {shown.map((c) => (
        <div key={c.id} className="tl-cel" data-cel={c.id} style={{ left: c.start * cw + 1, width: c.length * cw - 2 }}>
          <span className="tl-cel-key" style={{ width: Math.min(cw, c.length * cw) - 2 }}>
            <i className="tl-cel-dot" />
          </span>
          {c.tween ? <TweenBar layer={layer} cel={c} cw={cw} /> : null}
          <span className="tl-cel-handle" title="Drag to hold this drawing for longer or shorter" />
        </div>
      ))}
    </div>
  );
});

/** In-betweens on a key: a band with an arrow to the next key (dashed when the keys don't touch). */
function TweenBar({ layer, cel, cw }: { layer: Layer; cel: Cel; cw: number }) {
  const next = nextKey(layer, cel);
  return (
    <span className={`tl-tween${next ? '' : ' is-broken'}`} style={{ left: Math.min(cw, cel.length * cw) - 2, right: 0 }} title={next ? 'In-betweens: Frameling draws these frames' : "In-betweens with no key straight after, so nothing moves"} />
  );
}

function Ruler({ cw, from, to, length, fps, total, ghostLength }: { cw: number; from: number; to: number; length: number; fps: number; total: number; ghostLength: number | null }) {
  const onion = useStore((s) => s.ui.onion);
  // Only the onion shading follows the frame, so the ruler stays still while playing when it is off.
  const frame = useStore((s) => (s.ui.onion.enabled ? s.ui.frame : -1));
  const step = labelStep(cw);
  const labels: number[] = [];
  const secs: number[] = [];
  for (let f = Math.max(0, from); f <= Math.min(total, to); f++) {
    if (f === 0 || (f + 1) % step === 0) labels.push(f);
    if (f > 0 && f % fps === 0) secs.push(f);
  }
  const clipId = useTl((t) => t.clipId);
  const clip = useStore((s) => (clipId ? s.doc.clips.find((c) => c.id === clipId) : undefined));
  const shade = (a: number, b: number, color: string, key: string) => {
    const lo = Math.max(0, a);
    const hi = Math.min(length - 1, b);
    return hi < lo ? null : <i key={key} className="tl-onion-shade" style={{ left: lo * cw, width: (hi - lo + 1) * cw, background: `color-mix(in srgb, ${color} 42%, transparent)` }} />;
  };
  const end = ghostLength ?? length;
  return (
    <div className="tl-ruler" data-region="ruler" data-quest="timeline-ruler" style={{ height: RULER_H }}>
      {clip ? <i className="tl-range-shade" style={{ left: clip.start * cw, width: (clip.end - clip.start + 1) * cw }} /> : null}
      {onion.enabled ? [shade(frame - onion.before, frame - 1, onion.beforeColor, 'b'), shade(frame + 1, frame + onion.after, onion.afterColor, 'a')] : null}
      {labels.map((f) => (
        <span key={`n${f}`} className="tl-num" style={{ left: f * cw, width: cw }}>
          {f + 1}
        </span>
      ))}
      {secs.map((f) => (
        <span key={`s${f}`} className="tl-sec" style={{ left: f * cw }}>
          {cw * fps >= 36 ? <span className="tl-sec-label">{f / fps}s</span> : null}
        </span>
      ))}
      <span className="tl-beyond" style={{ left: end * cw }} />
      <button type="button" className="tl-length" style={{ left: end * cw - 7 }} title="Drag to make your animation longer or shorter" aria-label={`Animation length: ${end} frames. Drag to change.`} tabIndex={-1}>
        <span />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- markers and clips rows

function MarkersRow({ cw, from, to }: { cw: number; from: number; to: number }) {
  const markers = useStore((s) => s.doc.markers);
  const editing = useTl((t) => (t.editing?.kind === 'marker' ? t.editing.id : null));
  return (
    <div className="tl-marks" data-region="markers" style={{ height: MARKS_H }} title="Double-click to add a marker: a named moment, like a footstep">
      {markers
        .filter((m) => m.frame >= from && m.frame <= to)
        .map((m) => (
          <div key={m.id} className="tl-marker" data-marker={m.id} style={{ left: m.frame * cw }} title={`${m.name} (frame ${m.frame + 1}). Double-click to rename, drag to move.`}>
            <Icon name="marker" size={12} />
            {editing === m.id ? (
              <InlineName
                label="Marker name"
                value={m.name}
                onDone={(v) => {
                  setTl({ editing: null });
                  if (v !== null) ops.renameMarker(m.id, v);
                }}
              />
            ) : (
              <span className="tl-marker-name">{m.name}</span>
            )}
          </div>
        ))}
    </div>
  );
}

function ClipsRow({ cw, from, to }: { cw: number; from: number; to: number }) {
  const clips = useStore((s) => s.doc.clips);
  const editing = useTl((t) => (t.editing?.kind === 'clip' ? t.editing.id : null));
  const picked = useTl((t) => t.clipId);
  return (
    <div className="tl-clips" data-region="clips" style={{ height: CLIPS_H }} title="Drag across frames to make a clip: a named stretch like idle or run">
      {clips
        .filter((c) => c.end >= from && c.start <= to)
        .map((c) => (
          <div key={c.id} className={`tl-clip${picked === c.id ? ' is-picked' : ''}`} data-clip={c.id} style={{ left: c.start * cw + 1, width: (c.end - c.start + 1) * cw - 2 }} title={`${c.name}: frames ${c.start + 1} to ${c.end + 1}${c.loop ? ', loops' : ''}. Click to play just this clip. Double-click to rename.`}>
            <span className="tl-clip-edge is-start" data-edge="start" />
            {editing === c.id ? (
              <InlineName
                label="Clip name"
                value={c.name}
                onDone={(v) => {
                  setTl({ editing: null });
                  if (v !== null) ops.renameClip(c.id, v);
                }}
              />
            ) : (
              <span className="tl-clip-name">{c.name}</span>
            )}
            {c.loop ? <Icon name="loop" size={11} className="tl-clip-loop" /> : null}
            <span className="tl-clip-edge is-end" data-edge="end" />
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------- the whole scrolling area

export function TimelineBody() {
  const layers = useStore((s) => s.doc.layers);
  const length = useStore((s) => s.doc.length);
  const fps = useStore((s) => s.doc.fps);
  const activeId = useStore((s) => s.ui.activeLayerId) ?? layers[layers.length - 1]?.id;
  const cw = useTl((t) => t.cw);

  const scroller = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [view, setView] = useState({ left: 0, width: 800 });
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const keepScroll = useRef<number | null>(null);

  // What's on screen, so a 500 frame animation with 20 layers draws a few hundred things, not thousands.
  const { from, to } = visibleFrames(view.left, view.width - SIDE_W, cw);
  const contentEnd = useMemo(() => layers.reduce((n, l) => Math.max(n, l.cels.length ? l.cels[l.cels.length - 1].start + l.cels[l.cels.length - 1].length : 0), 0), [layers]);
  const total = Math.max(length, contentEnd) + SLACK;
  const activeRow = Math.max(0, layers.findIndex((l) => l.id === activeId));
  const activeDisplayRow = layers.length - 1 - activeRow;

  // Track the scroll position and size.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      setView((v) => (v.left === el.scrollLeft && v.width === el.clientWidth ? v : { left: el.scrollLeft, width: el.clientWidth }));
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    el.addEventListener('scroll', queue, { passive: true });
    const ro = new ResizeObserver(queue);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', queue);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Ctrl + wheel zooms around the pointer.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const old = tl().cw;
      const next = Math.max(MIN_CW, Math.min(MAX_CW, old * Math.exp(-e.deltaY * 0.0015)));
      if (next === old) return;
      const visibleX = e.clientX - el.getBoundingClientRect().left - SIDE_W;
      keepScroll.current = zoomScroll(el.scrollLeft, Math.max(0, visibleX), old, next);
      setTl({ cw: next });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  useLayoutEffect(() => {
    if (keepScroll.current !== null && scroller.current) {
      scroller.current.scrollLeft = keepScroll.current;
      keepScroll.current = null;
    }
  }, [cw]);

  // Keep the playhead on screen (not while you're dragging something, or the view would run away from your pointer).
  useEffect(() => {
    let last = store().get().ui.frame;
    return store().subscribe(() => {
      const f = store().get().ui.frame;
      if (f === last) return;
      last = f;
      const el = scroller.current;
      if (!el || dragRef.current) return;
      const w = tl().cw;
      const viewW = el.clientWidth - SIDE_W;
      if (f * w < el.scrollLeft || (f + 1) * w > el.scrollLeft + viewW) el.scrollLeft = Math.max(0, f * w - viewW * 0.25);
    });
  }, []);

  // Escape drops whatever you're dragging.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragRef.current) {
        dragRef.current = null;
        setGhost(null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  // ---- pointer maths
  const mainLeft = () => main.current?.getBoundingClientRect().left ?? 0;
  const frameAt = (e: { clientX: number }, clamp = true) => frameAtX(e.clientX - mainLeft(), tl().cw, clamp ? store().get().doc.length - 1 : Infinity);
  const layerAtY = (e: { clientY: number }): Layer | undefined => {
    const ls = store().get().doc.layers;
    const y = e.clientY - (rows.current?.getBoundingClientRect().top ?? 0);
    const i = Math.max(0, Math.min(ls.length - 1, Math.floor(y / ROW_H)));
    return ls[ls.length - 1 - i];
  };
  const select = (layerId: Id, frame: number) => store().setUi({ frame, activeLayerId: layerId });

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('input')) return;
    const region = t.closest('[data-region]')?.getAttribute('data-region');
    if (!region) return;
    const capture = (d: Drag) => {
      dragRef.current = d;
      main.current?.setPointerCapture(e.pointerId);
    };
    if (region === 'ruler') {
      if (t.closest('.tl-length')) capture({ kind: 'length' });
      else {
        capture({ kind: 'scrub', pause: true });
        goTo(frameAt(e));
      }
    } else if (region === 'rows') {
      const layer = layerAtY(e);
      if (!layer) return;
      const f = frameAt(e);
      const cel = celAt(layer, f);
      select(layer.id, f);
      if (cel && t.closest('.tl-cel-handle')) capture({ kind: 'resize', layerId: layer.id, celId: cel.id, start: cel.start });
      else if (cel && t.closest('.tl-cel')) capture({ kind: 'move', layerId: layer.id, celId: cel.id, grab: f - cel.start, startX: e.clientX, startY: e.clientY, moved: false });
      else capture({ kind: 'scrub', pause: false });
    } else if (region === 'markers') {
      const el = t.closest<HTMLElement>('[data-marker]');
      if (el) capture({ kind: 'marker', id: el.dataset.marker!, startX: e.clientX, moved: false });
    } else if (region === 'clips') {
      const el = t.closest<HTMLElement>('[data-clip]');
      const edge = t.closest<HTMLElement>('[data-edge]')?.dataset.edge as 'start' | 'end' | undefined;
      if (el && edge) capture({ kind: 'clipEdge', id: el.dataset.clip!, edge });
      else if (el) capture({ kind: 'clip', id: el.dataset.clip!, startX: e.clientX, moved: false });
      else capture({ kind: 'clipNew', a: frameAt(e) });
    }
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const doc = store().get().doc;
    const cwNow = tl().cw;
    switch (d.kind) {
      case 'scrub': {
        const f = frameAt(e);
        if (d.pause) goTo(f);
        else if (f !== store().get().ui.frame) store().setUi({ frame: f });
        break;
      }
      case 'length':
        setGhost({ kind: 'length', length: Math.max(1, Math.min(MAX_LENGTH, Math.round((e.clientX - mainLeft()) / cwNow))) });
        break;
      case 'move': {
        if (!d.moved && Math.abs(e.clientX - d.startX) < 3 && Math.abs(e.clientY - d.startY) < 3) return;
        d.moved = true;
        const from = doc.layers.find((l) => l.id === d.layerId);
        const cel = from?.cels.find((c) => c.id === d.celId);
        if (!from || !cel) return;
        let target = layerAtY(e) ?? from;
        if (target.kind !== from.kind) target = from;
        const start = Math.max(0, frameAt(e, false) - d.grab);
        setGhost({ kind: 'cel', layerId: target.id, start, length: cel.length, trim: e.altKey });
        break;
      }
      case 'resize': {
        const from = doc.layers.find((l) => l.id === d.layerId);
        const cel = from?.cels.find((c) => c.id === d.celId);
        if (!cel) return;
        setGhost({ kind: 'cel', layerId: d.layerId, start: cel.start, length: Math.max(1, frameAt(e, false) + 1 - cel.start), trim: e.altKey });
        break;
      }
      case 'marker':
        if (!d.moved && Math.abs(e.clientX - d.startX) < 3) return;
        d.moved = true;
        setGhost({ kind: 'marker', id: d.id, frame: frameAt(e) });
        break;
      case 'clipNew':
        setGhost({ kind: 'clip', id: null, start: Math.min(d.a, frameAt(e)), end: Math.max(d.a, frameAt(e)) });
        break;
      case 'clip':
        if (!d.moved && Math.abs(e.clientX - d.startX) < 3) return;
        d.moved = true;
        break;
      case 'clipEdge': {
        const c = doc.clips.find((x) => x.id === d.id);
        if (!c) return;
        const f = frameAt(e);
        setGhost({ kind: 'clip', id: d.id, start: d.edge === 'start' ? Math.min(f, c.end) : c.start, end: d.edge === 'end' ? Math.max(f, c.start) : c.end });
        break;
      }
    }
  };

  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const g = ghost;
    dragRef.current = null;
    setGhost(null);
    if (!d) return;
    if (main.current?.hasPointerCapture(e.pointerId)) main.current.releasePointerCapture(e.pointerId);
    // Push later drawings along or cover them: the remembered choice, and Alt does the other one.
    const alt = e.altKey;
    const withClash = (fn: (clash: 'push' | 'trim') => void) =>
      withChoice<HoldChoice>('timeline.holdLonger', (choice) => {
        const c = clashFor(choice);
        fn(alt ? (c === 'push' ? 'trim' : 'push') : c);
      });
    if (d.kind === 'length' && g?.kind === 'length') ops.setDocLength(g.length);
    else if (d.kind === 'move' && d.moved && g?.kind === 'cel') withClash((clash) => say(ops.moveCel(d.layerId, d.celId, g.start, clash, g.layerId !== d.layerId ? g.layerId : undefined)));
    else if (d.kind === 'resize' && g?.kind === 'cel') withClash((clash) => say(ops.resizeCel(d.layerId, d.celId, g.length, clash)));
    else if (d.kind === 'marker') {
      if (d.moved && g?.kind === 'marker') ops.moveMarker(d.id, g.frame);
      else {
        const m = store().get().doc.markers.find((x) => x.id === d.id);
        if (m) store().setUi({ frame: m.frame });
      }
    } else if (d.kind === 'clipNew' && g?.kind === 'clip' && g.end > g.start) {
      const o = ops.addClip(g.start, g.end);
      if (o.id) setTl({ editing: { kind: 'clip', id: o.id } });
    } else if (d.kind === 'clip' && !d.moved) {
      const c = store().get().doc.clips.find((x) => x.id === d.id);
      if (!c) return;
      const on = tl().clipId === c.id ? null : c.id;
      setTl({ clipId: on });
      const ui = store().get().ui;
      if (on && (ui.frame < c.start || ui.frame > c.end)) store().setUi({ frame: c.start });
    } else if (d.kind === 'clipEdge' && g?.kind === 'clip' && g.id) ops.setClipRange(g.id, g.start, g.end);
  };

  const onDouble = (e: RPointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest('input')) return;
    const region = t.closest('[data-region]')?.getAttribute('data-region');
    if (region === 'markers') {
      const m = t.closest<HTMLElement>('[data-marker]');
      if (m) setTl({ editing: { kind: 'marker', id: m.dataset.marker! } });
      else {
        const o = ops.addMarker(frameAt(e));
        if (o.id) setTl({ editing: { kind: 'marker', id: o.id } });
      }
    } else if (region === 'clips') {
      const c = t.closest<HTMLElement>('[data-clip]');
      if (c) setTl({ editing: { kind: 'clip', id: c.dataset.clip! } });
    }
  };

  const onContext = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const region = t.closest('[data-region]')?.getAttribute('data-region');
    if (!region) return;
    e.preventDefault();
    const doc = store().get().doc;
    if (region === 'rows') {
      const layer = layerAtY(e);
      if (!layer) return;
      const f = frameAt(e);
      select(layer.id, f);
      setMenu({ x: e.clientX, y: e.clientY, items: celMenu(layer, f) });
    } else if (region === 'markers') {
      const el = t.closest<HTMLElement>('[data-marker]');
      const m = doc.markers.find((x) => x.id === el?.dataset.marker);
      setMenu({
        x: e.clientX,
        y: e.clientY,
        items: m
          ? [
              { heading: `Marker: ${m.name}` },
              { label: 'Rename', onClick: () => setTl({ editing: { kind: 'marker', id: m.id } }) },
              { label: 'Delete marker', danger: true, onClick: () => void ops.removeMarker(m.id) },
            ]
          : [{ label: 'Add a marker here', onClick: () => addMarkerAt(frameAt(e)) }],
      });
    } else if (region === 'clips') {
      const el = t.closest<HTMLElement>('[data-clip]');
      const c = doc.clips.find((x) => x.id === el?.dataset.clip);
      if (c) setMenu({ x: e.clientX, y: e.clientY, items: clipMenu(c) });
    } else if (region === 'ruler') {
      const f = frameAt(e);
      setMenu({ x: e.clientX, y: e.clientY, items: [{ label: 'Add a marker here', onClick: () => addMarkerAt(f) }] });
    }
  };

  const addMarkerAt = (f: number) => {
    const o = ops.addMarker(f);
    if (o.id) setTl({ editing: { kind: 'marker', id: o.id } });
  };

  const gridStyle = { '--cw': `${cw}px`, '--row-h': `${ROW_H}px`, width: total * cw } as React.CSSProperties;
  const ghostCel = ghost?.kind === 'cel' ? ghost : null;
  const ghostRow = ghostCel ? layers.length - 1 - layers.findIndex((l) => l.id === ghostCel.layerId) : -1;
  const bodyStyle = { '--side-w': `${SIDE_W}px` } as React.CSSProperties;

  // Drawn here (not in the row) so a marker or clip being dragged shows where it will land.
  const dragMarker = ghost?.kind === 'marker' ? ghost : null;
  const dragClip = ghost?.kind === 'clip' ? ghost : null;

  return (
    <div ref={scroller} className="tl-body" style={bodyStyle} data-dragging={ghost ? ghost.kind : undefined}>
      <div className="tl-inner">
      <div className="tl-side">
        <div className="tl-corner" style={{ height: RULER_H + MARKS_H + CLIPS_H }}>
          <LayerTools />
        </div>
        <LayerList />
      </div>
      <div
        ref={main}
        className="tl-main"
        style={gridStyle}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          dragRef.current = null;
          setGhost(null);
        }}
        onDoubleClick={onDouble}
        onContextMenu={onContext}
      >
        <div className="tl-top">
          <Ruler cw={cw} from={from} to={to} length={length} fps={fps} total={total} ghostLength={ghost?.kind === 'length' ? ghost.length : null} />
          <MarkersRow cw={cw} from={from} to={to} />
          <ClipsRow cw={cw} from={from} to={to} />
          <Playhead part="ruler" cw={cw} activeRow={activeDisplayRow} />
          {dragMarker ? <i className="tl-ghost-line" style={{ left: dragMarker.frame * cw, top: 0, height: RULER_H + MARKS_H }} /> : null}
          {dragClip ? <i className="tl-ghost-clip" style={{ left: dragClip.start * cw, width: (dragClip.end - dragClip.start + 1) * cw, top: RULER_H + MARKS_H, height: CLIPS_H }} /> : null}
        </div>
        <div ref={rows} className="tl-rows" data-region="rows" style={{ height: layers.length * ROW_H }}>
          {[...layers].reverse().map((l) => (
            <GridRow key={l.id} layer={l} cw={cw} from={from} to={to} active={l.id === activeId} />
          ))}
          <span className="tl-beyond" style={{ left: (ghost?.kind === 'length' ? ghost.length : length) * cw }} />
          <Playhead part="rows" cw={cw} activeRow={activeDisplayRow} />
          {ghostCel ? <i className={`tl-ghost-cel${ghostCel.trim ? ' is-trim' : ''}`} style={{ left: ghostCel.start * cw + 1, width: ghostCel.length * cw - 2, top: ghostRow * ROW_H + 3, height: ROW_H - 6 }} /> : null}
        </div>
      </div>
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- menus

/** What you can do to a cell, in plain words. */
export function celMenu(layer: Layer, frame: number): MenuItem[] {
  const cel = celAt(layer, frame);
  const none = !cel;
  const hold = (n: number): MenuItem => ({
    label: `Hold for ${holdWords(n)}`,
    checked: cel?.length === n,
    disabled: none,
    hint: keyHint(`timeline.hold${n}`),
    onClick: () => void say(ops.setExposure(n, layer.id, frame)),
  });
  return [
    { heading: `${layer.name}, frame ${frame + 1}${cel ? ` (drawing held for ${holdWords(cel.length)})` : ' (empty)'}` },
    { label: 'New blank drawing here', hint: keyHint('timeline.newKey'), onClick: () => void say(ops.newBlankKey(layer.id, frame)) },
    { label: 'Copy this drawing to the next frame', hint: keyHint('timeline.duplicateKey'), disabled: none, onClick: () => void say(ops.duplicateKey(layer.id, frame)) },
    { label: 'Clear this drawing', disabled: none, onClick: () => void say(ops.clearKey(layer.id, frame)) },
    { label: 'Make these frames empty', disabled: none, onClick: () => void say(ops.deleteKey(layer.id, frame)) },
    { separator: true },
    cel?.tween
      ? { label: 'Remove in-betweens', onClick: () => void removeTween(layer.id, frame) }
      : { label: 'Make in-betweens (tween)', hint: keyHint('tween.make'), disabled: none || layer.kind !== 'vector', onClick: () => void makeTween(layer.id, frame) },
    { separator: true },
    hold(1),
    hold(2),
    hold(3),
    hold(4),
    { separator: true },
    { label: 'Add a frame (hold one longer)', hint: keyHint('timeline.insertFrame'), onClick: () => void say(ops.insertFrame(layer.id, frame)) },
    { label: 'Remove a frame', hint: keyHint('timeline.removeFrame'), onClick: () => void say(ops.removeFrame(layer.id, frame)) },
    { separator: true },
    { label: 'Add a marker here', onClick: () => void ops.addMarker(frame) },
  ];
}

function clipMenu(c: Clip): MenuItem[] {
  return [
    { heading: `Clip: ${c.name} (frames ${c.start + 1} to ${c.end + 1})` },
    { label: tl().clipId === c.id ? 'Play everything again' : 'Play just this clip', onClick: () => setTl({ clipId: tl().clipId === c.id ? null : c.id }) },
    { label: 'Rename', onClick: () => setTl({ editing: { kind: 'clip', id: c.id } }) },
    { label: 'Loops (repeats when it finishes)', checked: c.loop, onClick: () => void ops.setClipLoop(c.id, !c.loop) },
    { separator: true },
    {
      label: 'Delete clip',
      danger: true,
      onClick: () => {
        if (tl().clipId === c.id) setTl({ clipId: null });
        ops.removeClip(c.id);
      },
    },
  ];
}
