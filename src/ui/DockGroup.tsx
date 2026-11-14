// Stacked tab groups inside a dock zone: the stack itself (a box per group with a splitter between), one group drawn as a
// tab bar over its panel, and the splitter you can pull or use from the keyboard. The model is dockModel.ts.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { getPanel, type DockZone } from '../core/registry';
import { dock, evenGroupSplit, flushDock, hidePanel, nudgeGroupSplit, panelTitle, setActive, setGroupSplit, toggleCollapsed } from './dock';
import { dragState, dropIndexFor, splitFor, startPanelDrag } from './dockDrag';
import { groupCount, groupsOf, MIN_SHARE, sharesOf } from './dockModel';
import { menuPoint, openDockMenu, panelMenu } from './dockMenus';
import { PanelBoundary } from './dockShared';
import { Icon } from './icons';
import { PanelPicker } from './PanelPicker';
import { panelPicker, togglePicker } from './rightStyle';
import { fitTabs, NAMED_PANELS, type TabFit } from './tabFit';

const COLLAPSE_ICON: Record<DockZone, string> = { left: 'chevron-left', right: 'chevron-right', bottom: 'chevron-down', top: 'chevron-up' };
const EXPAND_ICON: Record<DockZone, string> = { left: 'chevron-right', right: 'chevron-left', bottom: 'chevron-up', top: 'chevron-down' };

/** Groups stack across the short side: top to bottom on the left and right, side by side along the bottom and top. */
const acrossOf = (zone: DockZone): boolean => zone === 'bottom' || zone === 'top';

/** A zone's groups, each in a box that takes its share of the room, with a splitter between each two. */
export function ZoneStack({ zone, render }: { zone: DockZone; render: (group: number) => ReactNode }) {
  const z = dock.use((d) => d.layout.zones[zone]);
  const ref = useRef<HTMLDivElement>(null);
  const n = groupCount(z);
  const shares = sharesOf(z);
  const across = acrossOf(zone);
  return (
    <div ref={ref} className={`ui-stack ui-stack-${across ? 'x' : 'y'}`}>
      {Array.from({ length: n }, (_, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <GroupSplitter zone={zone} boundary={gi - 1} stack={ref} />}
          <GroupBox zone={zone} group={gi} count={n} share={shares[gi]}>
            {render(gi)}
          </GroupBox>
        </Fragment>
      ))}
    </div>
  );
}

/** One group's box: where a drop lands (the whole box joins its tabs, an edge of it makes a new group). */
function GroupBox({ zone, group, count, share, children }: { zone: DockZone; group: number; count: number; share: number; children: ReactNode }) {
  const live = dragState.use((d) => !!d && d.kind !== 'tools');
  const over = dragState.use((d) => dropIndexFor(d, { zone, group }, 0) !== null);
  const split = dragState.use((d) => splitFor(d, { zone, group }));
  return (
    <div
      className={`ui-group${live ? ' is-target' : ''}${over ? ' is-over' : ''}${split ? ` is-split-${split}` : ''}`}
      style={count > 1 ? { flex: `${share} 1 0%` } : undefined}
      data-dock-area=""
      data-dock-zone={zone}
      data-dock-group={group}
      data-dock-groups={count}
      data-dock-stack={acrossOf(zone) ? 'x' : 'y'}
    >
      {children}
    </div>
  );
}

const STEP = 0.02;
const BIG_STEP = 0.1;

/** The line between two stacked groups. Pull it, or use the arrow keys (Shift for bigger steps, Home and End, Enter to even them out). */
function GroupSplitter({ zone, boundary, stack }: { zone: DockZone; boundary: number; stack: React.RefObject<HTMLDivElement | null> }) {
  const z = dock.use((d) => d.layout.zones[zone]);
  const start = useRef<{ pos: number; first: number; extent: number } | null>(null);
  const across = acrossOf(zone);
  const shares = sharesOf(z);
  const first = shares[boundary];
  const pair = first + shares[boundary + 1];
  const gs = groupsOf(z);
  const nameOf = (i: number) => panelTitle(gs[i]?.active ?? gs[i]?.tabs[0] ?? '');
  const pct = (v: number) => Math.round(v * 100);
  const done = () => {
    start.current = null;
    document.body.classList.remove('ui-resizing');
    flushDock();
  };
  return (
    <div
      className={`ui-group-split ui-group-split-${across ? 'v' : 'h'}`}
      role="separator"
      aria-orientation={across ? 'vertical' : 'horizontal'}
      aria-label={`Resize ${nameOf(boundary)} and ${nameOf(boundary + 1)}`}
      aria-valuenow={pct(first)}
      aria-valuemin={pct(MIN_SHARE)}
      aria-valuemax={pct(pair - MIN_SHARE)}
      aria-valuetext={`${nameOf(boundary)} takes ${pct(first)} percent of the ${zone === 'left' || zone === 'right' ? 'height' : 'width'}`}
      tabIndex={0}
      data-help="panels"
      data-tip="Resize the groups"
      data-tip-desc="Drag it, or focus it and press the arrow keys. Enter makes the two even."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const r = stack.current?.getBoundingClientRect();
        if (!r) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pos: across ? e.clientX : e.clientY, first, extent: across ? r.width : r.height };
        document.body.classList.add('ui-resizing');
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || s.extent <= 0) return;
        setGroupSplit(zone, boundary, s.first + ((across ? e.clientX : e.clientY) - s.pos) / s.extent, false);
      }}
      onPointerUp={done}
      onPointerCancel={done}
      onDoubleClick={() => evenGroupSplit(zone, boundary)}
      onKeyDown={(e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const grow = across ? 'ArrowRight' : 'ArrowDown';
        const shrink = across ? 'ArrowLeft' : 'ArrowUp';
        const step = e.shiftKey ? BIG_STEP : STEP;
        if (e.key === grow) nudgeGroupSplit(zone, boundary, step);
        else if (e.key === shrink) nudgeGroupSplit(zone, boundary, -step);
        else if (e.key === 'Home') setGroupSplit(zone, boundary, 0);
        else if (e.key === 'End') setGroupSplit(zone, boundary, 1);
        else if (e.key === 'Enter') evenGroupSplit(zone, boundary);
        else return;
        e.preventDefault();
      }}
    />
  );
}

/** One group as a tab bar over its panel. The first group of a zone also holds the fold button (and the Panels button on the right). */
export function TabGroupView({ zone, group, panelsButton }: { zone: DockZone; group: number; panelsButton?: boolean }) {
  const picker = panelPicker.use((v) => (panelsButton ? v : null));
  const z = dock.use((d) => d.layout.zones[zone]);
  const g = groupsOf(z)[group] ?? { tabs: [], active: null };
  const drag = dragState.use((d) => (d && d.kind !== 'tools' ? d.panels[0] : null));
  const dropAt = dragState.use((d) => dropIndexFor(d, { zone, group }, g.tabs.length));
  const names = dock.use((d) => d.layout.names);
  const bar = useRef<HTMLDivElement>(null);
  const horizontal = zone === 'bottom' || zone === 'top';
  const measure = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<TabFit | null>(null);
  // Where the "+N" list opens (fixed, so the zone's own clipping can't cut it off), or null when it's shut.
  const [moreAt, setMoreAt] = useState<{ top: number; right: number } | null>(null);
  const moreOpen = moreAt !== null;
  const setMoreOpen = (open: boolean) => setMoreAt(open ? moreAt : null);
  const flat = !z.collapsed || horizontal;
  const activeId = g.active ?? g.tabs[0];
  const tabKey = g.tabs.join('|');
  const first = group === 0;
  const stacked = groupCount(z) > 1;

  // Measure the tabs as they'd look with and without names, and fit them to the bar. Runs again when the bar
  // changes size, so tabs never scroll out of sight.
  useLayoutEffect(() => {
    const el = bar.current;
    const m = measure.current;
    if (!el || !m || !flat) {
      setFit(null);
      return;
    }
    const run = () => {
      const full = [...m.querySelectorAll<HTMLElement>('[data-m="full"]')].map((e) => e.getBoundingClientRect().width);
      const icon = [...m.querySelectorAll<HTMLElement>('[data-m="icon"]')].map((e) => e.getBoundingClientRect().width);
      const more = m.querySelector<HTMLElement>('[data-m="more"]')?.getBoundingClientRect().width ?? 40;
      const fold = (el.querySelector<HTMLElement>('.ui-zone-fold')?.getBoundingClientRect().width ?? 24) + (el.querySelector<HTMLElement>('.ui-tab-panels')?.getBoundingClientRect().width ?? 0);
      const cs = getComputedStyle(el);
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - fold - 6;
      const next = fitTabs({ avail, gap: parseFloat(cs.columnGap) || 2, full, icon, active: Math.max(0, g.tabs.indexOf(activeId)), more, pinned: g.tabs.flatMap((t, i) => (NAMED_PANELS.has(t) ? [i] : [])) });
      setFit((f) => (f && f.mode === next.mode && f.shown.join() === next.shown.join() && f.named.join() === next.named.join() ? f : next));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabKey, activeId, flat]);

  // The "+N" list closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof PointerEvent && (e.target as HTMLElement).closest?.('.ui-tab-more-wrap')) return;
      setMoreOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
    };
  }, [moreOpen]);

  // An empty zone takes no room. While something is dragged, the bands over the canvas edges stand in for it.
  if (!g.tabs.length) return null;

  const active = g.active ?? g.tabs[0];
  const panel = getPanel(active);
  const where = stacked ? `${zone} panels, group ${group + 1}` : `${zone} panels`;

  const shown = fit ? new Set(fit.shown) : null;
  const iconOnly = fit !== null && fit.mode !== 'full';
  const tabs = g.tabs.map((id, i) => {
    const p = getPanel(id);
    if (!p) return null;
    if (shown && !shown.has(i)) return null;
    const on = id === active;
    const title = names?.[id] ?? p.title;
    return (
      <div
        key={id}
        className={`ui-tab${on && !z.collapsed ? ' is-chosen' : ''}${drag === id ? ' is-dragging' : ''}${dropAt === i && drag ? ' drop-before' : ''}${dropAt === i + 1 && i === g.tabs.length - 1 && drag ? ' drop-after' : ''}`}
        role="presentation"
        data-dock-tab={id}
        data-panel-id={id}
        onPointerDown={(e) => startPanelDrag(e, id)}
        onContextMenu={(e) => {
          e.preventDefault();
          openDockMenu(e.clientX, e.clientY, panelMenu(id, { x: e.clientX, y: e.clientY }));
        }}
      >
        <button
          type="button"
          role="tab"
          id={`ui-tab-${id}`}
          aria-selected={on && !z.collapsed}
          aria-controls={on && !z.collapsed ? `ui-panel-${id}` : undefined}
          aria-label={title}
          // One stop per tab strip: Tab lands on the chosen tab, the arrow keys move along.
          tabIndex={on ? 0 : -1}
          className="ui-tab-main"
          data-help={p.help ?? 'panels'}
          data-tip={title}
          data-tip-desc={z.collapsed ? 'Press to open. Drag to move it. Right-click for more.' : 'Drag to move it, out to a window, to another side or to the edge of a group to split. Right-click for more.'}
          onClick={() => setActive(zone, id)}
          onKeyDown={(e) => {
            // Delete closes the panel, like the little x does.
            if (e.key === 'Delete') {
              e.preventDefault();
              e.stopPropagation();
              hidePanel(id);
              return;
            }
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
              e.preventDefault();
              e.stopPropagation();
              const at = menuPoint(e.currentTarget);
              openDockMenu(at.x, at.y, panelMenu(id, at));
              return;
            }
            const n = g.tabs.length;
            const vertical = z.collapsed && !horizontal;
            const back = e.key === 'ArrowLeft' || (vertical && e.key === 'ArrowUp');
            const fwd = e.key === 'ArrowRight' || (vertical && e.key === 'ArrowDown');
            const to = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : fwd ? (i + 1) % n : back ? (i - 1 + n) % n : -1;
            if (to < 0) return;
            e.preventDefault();
            e.stopPropagation();
            const next = g.tabs[to];
            setActive(zone, next);
            requestAnimationFrame(() => document.getElementById(`ui-tab-${next}`)?.focus());
          }}
        >
          <Icon name={p.icon} size={15} />
          {flat && !(iconOnly && !on && !fit?.named.includes(i)) && <span className="ui-tab-title">{title}</span>}
        </button>
        {on && !z.collapsed && (
          // Kept out of the tab order and away from screen readers: Delete on the tab does the same.
          <button type="button" className="ui-tab-close" tabIndex={-1} aria-hidden="true" data-tip={`Close ${title}`} data-tip-desc="Bring it back from the View menu." onClick={() => hidePanel(id)}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
    );
  });

  const collapseBtn = (
    <button
      type="button"
      className="ui-icon-btn ui-zone-fold"
      aria-label={z.collapsed ? `Open the ${zone} panels` : `Fold away the ${zone} panels`}
      aria-expanded={!z.collapsed}
      data-tip={z.collapsed ? 'Open panels' : 'Fold panels away'}
      data-help="panels"
      onClick={() => toggleCollapsed(zone)}
    >
      <Icon name={z.collapsed ? EXPAND_ICON[zone] : COLLAPSE_ICON[zone]} size={14} />
    </button>
  );

  return (
    <>
      <div className="ui-tabbar" data-scrolls ref={bar} data-dock-strip="" data-dock-zone={zone} data-dock-group={group} data-dock-tabs={g.tabs.join(',')} data-dock-axis={z.collapsed && !horizontal ? 'y' : 'x'}>
        <div className="ui-tabbar-tabs" role="tablist" aria-label={where} aria-orientation={z.collapsed && !horizontal ? 'vertical' : 'horizontal'}>
          {tabs}
        </div>
        {fit && fit.hidden.length > 0 && (
          <div className="ui-tab-more-wrap">
            <button
              type="button"
              className={`ui-tab-more${moreOpen ? ' is-open' : ''}`}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label={`${fit.hidden.length} more panel${fit.hidden.length === 1 ? '' : 's'}`}
              data-tip={`${fit.hidden.length} more panel${fit.hidden.length === 1 ? '' : 's'}`}
              data-tip-desc="There isn't room for every tab here. Widen the panels to see them all."
              onClick={(e) => {
                if (moreOpen) return setMoreOpen(false);
                const r = e.currentTarget.getBoundingClientRect();
                setMoreAt({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
              }}
            >
              +{fit.hidden.length}
              <Icon name="chevron-down" size={12} />
            </button>
            {moreOpen && (
              <div className="ui-menu ui-tab-more-menu" role="menu" aria-label="More panels" style={{ top: moreAt.top, right: moreAt.right }}>
                {fit.hidden.map((i) => {
                  const p = getPanel(g.tabs[i]);
                  if (!p) return null;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="menuitem"
                      className="ui-menu-item"
                      onClick={() => {
                        setActive(zone, g.tabs[i]);
                        setMoreOpen(false);
                      }}
                    >
                      <span className="ui-menu-tick">
                        <Icon name={p.icon} size={14} />
                      </span>
                      <span className="ui-menu-label">{names?.[p.id] ?? p.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <span className="ui-tabbar-fill" />
        {panelsButton && first && flat && (
          <button
            type="button"
            className="ui-icon-btn ui-tab-panels"
            data-panels-button
            aria-haspopup="dialog"
            aria-expanded={!!picker}
            aria-label="All panels"
            data-tip="All panels"
            data-tip-desc="Every panel with what it's for. Open one, or bring back one you closed."
            data-help="panels"
            onClick={(e) => togglePicker(e.currentTarget)}
          >
            <Icon name="workspace" size={15} />
          </button>
        )}
        {first && collapseBtn}
      </div>
      {flat && (
        <div className="ui-tab-measure" ref={measure} aria-hidden="true">
          {g.tabs.map((id) => {
            const p = getPanel(id);
            if (!p) return null;
            return (
              <span key={id} className="ui-tab-measure-pair">
                <span className="ui-tab" data-m="full">
                  <span className="ui-tab-main">
                    <Icon name={p.icon} size={15} />
                    <span className="ui-tab-title">{names?.[id] ?? p.title}</span>
                  </span>
                  {id === activeId && !z.collapsed && <span className="ui-tab-close" />}
                </span>
                <span className="ui-tab" data-m="icon">
                  <span className="ui-tab-main">
                    <Icon name={p.icon} size={15} />
                  </span>
                </span>
              </span>
            );
          })}
          <span className="ui-tab-more" data-m="more">
            +9
            <Icon name="chevron-down" size={12} />
          </span>
        </div>
      )}
      {picker && <PanelPicker at={picker} side="below" onClose={() => panelPicker.set(null)} />}
      {!z.collapsed && panel && (
        <div className="ui-panel" role="tabpanel" id={`ui-panel-${active}`} aria-labelledby={`ui-tab-${active}`} data-panel-id={active}>
          <h2 className="ui-sr-only">{names?.[active] ?? panel.title}</h2>
          <PanelBoundary name={panel.title} key={active}>
            <panel.component />
          </PanelBoundary>
        </div>
      )}
    </>
  );
}
