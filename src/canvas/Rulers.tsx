// The rulers along the top and left of the canvas: ticks in the chosen unit that follow the zoom and pan, a marker
// that follows the pointer, and guide lines dragged out of them. Drawn straight onto two small canvases (never through
// React state) so they keep up while you pan and draw.
import { useEffect, useRef, useState } from 'react';
import type { Guide } from '../core/format';
import { store } from '../core/store';
import { docDpi, pxTo, roundIn, showNumber, toPx, UNITS, unitInfo } from '../core/units';
import { getPrefs, setPrefs, subscribePrefs, usePrefs } from '../ui/prefs';
import { cancelGuideDrag, endGuideDrag, getGuideDrag, moveGuideDrag, startGuideDrag } from './guides';
import { RULER, rulerTicks } from './rulerTicks';
import { nearest, SNAP_PX } from './snap';
import { cssVar, subscribeTheme } from './theme';
import { getViewSettings, subscribeViewSettings } from './viewSettings';

/** The ruler look: 'solid' (a panel strip, the default) or 'glass' (see-through over the canvas). For the A/B. */
let look: 'solid' | 'glass' = 'solid';
const lookListeners = new Set<() => void>();
export function setRulerLook(l: 'solid' | 'glass'): void {
  look = l;
  for (const fn of lookListeners) fn();
}
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingRulerLook: typeof setRulerLook }).__framelingRulerLook = setRulerLook;
}

/** How close (screen pixels) a press on a ruler has to be to a guide's marker to pick that guide up. */
const GRAB_PX = 5;

/** A guide position tidied to what the unit shows (whole pixels, tenths of a mm...). */
function tidy(at: number): number {
  const unit = getPrefs().units;
  const dpi = docDpi(store().get().doc);
  return unit === 'px' ? Math.round(at) : toPx(roundIn(pxTo(at, unit, dpi), unit), unit, dpi);
}

export function Rulers({ root }: { root: React.RefObject<HTMLDivElement | null> }) {
  const topRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const units = usePrefs((p) => p.units);
  const [lookNow, setLookNow] = useState(look);
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | null>(null);
  // The pointer, in canvas-area pixels (null when it's away).
  const pointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const fn = () => setLookNow(look);
    lookListeners.add(fn);
    return () => void lookListeners.delete(fn);
  }, []);

  useEffect(() => {
    const el = root.current;
    const top = topRef.current;
    const left = leftRef.current;
    if (!el || !top || !left) return;
    let raf = 0;
    const redraw = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const draw = () => {
      raf = 0;
      const { doc, ui } = store().get();
      const unit = getPrefs().units;
      const dpi = docDpi(doc);
      const dpr = window.devicePixelRatio || 1;
      const W = el.clientWidth;
      const H = el.clientHeight;
      const muted = cssVar('--muted', '#8a8598');
      const faint = cssVar('--faint', '#7d7591');
      const guideInk = cssVar('--guide', '#2fc4e8');
      const accent = cssVar('--accent', '#9b7bff');
      const font = `600 9.5px ${cssVar('--font-ui', 'system-ui, sans-serif')}`;
      const p = pointer.current;
      const drag = getGuideDrag();

      for (const side of ['top', 'left'] as const) {
        const c = side === 'top' ? top : left;
        const len = (side === 'top' ? W : H) - RULER;
        const cw = Math.max(1, Math.round((side === 'top' ? len : RULER) * dpr));
        const ch = Math.max(1, Math.round((side === 'top' ? RULER : len) * dpr));
        if (c.width !== cw || c.height !== ch) {
          c.width = cw;
          c.height = ch;
        }
        const g = c.getContext('2d');
        if (!g) continue;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, cw, ch);
        // Everything is drawn as if it were the top ruler; the left one is the same turned a quarter.
        if (side === 'left') g.setTransform(0, dpr, dpr, 0, 0, 0);
        const pan = side === 'top' ? ui.panX : ui.panY;
        // Stage pixel to ruler pixel.
        const at = (v: number) => pan + v * ui.zoom - RULER;
        const from = (RULER - pan) / ui.zoom;
        const to = (RULER + len - pan) / ui.zoom;
        const ticks = rulerTicks(from, to, ui.zoom, unit, dpi);

        // The page's own stretch, lightly marked.
        g.fillStyle = faint;
        g.globalAlpha = 0.14;
        const s0 = Math.max(0, at(0));
        const s1 = Math.min(len, at(side === 'top' ? doc.width : doc.height));
        if (s1 > s0) g.fillRect(s0, 0, s1 - s0, RULER);

        g.globalAlpha = 1;
        g.strokeStyle = muted;
        g.lineWidth = 1;
        g.beginPath();
        for (const t of ticks.minor) {
          const x = Math.round(at(t.at)) + 0.5;
          const h = t.half ? 7 : 4;
          g.moveTo(x, RULER);
          g.lineTo(x, RULER - h);
        }
        g.globalAlpha = 0.7;
        g.stroke();
        g.globalAlpha = 1;
        g.beginPath();
        for (const t of ticks.major) {
          const x = Math.round(at(t.at)) + 0.5;
          g.moveTo(x, RULER);
          g.lineTo(x, 2);
        }
        g.stroke();
        g.fillStyle = muted;
        g.font = font;
        g.textBaseline = 'top';
        for (const t of ticks.major) {
          const x = Math.round(at(t.at));
          if (side === 'top') g.fillText(t.label, x + 3, 2);
          else {
            // Read bottom to top, like every left ruler.
            g.save();
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.translate(2, x + 3);
            g.rotate(-Math.PI / 2);
            g.textAlign = 'right';
            g.fillText(t.label, 0, 0);
            g.restore();
          }
        }

        // Guide markers: little triangles where each guide crosses this ruler.
        const axis = side === 'top' ? 'x' : 'y';
        const v = getViewSettings();
        if (v.guides) {
          g.fillStyle = guideInk;
          for (const gd of doc.guides ?? []) {
            if (gd.axis !== axis) continue;
            const x = (drag?.existing && drag.guide.id === gd.id ? drag.at : gd.at) ?? null;
            if (x === null) continue;
            marker(g, at(x));
          }
          if (drag && !drag.existing && drag.guide.axis === axis && drag.at !== null) marker(g, at(drag.at));
        }

        // Where the pointer is.
        if (p) {
          const x = Math.round((side === 'top' ? p.x : p.y) - RULER) + 0.5;
          g.strokeStyle = accent;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, RULER);
          g.stroke();
        }
      }
    };

    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onMove = (e: PointerEvent) => {
      pointer.current = local(e);
      redraw();
    };
    const onLeave = () => {
      if (getGuideDrag()) return;
      pointer.current = null;
      redraw();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);

    // Dragging guides out of (and back into) the rulers.
    const toStage = (pt: { x: number; y: number }) => {
      const { zoom, panX, panY } = store().get().ui;
      return { x: (pt.x - panX) / zoom, y: (pt.y - panY) / zoom };
    };
    const where = (pt: { x: number; y: number }, axis: 'x' | 'y'): number | null => {
      if (pt.x < RULER || pt.y < RULER) return null;
      const { doc, ui } = store().get();
      const s = toStage(pt);
      let v = tidy(axis === 'x' ? s.x : s.y);
      // The page's edges and middle pull the guide onto them.
      const edge = nearest(v, axis === 'x' ? [0, doc.width / 2, doc.width] : [0, doc.height / 2, doc.height], SNAP_PX / ui.zoom);
      if (edge !== null) v = edge;
      return v;
    };
    const label = (axis: 'x' | 'y', v: number | null) => {
      if (v === null) return 'Let go to remove';
      const unit = getPrefs().units;
      const dpi = docDpi(store().get().doc);
      return `${axis === 'x' ? 'Across' : 'Down'} ${showNumber(pxTo(v, unit, dpi), unit)} ${unit}`;
    };
    const press = (side: 'top' | 'left') => (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const pt = local(e);
      const { doc, ui } = store().get();
      // A marker on the top ruler is an up-and-down guide; on the left ruler, a sideways one.
      const markerAxis = side === 'top' ? 'x' : 'y';
      const along = side === 'top' ? pt.x : pt.y;
      const pan = side === 'top' ? ui.panX : ui.panY;
      let hit: Guide | undefined;
      if (getViewSettings().guides) {
        let best = GRAB_PX;
        for (const gd of doc.guides ?? []) {
          const d = Math.abs(pan + gd.at * ui.zoom - along);
          if (gd.axis === markerAxis && d <= best) {
            best = d;
            hit = gd;
          }
        }
      }
      // Dragging from the top ruler brings down a sideways guide, from the left one an up-and-down one.
      const axis = hit ? hit.axis : side === 'top' ? 'y' : 'x';
      if (!startGuideDrag(axis, hit)) return;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const q = local(ev);
        pointer.current = q;
        const v = where(q, axis);
        moveGuideDrag(v);
        setReadout({ x: q.x, y: q.y, text: label(axis, v) });
        redraw();
      };
      const finish = (ok: boolean) => () => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', esc, true);
        setReadout(null);
        if (ok) endGuideDrag();
        else cancelGuideDrag();
        redraw();
      };
      const up = finish(true);
      const cancel = finish(false);
      const esc = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        ev.stopPropagation();
        if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
        cancel();
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', esc, true);
      setReadout({ x: pt.x, y: pt.y, text: hit ? label(axis, hit.at) : 'Drag onto the page to add a guide' });
    };
    const topDown = press('top');
    const leftDown = press('left');
    top.addEventListener('pointerdown', topDown);
    left.addEventListener('pointerdown', leftDown);

    const ro = new ResizeObserver(redraw);
    ro.observe(el);
    const offs = [store().subscribe(redraw), subscribePrefs(redraw), subscribeViewSettings(redraw), subscribeTheme(redraw)];
    redraw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const off of offs) off();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      top.removeEventListener('pointerdown', topDown);
      left.removeEventListener('pointerdown', leftDown);
    };
  }, [root]);

  const next = UNITS[(UNITS.findIndex((u) => u.id === units) + 1) % UNITS.length];
  return (
    <div className="cv-rulers" data-look={lookNow}>
      <canvas className="cv-ruler cv-ruler-top" ref={topRef} data-tip="Ruler" data-tip-desc="Drag down from here to add a sideways guide. Drag a guide's marker back here to remove it." />
      <canvas className="cv-ruler cv-ruler-left" ref={leftRef} data-tip="Ruler" data-tip-desc="Drag across from here to add an up-and-down guide. Drag a guide's marker back here to remove it." />
      <button type="button" className="cv-ruler-corner" onClick={() => setPrefs({ units: next.id })} data-tip={`Units: ${unitInfo(units).label}`} data-tip-desc={`Press to show ${next.label.toLowerCase()} instead.`} aria-label={`Ruler units: ${unitInfo(units).label}. Press for ${next.label.toLowerCase()}.`}>
        {units}
      </button>
      {readout && (
        <div className="cv-ruler-readout" style={{ left: readout.x + 14, top: readout.y + 14 }}>
          {readout.text}
        </div>
      )}
    </div>
  );
}

function marker(g: CanvasRenderingContext2D, x: number): void {
  g.beginPath();
  g.moveTo(x - 4, RULER - 7);
  g.lineTo(x + 4, RULER - 7);
  g.lineTo(x, RULER);
  g.closePath();
  g.fill();
}
