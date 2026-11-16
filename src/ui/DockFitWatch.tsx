// Watches the room the docked zones and the canvas really have and folds a zone to its slim rail when there is too
// little (see dockFit.ts for the rule). Draws nothing.
import { useLayoutEffect } from 'react';
import type { DockZone } from '../core/registry';
import { dock, MIN_SIZE, panelsAway } from './dock';
import { CANVAS_LEAST, foldsFor, type FitZone, type Folds } from './dockFit';
import { RAIL_W } from './RightDock';
import { rightStyle } from './rightStyle';
import { roomFolds, setRoomFolds } from './roomFolds';

const size = (el: Element | null, axis: 'x' | 'y'): number => (el ? (axis === 'x' ? (el as HTMLElement).offsetWidth : (el as HTMLElement).offsetHeight) : 0);

/** One axis: the row (left, canvas, right) or the column (top, canvas, bottom). */
function measure(axis: 'x' | 'y', start: DockZone, end: DockZone, was: Folds): Folds | null {
  const container = document.querySelector<HTMLElement>(axis === 'x' ? '.ui-body' : '.ui-center');
  const middle = document.querySelector<HTMLElement>(axis === 'x' ? '.ui-center' : '.ui-canvas');
  if (!container || !middle) return null;
  const cs = getComputedStyle(container);
  const pad = axis === 'x' ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) : parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const room = (axis === 'x' ? container.clientWidth : container.clientHeight) - pad;
  const layout = dock.get().layout.zones;
  const away = panelsAway.get();
  const side = (zone: DockZone): FitZone => {
    const z = layout[zone];
    const rd = zone === 'right' && rightStyle.get() !== 'tabs';
    return { present: !away && z.tabs.length > 0 && !z.collapsed, min: MIN_SIZE[zone] + (rd ? RAIL_W : 0), folded: zone === 'left' || zone === 'right' ? (rd ? RAIL_W : 40) : 34 };
  };
  const zoneEl = (z: DockZone) => document.querySelector(`.ui-zone-${z}`);
  // Everything in the row or column that is neither a zone nor the canvas: rails, splitters, gaps and padding.
  const other = room - size(middle, axis) - size(zoneEl(start), axis) - size(zoneEl(end), axis);
  return foldsFor(room, other, CANVAS_LEAST[axis], side(start), side(end), was);
}

export function DockFitWatch() {
  useLayoutEffect(() => {
    let frame = 0;
    const apply = () => {
      frame = 0;
      const f = roomFolds.get();
      const across = measure('x', 'left', 'right', { start: f.left, end: f.right });
      const down = measure('y', 'top', 'bottom', { start: f.top, end: f.bottom });
      setRoomFolds({
        ...(across ? { left: across.start, right: across.end } : {}),
        ...(down ? { top: down.start, bottom: down.end } : {}),
      });
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    const ro = new ResizeObserver(soon);
    for (const sel of ['.ui-body', '.ui-center']) {
      const el = document.querySelector(sel);
      if (el) ro.observe(el);
    }
    window.addEventListener('resize', soon);
    const off = [dock.subscribe(soon), panelsAway.subscribe(soon), rightStyle.subscribe(soon)];
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('resize', soon);
      off.forEach((f) => f());
    };
  }, []);
  return null;
}
