import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { withChoice } from '../core/choices';
import { clashFor, type HoldChoice } from './choices';
import { holdLongerMatters } from './matters';
import { celAt } from '../core/doc';
import type { Cel, Clip, Id, Layer } from '../core/format';
import { store, useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { say } from './commands';
import { keyHint } from './cmd';
import { chipBox } from './clipLayout';
import { MAX_LENGTH } from './edit-core';
import { frameAtX, holdWords, labelStep, visibleFrames, zoomScroll } from './geometry';
import { LayerList, LayerTools, ROW_H } from './Layers';
import { ContextMenu, InlineName, type MenuItem } from './Menu';
import * as ops from './ops';
import { goTo, inOutRange } from './playback';
import { onionFrames } from '../canvas/onion';
import { pinLightTable } from '../canvas/lightTable';
import { acceptTweenOffer, closeTweenOffer, dismissTweenOffer, offerTweenAt, tweenOffer } from './tweenOffer';
import { clearInOut, setIn, setInOut, setOut } from './range';
import { nextKey } from '../core/symbols';
import { ease } from '../core/ease';
import { makeTween, removeTween } from '../symbols/ops';
import { MOTIONS } from '../core/motions';
import { makeMotion } from '../symbols/motion-ops';
import '../symbols/symbols.css';
import { attachPinch } from '../canvas/pinch';
import { MAX_CW, MIN_CW, setTl, tl, useTl } from './state';
import { TimelineSlot } from './slots';
import { DetailRow, PropRow } from './Detail';
import { rowAtY, rowOfLayerIn, type Layout, type LayoutRow } from './layout';
import { currentLayout, useLayout } from './view';
import { celRef, layerTracks, type KeyRef } from './tracks';
import { clampShift, deleteKeys, firstFrameOf, moveKeys, scaleKeys, scaleMap } from './keys';
import { clearKeys, pickKeys } from './state';
import { toast } from '../ui/toast';
import { clipPlayItems } from './ClipPlay';
import { isSection } from '../ui/panelInfo';
import { panelTitle, showPanel, showPanelGently } from '../ui/dock';
import { playWords } from '../core/clipPlay';

export const SIDE_W = 216;
/** The detailed look's layer column is a little wider: it has a fold arrow and a solo switch too. */
export const DETAIL_SIDE_W = 236;
const RULER_H = 26;
const MARKS_H = 20;
const CLIPS_H = 22;
const D_RULER_H = 32;
const D_MARKS_H = 18;
const D_CLIPS_H = 18;
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
  | { kind: 'clipEdge'; id: Id; edge: 'start' | 'end' }
  | { kind: 'inOut'; a: number }
  | { kind: 'inOutEdge'; edge: 'in' | 'out' }
  | { kind: 'keys'; refs: KeyRef[]; startX: number; grab: number; ref: KeyRef; wasPicked: boolean; moved: boolean; last: number }
  | { kind: 'box'; x0: number; y0: number; add: boolean }
  // Dragging the timeline itself about, with the middle button or Space held.
  | { kind: 'pan'; x: number; y: number; left: number; top: number };

type Ghost =
  | { kind: 'cel'; layerId: Id; start: number; length: number; trim: boolean }
  | { kind: 'length'; length: number }
  | { kind: 'marker'; id: Id; frame: number }
  | { kind: 'clip'; id: Id | null; start: number; end: number }
  | { kind: 'inOut'; start: number; end: number }
  | { kind: 'keys'; refs: KeyRef[]; map: (f: number) => number; text: string; factor?: number; anchor?: number }
  | { kind: 'box'; x0: number; y0: number; x1: number; y1: number };

// ---------------------------------------------------------------- the pieces that move often

/** The playhead: a pink line and a soft column on the frame you're on. It only re-renders when the frame changes. */
const Playhead = memo(function Playhead({ part, cw, cursor }: { part: 'ruler' | 'rows'; cw: number; cursor: { y: number; h: number } | null }) {
  const frame = useStore((s) => s.ui.frame);
  return (
    <div className={`tl-playhead is-${part}`} style={{ width: cw, transform: `translateX(${frame * cw}px)` }} aria-hidden="true">
      {part === 'ruler' ? <span className="tl-playhead-head">{cw >= 18 ? frame + 1 : ''}</span> : cursor ? <span className="tl-cursor" style={{ top: cursor.y, height: cursor.h }} /> : null}
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
        <div
          key={c.id}
          className={`tl-cel${c.autoHold && c.length > 1 ? ' is-auto' : ''}`}
          data-cel={c.id}
          style={{ left: c.start * cw + 1, width: c.length * cw - 2 }}
          title={c.autoHold && c.length > 1 ? 'This drawing carries on until your next one. Draw on a later frame to start a new drawing there.' : undefined}
        >
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

function Ruler({ cw, from, to, length, fps, total, ghostLength, ghostRange, detailed, h }: { cw: number; from: number; to: number; length: number; fps: number; total: number; ghostLength: number | null; ghostRange: { start: number; end: number } | null; detailed: boolean; h: number }) {
  const onion = useStore((s) => s.ui.onion);
  // Only the onion shading follows the frame, so the ruler stays still while playing when it is off.
  const frame = useStore((s) => (s.ui.onion.enabled ? s.ui.frame : -1));
  // Keys only: the shaded frames move when the drawings do.
  useStore((s) => (s.ui.onion.enabled && s.ui.onion.keysOnly ? s.doc.layers : null));
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
  useStore((s) => s.doc.inOut);
  const saved = inOutRange(store().get().doc);
  const io = ghostRange ?? saved;
  return (
    <div className={`tl-ruler${detailed ? ' is-detailed' : ''}`} data-region="ruler" data-quest="timeline-ruler" style={{ height: h }}>
      {detailed ? <SecondsBand cw={cw} from={from} to={Math.min(total, to)} fps={fps} /> : null}
      {clip ? <i className="tl-range-shade" style={{ left: clip.start * cw, width: (clip.end - clip.start + 1) * cw }} /> : null}
      {onion.enabled && !onion.keysOnly ? [shade(frame - onion.before, frame - 1, onion.beforeColor, 'b'), shade(frame + 1, frame + onion.after, onion.afterColor, 'a')] : null}
      {onion.enabled && onion.keysOnly && frame >= 0
        ? onionFrames(store().get().doc, frame, onion).map((o) => shade(o.frame, o.frame, o.side === 'before' ? onion.beforeColor : onion.afterColor, `k${o.frame}`))
        : null}
      {labels.map((f) => (
        <span key={`n${f}`} className="tl-num" style={{ left: f * cw, width: cw }}>
          {f + 1}
        </span>
      ))}
      {secs.map((f) => (
        <span key={`s${f}`} className="tl-sec" style={{ left: f * cw }}>
          {!detailed && cw * fps >= 36 ? <span className="tl-sec-label">{f / fps}s</span> : null}
        </span>
      ))}
      {io ? (
        <>
          <i className="tl-io-dim" style={{ left: 0, width: io.start * cw }} />
          <i className="tl-io-dim" style={{ left: (io.end + 1) * cw, width: Math.max(0, (end - io.end - 1) * cw) }} />
          <button type="button" className="tl-io tl-io-in" data-edge="in" style={{ left: io.start * cw - 1 }} title={`Play range starts at frame ${io.start + 1}. Drag to move it.`} aria-label={`Play range start, frame ${io.start + 1}`} tabIndex={-1} />
          <button type="button" className="tl-io tl-io-out" data-edge="out" style={{ left: (io.end + 1) * cw - 7 }} title={`Play range ends at frame ${io.end + 1}. Drag to move it.`} aria-label={`Play range end, frame ${io.end + 1}`} tabIndex={-1} />
        </>
      ) : null}
      <span className="tl-beyond" style={{ left: end * cw }} />
      <button type="button" className="tl-length" style={{ left: end * cw - 7 }} title="Drag to make your animation longer or shorter" aria-label={`Animation length: ${end} frames. Drag to change.`} tabIndex={-1}>
        <span />
      </button>
    </div>
  );
}

/** The detailed ruler's top strip: one band a second, every other one shaded, with the time written in. */
function SecondsBand({ cw, from, to, fps }: { cw: number; from: number; to: number; fps: number }) {
  const out = [];
  const step = cw * fps >= 30 ? 1 : cw * fps >= 12 ? 2 : 5;
  for (let s = Math.floor(from / fps); s * fps <= to; s++) {
    out.push(
      <span key={s} className={`tl-secband${s % 2 ? ' is-odd' : ''}`} style={{ left: s * fps * cw, width: fps * cw }}>
        {s % step === 0 ? `${s}s` : ''}
      </span>,
    );
  }
  return <div className="tl-secbands" aria-hidden="true">{out}</div>;
}

// ---------------------------------------------------------------- markers and clips rows

function MarkersRow({ cw, from, to, h }: { cw: number; from: number; to: number; h: number }) {
  const markers = useStore((s) => s.doc.markers);
  const editing = useTl((t) => (t.editing?.kind === 'marker' ? t.editing.id : null));
  return (
    <div className="tl-marks" data-region="markers" style={{ height: h }} title="Double-click to add a marker: a named moment, like a footstep">
      {markers.length === 0 && (
        <span className="tl-lane-empty" style={{ left: from * cw + 8 }} aria-hidden="true">
          Markers: double-click to name a moment
        </span>
      )}
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

let toldClipKept = false;
/**
 * Picks a clip to play on its own (or lets go of it, when it is the picked one), and shows how it plays in
 * Properties. That only comes forward when it hides nothing: with Preview (or Layers...) in front it stays put, and
 * a toast says where the Clip settings are, the first time.
 */
export function pickClip(id: Id): void {
  const c = store().get().doc.clips.find((x) => x.id === id);
  if (!c) return;
  const on = tl().clipId === c.id ? null : c.id;
  setTl({ clipId: on });
  if (on) {
    const kept = showPanelGently('clip-play', isSection);
    if (kept && !toldClipKept) {
      toldClipKept = true;
      toast(`${panelTitle(kept)} stays in front.`, { duration: 6000, action: { label: 'Show Clip settings', run: () => showPanel('clip-play') } });
    }
  }
  const ui = store().get().ui;
  if (on && (ui.frame < c.start || ui.frame > c.end)) store().setUi({ frame: c.start });
}

export function ClipsRow({ cw, from, to, h }: { cw: number; from: number; to: number; h: number }) {
  const clips = useStore((s) => s.doc.clips);
  const editing = useTl((t) => (t.editing?.kind === 'clip' ? t.editing.id : null));
  const picked = useTl((t) => t.clipId);
  return (
    <div className="tl-clips" data-region="clips" style={{ height: h }} title="Drag across frames to make a clip: a named stretch like idle or run">
      {clips.length === 0 && (
        <span className="tl-lane-empty" style={{ left: from * cw + 8 }} aria-hidden="true">
          Clips: drag across frames to make one, like idle or run
        </span>
      )}
      {clips
        .filter((c) => c.end >= from && c.start <= to)
        .map((c) => {
          const box = chipBox(c, cw);
          const how = playWords(c);
          const tip = `${c.name}: frames ${c.start + 1} to ${c.end + 1}${how ? ', ' + how : ''}. Click to play just this clip and see how it plays in Properties. Double-click to rename. Right-click for more.`;
          return (
            <div
              key={c.id}
              className={`tl-clip${picked === c.id ? ' is-picked' : ''}${editing === c.id ? ' is-editing' : ''}`}
              data-clip={c.id}
              data-mode={box.mode}
              role="button"
              tabIndex={0}
              aria-pressed={picked === c.id}
              aria-label={`Clip ${c.name}, frames ${c.start + 1} to ${c.end + 1}${how ? ', ' + how : ''}`}
              style={{ left: box.left, width: box.width }}
              title={tip}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pickClip(c.id);
                } else if (e.key === 'F2') {
                  e.preventDefault();
                  setTl({ editing: { kind: 'clip', id: c.id } });
                }
              }}
            >
              {box.edge ? <span className="tl-clip-edge is-start" data-edge="start" style={{ width: box.edge }} /> : null}
              {editing === c.id ? (
                <InlineName
                  label="Clip name"
                  value={c.name}
                  onDone={(v) => {
                    setTl({ editing: null });
                    if (v !== null) ops.renameClip(c.id, v);
                  }}
                />
              ) : box.mode === 'full' ? (
                <span className="tl-clip-name">{c.name}</span>
              ) : null}
              {box.mode === 'icon' ? <Icon name="clip" size={11} className="tl-clip-loop" /> : null}
              {box.mode === 'full' && c.direction === 'reverse' ? <Icon name="play" size={10} className="tl-clip-loop tl-clip-back" /> : null}
              {box.mode === 'full' && (c.direction === 'pingpong' || c.direction === 'pingpong-reverse') ? <Icon name="pingpong" size={11} className="tl-clip-loop" /> : null}
              {box.mode === 'full' ? c.loop ? <Icon name="loop" size={11} className="tl-clip-loop" /> : c.repeat && c.repeat > 1 ? <span className="tl-clip-times">{`x${c.repeat}`}</span> : null : null}
              {box.edge ? <span className="tl-clip-edge is-end" data-edge="end" style={{ width: box.edge }} /> : null}
            </div>
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------------- the whole scrolling area

// Fits the whole animation into view (the Fit button and command). Set while a timeline is showing.
let fitter: (() => void) | null = null;

/** Zooms the timeline so every frame of the animation fits across it. */
export function zoomToFit(): boolean {
  if (!fitter) return false;
  fitter();
  return true;
}

/** The keys on a row, with their frames: a layer's drawings (and its effect keys while folded), or a property's keys. */
function rowKeys(r: LayoutRow): { frame: number; ref: KeyRef }[] {
  if (r.kind === 'prop') return r.track.keys;
  if (r.kind !== 'layer') return [];
  const own = r.layer.cels.map((c) => ({ frame: c.start, ref: celRef(r.layer.id, c.id) }));
  if (r.open) return own;
  return [...own, ...r.tracks.filter((t) => t.id.startsWith('fx-')).flatMap((t) => t.keys)];
}

/** Keys inside a box of rows and frames. */
function keysIn(layout: Layout, y0: number, y1: number, f0: number, f1: number): KeyRef[] {
  const out = new Set<KeyRef>();
  for (const r of layout.rows) {
    if (r.y + r.h <= y0 || r.y >= y1) continue;
    for (const k of rowKeys(r)) if (k.frame >= f0 && k.frame <= f1) out.add(k.ref);
  }
  return [...out];
}

/** Where picked keys sit on screen (row middle and frame), to draw them as they're dragged. */
function keySpots(layout: Layout, refs: ReadonlySet<KeyRef>): { ref: KeyRef; frame: number; y: number; small: boolean }[] {
  const out: { ref: KeyRef; frame: number; y: number; small: boolean }[] = [];
  for (const r of layout.rows) for (const k of rowKeys(r)) if (refs.has(k.ref)) out.push({ ref: k.ref, frame: k.frame, y: r.y + r.h / 2, small: r.kind === 'prop' });
  return out;
}

export function TimelineBody() {
  const layers = useStore((s) => s.doc.layers);
  const length = useStore((s) => s.doc.length);
  const fps = useStore((s) => s.doc.fps);
  const activeId = useStore((s) => s.ui.activeLayerId) ?? layers[layers.length - 1]?.id;
  const cw = useTl((t) => t.cw);
  const picked = useTl((t) => t.keys);
  const layout = useLayout();
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const detailed = layout.style === 'detailed';
  const sideW = detailed ? DETAIL_SIDE_W : SIDE_W;
  const sideRef = useRef(sideW);
  sideRef.current = sideW;
  const rulerH = detailed ? D_RULER_H : RULER_H;
  const marksH = detailed ? D_MARKS_H : MARKS_H;
  const clipsH = detailed ? D_CLIPS_H : CLIPS_H;

  const scroller = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  // A plain click on a frame (no drag), which may offer in-betweens when it lets go.
  const clickRef = useRef<{ x: number; y: number; layerId: Id; frame: number } | null>(null);
  // The keyboard's row (a property row's key, or null for the active layer's own row) and where Shift+arrows started.
  const [cursorRow, setCursorRow] = useState<string | null>(null);
  const anchor = useRef<{ frame: number; y: number } | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [view, setView] = useState({ left: 0, width: 800 });
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [panning, setPanning] = useState(false);
  const keepScroll = useRef<number | null>(null);

  // What's on screen, so a 500 frame animation with 20 layers draws a few hundred things, not thousands.
  const { from, to } = visibleFrames(view.left, view.width - sideW, cw);
  const contentEnd = useMemo(() => layers.reduce((n, l) => Math.max(n, l.cels.length ? l.cels[l.cels.length - 1].start + l.cels[l.cels.length - 1].length : 0), 0), [layers]);
  const total = Math.max(length, contentEnd) + SLACK;
  const activeRow = (cursorRow ? layout.rows.find((r) => r.key === cursorRow && r.kind === 'prop' && r.layer.id === activeId) : undefined) ?? rowOfLayerIn(layout, activeId);
  const cursor = activeRow ? { y: activeRow.y, h: activeRow.h } : null;

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

  // Space held means "drag the timeline about", the same as on the canvas. A tap on its own still plays, because the
  // key is never swallowed here.
  const space = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== ' ' || t?.closest?.('input, textarea, [contenteditable]')) return;
      space.current = true;
      // With the timeline focused, Space would otherwise scroll it a page down while you are holding it to pan.
      if (t && scroller.current?.contains(t)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') space.current = false;
    };
    const off = () => (space.current = false);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', off);
    };
  }, []);

  // Ctrl + wheel zooms around the pointer, and so does a pinch in Safari (which sends gesture events instead).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const zoomAt = (factor: number, clientX: number) => {
      const old = tl().cw;
      const next = Math.max(MIN_CW, Math.min(MAX_CW, old * factor));
      if (next === old) return;
      const visibleX = clientX - el.getBoundingClientRect().left - sideRef.current;
      keepScroll.current = zoomScroll(el.scrollLeft, Math.max(0, visibleX), old, next);
      setTl({ cw: next });
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    const unpinch = attachPinch(el, (factor, x) => zoomAt(factor, x));
    return () => {
      el.removeEventListener('wheel', wheel);
      unpinch?.();
    };
  }, []);
  useLayoutEffect(() => {
    if (keepScroll.current !== null && scroller.current) {
      scroller.current.scrollLeft = keepScroll.current;
      keepScroll.current = null;
    }
  }, [cw]);

  // Fit: every frame across the view.
  useEffect(() => {
    fitter = () => {
      const el = scroller.current;
      if (!el) return;
      const frames = store().get().doc.length + 1;
      setTl({ cw: (el.clientWidth - sideRef.current - 16) / frames });
      keepScroll.current = 0;
    };
    return () => void (fitter = null);
  }, []);

  // Keep the playhead on screen (not while you're dragging something, or the view would run away from your pointer).
  useEffect(() => {
    let last = store().get().ui.frame;
    let raf = 0;
    // Done on the next animation frame, so moving the playhead never waits for the timeline's layout.
    const follow = () => {
      raf = 0;
      const f = store().get().ui.frame;
      const el = scroller.current;
      if (!el || dragRef.current) return;
      const w = tl().cw;
      const viewW = el.clientWidth - sideRef.current;
      if (f * w < el.scrollLeft || (f + 1) * w > el.scrollLeft + viewW) el.scrollLeft = Math.max(0, f * w - viewW * 0.25);
    };
    const off = store().subscribe(() => {
      const f = store().get().ui.frame;
      if (f === last) return;
      last = f;
      if (!raf) raf = requestAnimationFrame(follow);
    });
    return () => {
      off();
      if (raf) cancelAnimationFrame(raf);
    };
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
  const rowsY = (e: { clientY: number }) => e.clientY - (rows.current?.getBoundingClientRect().top ?? 0);
  const rowAt = (e: { clientY: number }): LayoutRow | undefined => rowAtY(layoutRef.current, rowsY(e));
  const layerAtY = (e: { clientY: number }): Layer | undefined => {
    const r = rowAt(e);
    // A folder's header row has no frames of its own.
    return r?.kind === 'layer' ? r.layer : undefined;
  };
  const select = (layerId: Id, frame: number) => store().setUi({ frame, activeLayerId: layerId });
  const focusMain = () => main.current?.focus({ preventScroll: true });

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    // The middle button, or Space and the left button, drags the timeline about under the pointer.
    const el = scroller.current;
    if (el && (e.button === 1 || (e.button === 0 && space.current))) {
      e.preventDefault();
      dragRef.current = { kind: 'pan', x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      setPanning(true);
      main.current?.setPointerCapture(e.pointerId);
      return;
    }
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
      const ioEdge = t.closest<HTMLElement>('.tl-io')?.dataset.edge as 'in' | 'out' | undefined;
      if (t.closest('.tl-length')) capture({ kind: 'length' });
      else if (ioEdge) capture({ kind: 'inOutEdge', edge: ioEdge });
      // Shift and drag along the ruler marks out a play range.
      else if (e.shiftKey) {
        const a = frameAt(e);
        capture({ kind: 'inOut', a });
        setGhost({ kind: 'inOut', start: a, end: a });
      } else {
        capture({ kind: 'scrub', pause: true });
        goTo(frameAt(e));
      }
    } else if (region === 'rows') {
      focusMain();
      const row = rowAt(e);
      if (!row || row.kind === 'folder') return;
      const layer = row.layer;
      setCursorRow(row.kind === 'prop' ? row.key : null);
      const f = frameAt(e);
      anchor.current = { frame: f, y: row.y + row.h / 2 };
      // A key (detailed look): pick it, then drag to retime. Shift adds or takes away, Alt and drag stretches.
      const keyEl = t.closest<HTMLElement>('[data-key]');
      if (keyEl && detailed) {
        const ref = keyEl.dataset.key!;
        const cur = tl().keys;
        const wasPicked = cur.has(ref);
        if (e.shiftKey) {
          const next = new Set(cur);
          if (wasPicked) next.delete(ref);
          else next.add(ref);
          setTl({ keys: next });
        } else if (!wasPicked) pickKeys([ref]);
        const doc = store().get().doc;
        const grab = firstFrameOf(doc, [ref]) ?? f;
        select(layer.id, grab);
        clickRef.current = null;
        if (!tl().keys.has(ref)) return;
        capture({ kind: 'keys', refs: [...tl().keys], startX: e.clientX, grab, ref, wasPicked: wasPicked && !e.shiftKey, moved: false, last: 0 });
        return;
      }
      const onCel = !!t.closest('.tl-cel');
      // Detailed look: drag on empty frames of a property row (or Shift and drag anywhere empty) picks keys in a box.
      if (detailed && !onCel && (row.kind === 'prop' || e.shiftKey)) {
        select(layer.id, f);
        const y = rowsY(e);
        const x = e.clientX - mainLeft();
        capture({ kind: 'box', x0: x, y0: y, add: e.shiftKey });
        setGhost({ kind: 'box', x0: x, y0: y, x1: x, y1: y });
        return;
      }
      if (!e.shiftKey) clearKeys();
      if (row.kind === 'prop') {
        select(layer.id, f);
        capture({ kind: 'scrub', pause: false });
        return;
      }
      clickRef.current = t.closest('.tl-cel-handle') ? null : { x: e.clientX, y: e.clientY, layerId: layer.id, frame: f };
      const cel = celAt(layer, f);
      select(layer.id, f);
      if (cel && t.closest('.tl-cel-handle')) capture({ kind: 'resize', layerId: layer.id, celId: cel.id, start: cel.start });
      else if (cel && onCel) capture({ kind: 'move', layerId: layer.id, celId: cel.id, grab: f - cel.start, startX: e.clientX, startY: e.clientY, moved: false });
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
    if (d.kind === 'pan') {
      const el = scroller.current;
      if (el) {
        el.scrollLeft = d.left - (e.clientX - d.x);
        el.scrollTop = d.top - (e.clientY - d.y);
      }
      return;
    }
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
      case 'keys': {
        if (!d.moved && Math.abs(e.clientX - d.startX) < 3) return;
        d.moved = true;
        const by = Math.round((e.clientX - d.startX) / cwNow);
        const stretch = e.altKey && d.refs.length > 1;
        const key = stretch ? by + 0.5 : by;
        if (key === d.last && ghost) return;
        d.last = key;
        if (stretch) {
          const a = firstFrameOf(doc, d.refs) ?? 0;
          const span = d.grab - a;
          if (span <= 0) return;
          const factor = Math.max(0.05, (span + by) / span);
          setGhost({ kind: 'keys', refs: d.refs, map: scaleMap(a, factor), text: `${Math.round(factor * 100)}% as long`, factor, anchor: a });
        } else {
          const ok = clampShift(doc, d.refs, by);
          setGhost({ kind: 'keys', refs: d.refs, map: (f) => f + ok, text: ok === 0 ? 'No room' : `${ok > 0 ? '+' : ''}${ok} frame${Math.abs(ok) === 1 ? '' : 's'}` });
        }
        break;
      }
      case 'box':
        setGhost({ kind: 'box', x0: d.x0, y0: d.y0, x1: e.clientX - mainLeft(), y1: rowsY(e) });
        break;
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
      case 'inOut': {
        const f = frameAt(e);
        setGhost({ kind: 'inOut', start: Math.min(d.a, f), end: Math.max(d.a, f) });
        break;
      }
      case 'inOutEdge': {
        const r = inOutRange(doc) ?? { start: 0, end: doc.length - 1 };
        const f = frameAt(e);
        setGhost({ kind: 'inOut', start: d.edge === 'in' ? Math.min(f, r.end) : r.start, end: d.edge === 'out' ? Math.max(f, r.start) : r.end });
        break;
      }
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
    if (d?.kind === 'pan') {
      dragRef.current = null;
      setPanning(false);
      return;
    }
    const g = ghost;
    dragRef.current = null;
    const click = clickRef.current;
    clickRef.current = null;
    if (click && Math.abs(e.clientX - click.x) < 3 && Math.abs(e.clientY - click.y) < 3 && !store().get().ui.playing) {
      const doc = store().get().doc;
      const layer = doc.layers.find((l) => l.id === click.layerId);
      if (layer) offerTweenAt(doc, layer, click.frame);
    } else if (d) closeTweenOffer();
    // A press on the offer itself starts no drag, so it's left alone for its own click.
    setGhost(null);
    if (!d) return;
    if (main.current?.hasPointerCapture(e.pointerId)) main.current.releasePointerCapture(e.pointerId);
    // Push later drawings along or cover them: the remembered choice, and Alt does the other one.
    const alt = e.altKey;
    const withClash = (where: { layerId: string; celId: string; start: number; length: number }, fn: (clash: 'push' | 'trim') => void) => {
      const layer = store().get().doc.layers.find((l) => l.id === where.layerId);
      // Nothing for the dragged drawing to run into: both answers give the same animation, so nothing is asked.
      const matters = !layer || holdLongerMatters(layer.cels, where.celId, where.start, where.length);
      withChoice<HoldChoice>(
        'timeline.holdLonger',
        (choice) => {
          const c = clashFor(choice);
          fn(alt ? (c === 'push' ? 'trim' : 'push') : c);
        },
        { matters, gently: !alt },
      );
    };
    if (d.kind === 'length' && g?.kind === 'length') ops.setDocLength(g.length);
    else if (d.kind === 'move' && d.moved && g?.kind === 'cel') withClash({ layerId: g.layerId, celId: d.celId, start: g.start, length: g.length }, (clash) => say(ops.moveCel(d.layerId, d.celId, g.start, clash, g.layerId !== d.layerId ? g.layerId : undefined)));
    else if (d.kind === 'resize' && g?.kind === 'cel') withClash({ layerId: d.layerId, celId: d.celId, start: g.start, length: g.length }, (clash) => say(ops.resizeCel(d.layerId, d.celId, g.length, clash)));
    else if (d.kind === 'keys') {
      if (!d.moved) {
        // A plain click on one of several picked keys picks just that one.
        if (d.wasPicked && tl().keys.size > 1) pickKeys([d.ref]);
      } else if (g?.kind === 'keys') {
        const doc = store().get().doc;
        const by = g.map(d.grab) - d.grab;
        const out = g.factor ? scaleKeys(d.refs, g.factor, g.anchor) : moveKeys(d.refs, by);
        void doc;
        if (out.ok) {
          pickKeys(out.refs);
          store().setUi({ frame: Math.max(0, d.grab + by) });
        } else if (out.why) toast(out.why);
      }
    } else if (d.kind === 'box' && g?.kind === 'box') {
      const cwNow = tl().cw;
      const f0 = Math.floor(Math.min(g.x0, g.x1) / cwNow);
      const f1 = Math.floor(Math.max(g.x0, g.x1) / cwNow);
      const found = keysIn(layoutRef.current, Math.min(g.y0, g.y1), Math.max(g.y0, g.y1) + 1, f0, f1);
      pickKeys(found, d.add);
    } else if (d.kind === 'marker') {
      if (d.moved && g?.kind === 'marker') ops.moveMarker(d.id, g.frame);
      else {
        const m = store().get().doc.markers.find((x) => x.id === d.id);
        if (m) store().setUi({ frame: m.frame });
      }
    } else if (d.kind === 'clipNew' && g?.kind === 'clip' && g.end > g.start) {
      const o = ops.addClip(g.start, g.end);
      if (o.id) setTl({ editing: { kind: 'clip', id: o.id } });
    } else if (d.kind === 'clip' && !d.moved) {
      pickClip(d.id);
    } else if (d.kind === 'clipEdge' && g?.kind === 'clip' && g.id) ops.setClipRange(g.id, g.start, g.end);
    else if ((d.kind === 'inOut' || d.kind === 'inOutEdge') && g?.kind === 'inOut') {
      // A shift-click without a drag just moves the playhead, like a plain click.
      if (d.kind === 'inOut' && g.start === g.end) goTo(g.start);
      else setInOut(g.start, g.end);
    }
  };

  // ---- the keyboard, while the frames have focus: arrows move round the cells, Shift picks keys on the way,
  // Ctrl+arrows jump key to key, Alt+arrows nudge picked keys, Delete takes picked keys away.
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input, button, [role="button"]') && e.target !== main.current) return;
    const lay = layoutRef.current;
    const { doc, ui } = store().get();
    const here = (cursorRow ? lay.rows.find((r) => r.key === cursorRow && r.kind === 'prop' && r.layer.id === ui.activeLayerId) : undefined) ?? rowOfLayerIn(lay, ui.activeLayerId ?? doc.layers[doc.layers.length - 1]?.id);
    const done = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const picked = [...tl().keys];
    if ((e.key === 'Delete' || e.key === 'Backspace') && picked.length) {
      done();
      const o = deleteKeys(picked);
      if (o.ok) clearKeys();
      else if (o.why) toast(o.why);
      return;
    }
    if (e.key === 'Escape' && picked.length) {
      done();
      clearKeys();
      return;
    }
    const horiz = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    const vert = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    if (!horiz && !vert) return;
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    if (e.altKey && horiz) {
      done();
      if (!picked.length) return;
      const o = moveKeys(picked, dir, 'nudge-keys');
      if (o.ok) {
        pickKeys(o.refs);
        store().setUi({ frame: Math.max(0, ui.frame + dir) });
      } else if (o.why) toast(o.why);
      return;
    }
    done();
    let frame = ui.frame;
    let row = here;
    if (horiz && (e.ctrlKey || e.metaKey) && here) {
      const frames = [...new Set(rowKeys(here).map((k) => k.frame))].sort((a, b) => a - b);
      const f = dir > 0 ? frames.find((x) => x > frame) : [...frames].reverse().find((x) => x < frame);
      if (f !== undefined) frame = f;
    } else if (horiz) frame = Math.max(0, Math.min(doc.length - 1, frame + dir));
    else if (here) {
      const i = lay.rows.indexOf(here);
      for (let j = i + dir; j >= 0 && j < lay.rows.length; j += dir) {
        if (lay.rows[j].kind !== 'folder') {
          row = lay.rows[j];
          break;
        }
      }
    }
    if (!row || row.kind === 'folder') return;
    if (e.shiftKey) {
      const a = anchor.current ?? { frame: ui.frame, y: (here?.y ?? 0) + (here?.h ?? 0) / 2 };
      anchor.current = a;
      const y = row.y + row.h / 2;
      pickKeys(keysIn(lay, Math.min(a.y, y), Math.max(a.y, y) + 1, Math.min(a.frame, frame), Math.max(a.frame, frame)));
    } else anchor.current = { frame, y: row.y + row.h / 2 };
    setCursorRow(row.kind === 'prop' ? row.key : null);
    store().setUi({ frame, activeLayerId: row.layer.id });
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
      const row = rowAt(e);
      if (!row || row.kind === 'folder') return;
      const layer = row.layer;
      const f = frameAt(e);
      const keyEl = detailed ? t.closest<HTMLElement>('[data-key]') : null;
      if (keyEl) {
        const ref = keyEl.dataset.key!;
        if (!tl().keys.has(ref)) pickKeys([ref]);
        select(layer.id, firstFrameOf(doc, [ref]) ?? f);
        setMenu({ x: e.clientX, y: e.clientY, items: keyMenu([...tl().keys], row.kind === 'layer' ? celMenu(layer, firstFrameOf(doc, [ref]) ?? f) : []) });
        return;
      }
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
      setMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Add a marker here', onClick: () => addMarkerAt(f) },
          { label: 'Start the play range here (in)', onClick: () => setIn(f) },
          { label: 'End the play range here (out)', onClick: () => setOut(f) },
          ...(doc.inOut ? [{ label: 'Play everything again (clear the play range)', onClick: () => clearInOut() }] : []),
        ],
      });
    }
  };

  const addMarkerAt = (f: number) => {
    const o = ops.addMarker(f);
    if (o.id) setTl({ editing: { kind: 'marker', id: o.id } });
  };

  const gridStyle = { '--cw': `${cw}px`, '--fps-w': `${cw * fps}px`, width: total * cw } as React.CSSProperties;
  const ghostCel = ghost?.kind === 'cel' ? ghost : null;
  const ghostRow = ghostCel ? rowOfLayerIn(layout, ghostCel.layerId) : undefined;
  const bodyStyle = { '--side-w': `${sideW}px` } as React.CSSProperties;

  // Drawn here (not in the row) so a marker or clip being dragged shows where it will land.
  const dragMarker = ghost?.kind === 'marker' ? ghost : null;
  const dragClip = ghost?.kind === 'clip' ? ghost : null;
  const dragKeys = ghost?.kind === 'keys' ? ghost : null;
  const box = ghost?.kind === 'box' ? ghost : null;
  const markers = useStore((s) => (detailed ? s.doc.markers : null));

  return (
    <div ref={scroller} className={`tl-body${detailed ? ' is-detailed' : ''}${panning ? ' is-panning' : ''}`} style={bodyStyle} data-dragging={ghost ? ghost.kind : undefined}>
      <div className="tl-inner">
      <div className="tl-side">
        <div className="tl-corner" style={{ height: rulerH + marksH + clipsH }}>
          <LayerTools />
        </div>
        <LayerList />
        <TimelineSlot slot="side" />
      </div>
      <div
        ref={main}
        className="tl-main"
        style={gridStyle}
        tabIndex={0}
        aria-label="Frames. Arrow keys move around, Shift and arrows pick keys, Delete removes picked keys."
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          dragRef.current = null;
          setPanning(false);
          setGhost(null);
        }}
        onDoubleClick={onDouble}
        onContextMenu={onContext}
        onKeyDown={onKey}
      >
        <div className="tl-top">
          <Ruler cw={cw} from={from} to={to} length={length} fps={fps} total={total} ghostLength={ghost?.kind === 'length' ? ghost.length : null} ghostRange={ghost?.kind === 'inOut' ? ghost : null} detailed={detailed} h={rulerH} />
          <MarkersRow cw={cw} from={from} to={to} h={marksH} />
          <ClipsRow cw={cw} from={from} to={to} h={clipsH} />
          <Playhead part="ruler" cw={cw} cursor={cursor} />
          {dragMarker ? <i className="tl-ghost-line" style={{ left: dragMarker.frame * cw, top: 0, height: rulerH + marksH }} /> : null}
          {dragClip ? <i className="tl-ghost-clip" style={{ left: dragClip.start * cw, width: (dragClip.end - dragClip.start + 1) * cw, top: rulerH + marksH, height: clipsH }} /> : null}
        </div>
        <div ref={rows} className="tl-rows" data-region="rows" style={{ height: layout.height }}>
          {layout.rows.map((r) =>
            r.kind === 'folder' ? (
              <div key={r.key} className={`tl-row is-folder${r.row.folder.visible ? '' : ' is-hidden'}`} style={{ height: r.h }} />
            ) : r.kind === 'prop' ? (
              <PropRow key={r.key} layer={r.layer} track={r.track} cw={cw} from={from} to={to} picked={picked} h={r.h} last={r.last} />
            ) : detailed ? (
              <DetailRow key={r.key} layer={r.layer} cw={cw} from={from} to={to} active={r.layer.id === activeId} picked={picked} fxKeys={r.open ? null : fxTracks(r.tracks)} h={r.h} />
            ) : (
              <GridRow key={r.key} layer={r.layer} cw={cw} from={from} to={to} active={r.layer.id === activeId} />
            ),
          )}
          {markers?.filter((m) => m.frame >= from && m.frame <= to).map((m) => <i key={m.id} className="tl-mline" style={{ left: m.frame * cw }} aria-hidden="true" />)}
          <span className="tl-beyond" style={{ left: (ghost?.kind === 'length' ? ghost.length : length) * cw }} />
          <Playhead part="rows" cw={cw} cursor={cursor} />
          <TweenOfferView cw={cw} layout={layout} />
          {ghostCel && ghostRow ? <i className={`tl-ghost-cel${ghostCel.trim ? ' is-trim' : ''}`} style={{ left: ghostCel.start * cw + 1, width: ghostCel.length * cw - 2, top: ghostRow.y + 3, height: ghostRow.h - 6 }} /> : null}
          {dragKeys ? <KeysGhost layout={layout} refs={picked} map={dragKeys.map} text={dragKeys.text} cw={cw} /> : null}
          {box ? <i className="tl-box" style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} /> : null}
        </div>
        <TimelineSlot slot="main" cw={cw} from={from} to={to} />
      </div>
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}

// Effect rows, shown as small dots on a folded layer's row.
const fxCache = new WeakMap<object, ReturnType<typeof layerTracks>>();
function fxTracks(tracks: ReturnType<typeof layerTracks>) {
  let hit = fxCache.get(tracks);
  if (!hit) fxCache.set(tracks, (hit = tracks.filter((t) => t.id.startsWith('fx-'))));
  return hit.length ? hit : null;
}

/** Picked keys where they'll land while they're dragged, with how far they've gone. */
function KeysGhost({ layout, refs, map, text, cw }: { layout: Layout; refs: ReadonlySet<KeyRef>; map: (f: number) => number; text: string; cw: number }) {
  const spots = keySpots(layout, refs);
  if (!spots.length) return null;
  const top = Math.min(...spots.map((s) => s.y));
  const left = Math.min(...spots.map((s) => map(s.frame)));
  return (
    <>
      {spots.map((s) => (
        <i key={s.ref + s.y} className={`tl-ghost-key${s.small ? ' is-small' : ''}`} style={{ left: (map(s.frame) + 0.5) * cw, top: s.y }} />
      ))}
      <span className="tl-ghost-tag" style={{ left: left * cw, top: Math.max(0, top - 26) }}>
        {text}
      </span>
    </>
  );
}

/** What you can do to picked keys. */
function keyMenu(refs: KeyRef[], extra: MenuItem[]): MenuItem[] {
  const n = refs.length;
  const items: MenuItem[] = [
    { heading: n === 1 ? 'Key' : `${n} keys` },
    { label: n === 1 ? 'Delete this key' : `Delete ${n} keys`, danger: true, hint: 'Delete', onClick: () => void (deleteKeys(refs).ok && clearKeys()) },
    { label: 'Move one frame later', hint: 'Alt+→', onClick: () => void keysResult(moveKeys(refs, 1)) },
    { label: 'Move one frame earlier', hint: 'Alt+←', onClick: () => void keysResult(moveKeys(refs, -1)) },
  ];
  if (n > 1) {
    items.push(
      { label: 'Spread out (twice as long)', onClick: () => void keysResult(scaleKeys(refs, 2)) },
      { label: 'Squeeze together (half as long)', onClick: () => void keysResult(scaleKeys(refs, 0.5)) },
    );
  }
  return extra.length ? [...items, { separator: true }, ...extra] : items;
}

function keysResult(o: ReturnType<typeof moveKeys>): void {
  if (o.ok) pickKeys(o.refs);
  else if (o.why) toast(o.why);
}

// ---------------------------------------------------------------- menus

/** What you can do to a cell, in plain words. */
/** The small offer to make in-betweens, on the span that was clicked. */
function TweenOfferView({ cw, layout }: { cw: number; layout: Layout }) {
  const o = tweenOffer.use((v) => v);
  if (!o) return null;
  const row = rowOfLayerIn(layout, o.layerId);
  if (!row) return null;
  const close = () => dismissTweenOffer(store().get().doc);
  return (
    <div
      className="tl-offer"
      data-region="offer"
      role="group"
      aria-label={`Make in-betweens from frame ${o.start + 1} to frame ${o.end + 2}?`}
      style={{ left: (o.start + 1) * cw + 2, top: row.y + Math.max(2, (row.h - 26) / 2), height: Math.min(26, row.h - 4) }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <span className="tl-offer-text" aria-live="polite">In-betweens?</span>
      <button type="button" className="tl-offer-btn" title={`Move it from this drawing to the next (classic tween)${keyHint('tween.make') ? `, ${keyHint('tween.make')}` : ''}`} onClick={() => acceptTweenOffer('classic')}>
        <Icon name="tween" size={13} />
        Move
      </button>
      {o.morph ? (
        <button type="button" className="tl-offer-btn" title="Melt this drawing's shapes into the next one (shape tween)" onClick={() => acceptTweenOffer('shape')}>
          <Icon name="morph" size={13} />
          Morph
        </button>
      ) : null}
      <button type="button" className="tl-offer-x" aria-label="No thanks" title="No thanks (it won't ask again here until something changes)" onClick={close}>
        <Icon name="close" size={11} />
      </button>
    </div>
  );
}

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
      : { label: 'Make in-betweens (tween)', hint: keyHint('tween.make'), disabled: none || (layer.kind !== 'vector' && layer.kind !== 'pixel'), onClick: () => void makeTween(layer.id, frame) },
    { heading: 'One-click motions' },
    ...MOTIONS.map((m): MenuItem => ({ label: `Make it ${m.label.toLowerCase()}`, disabled: none || (layer.kind !== 'vector' && layer.kind !== 'pixel') || !!cel?.tween, onClick: () => makeMotion(m.id, layer.id, frame) })),
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
    {
      label: 'Put this drawing on the light table',
      checked: store().get().ui.lightTable?.frame === frame && store().get().ui.lightTable?.layerId === layer.id,
      disabled: none || (layer.kind !== 'vector' && layer.kind !== 'pixel'),
      onClick: () => pinLightTable(frame, layer.id),
    },
  ];
}

function clipMenu(c: Clip): MenuItem[] {
  return [
    { heading: `Clip: ${c.name} (frames ${c.start + 1} to ${c.end + 1})` },
    { label: 'Show how it plays in Properties', onClick: () => { setTl({ clipId: c.id }); showPanel('clip-play'); } },
    { label: tl().clipId === c.id ? 'Play everything again' : 'Play just this clip', onClick: () => setTl({ clipId: tl().clipId === c.id ? null : c.id }) },
    { label: 'Rename', onClick: () => setTl({ editing: { kind: 'clip', id: c.id } }) },
    { separator: true },
    ...clipPlayItems(c),
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
