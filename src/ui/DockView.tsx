// The docked zones (left, right, bottom, top): tabs you can drag, splitters you can pull, zones that fold away.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getPanel, type DockZone } from '../core/registry';
import { clampSize, DEFAULT_SIZE, dock, MAX_SIZE, MIN_SIZE, hidePanel, panelsAway, resizeZone, setActive, toggleCollapsed } from './dock';
import { dragState, dropIndexFor, startPanelDrag } from './dockDrag';
import { menuPoint, openDockMenu, panelMenu } from './dockMenus';
import { Icon } from './icons';
import { PanelBoundary } from './dockShared';
import { fitTabs, NAMED_PANELS, type TabFit } from './tabFit';
import { PanelPicker } from './PanelPicker';
import { RightDock } from './RightDock';
import { panelPicker, rightStyle, togglePicker } from './rightStyle';

const COLLAPSE_ICON: Record<DockZone, string> = { left: 'chevron-left', right: 'chevron-right', bottom: 'chevron-down', top: 'chevron-up' };
const EXPAND_ICON: Record<DockZone, string> = { left: 'chevron-right', right: 'chevron-left', bottom: 'chevron-up', top: 'chevron-down' };

export function DockZoneView({ zone }: { zone: DockZone }) {
  const style = rightStyle.use((v) => v);
  const away = panelsAway.use((v) => v);
  if (away) return null;
  if (zone === 'right' && style !== 'tabs') return <RightDock zone={zone} style={style} />;
  return <TabZoneView zone={zone} panelsButton={zone === 'right'} />;
}

function TabZoneView({ zone, panelsButton }: { zone: DockZone; panelsButton?: boolean }) {
  const picker = panelPicker.use((v) => (panelsButton ? v : null));
  const z = dock.use((d) => d.layout.zones[zone]);
  const drag = dragState.use((d) => (d && d.kind !== 'tools' ? d.panels[0] : null));
  const dropAt = dragState.use((d) => dropIndexFor(d, { zone }, z.tabs.length));
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
  const activeId = z.active ?? z.tabs[0];
  const tabKey = z.tabs.join('|');

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
      const next = fitTabs({ avail, gap: parseFloat(cs.columnGap) || 2, full, icon, active: Math.max(0, z.tabs.indexOf(activeId)), more, pinned: z.tabs.flatMap((t, i) => (NAMED_PANELS.has(t) ? [i] : [])) });
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
  if (!z.tabs.length) return null;

  const active = z.active ?? z.tabs[0];
  const panel = getPanel(active);

  const dropClass = `${drag ? ' is-target' : ''}${dropAt !== null ? ' is-over' : ''}`;

  const shown = fit ? new Set(fit.shown) : null;
  const iconOnly = fit !== null && fit.mode !== 'full';
  const tabs = z.tabs.map((id, i) => {
    const p = getPanel(id);
    if (!p) return null;
    if (shown && !shown.has(i)) return null;
    const on = id === active;
    const title = names?.[id] ?? p.title;
    return (
      <div
        key={id}
        className={`ui-tab${on && !z.collapsed ? ' is-chosen' : ''}${drag === id ? ' is-dragging' : ''}${dropAt === i && drag ? ' drop-before' : ''}${dropAt === i + 1 && i === z.tabs.length - 1 && drag ? ' drop-after' : ''}`}
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
          data-tip-desc={z.collapsed ? 'Press to open. Drag to move it. Right-click for more.' : 'Drag to move it, out to a window or to another side. Right-click for more.'}
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
            const n = z.tabs.length;
            const vertical = z.collapsed && !horizontal;
            const back = e.key === 'ArrowLeft' || (vertical && e.key === 'ArrowUp');
            const fwd = e.key === 'ArrowRight' || (vertical && e.key === 'ArrowDown');
            const to = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : fwd ? (i + 1) % n : back ? (i - 1 + n) % n : -1;
            if (to < 0) return;
            e.preventDefault();
            e.stopPropagation();
            const next = z.tabs[to];
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

  const style = z.collapsed ? undefined : horizontal ? { height: z.size } : { width: z.size };

  return (
    <section className={`ui-zone ui-zone-${zone}${z.collapsed ? ' is-collapsed' : ''}${dropClass}`} style={style} aria-label={`${zone} panels`} data-dock-area="" data-dock-zone={zone}>
      <div className="ui-tabbar" ref={bar} data-dock-strip="" data-dock-zone={zone} data-dock-tabs={z.tabs.join(',')} data-dock-axis={z.collapsed && !horizontal ? 'y' : 'x'}>
        <div className="ui-tabbar-tabs" role="tablist" aria-label={`${zone} panels`} aria-orientation={z.collapsed && !horizontal ? 'vertical' : 'horizontal'}>
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
                  const p = getPanel(z.tabs[i]);
                  if (!p) return null;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="menuitem"
                      className="ui-menu-item"
                      onClick={() => {
                        setActive(zone, z.tabs[i]);
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
        {panelsButton && flat && (
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
        {collapseBtn}
      </div>
      {flat && (
        <div className="ui-tab-measure" ref={measure} aria-hidden="true">
          {z.tabs.map((id) => {
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
    </section>
  );
}

/** The thin line between a zone and the canvas. */
export function Splitter({ zone }: { zone: DockZone }) {
  const z = dock.use((d) => d.layout.zones[zone]);
  const start = useRef<{ pos: number; size: number } | null>(null);
  const away = panelsAway.use((v) => v);
  if (!z.tabs.length || z.collapsed || away) return null;
  const horizontal = zone === 'bottom' || zone === 'top';
  // Dragging right grows the left side, left grows the right side; down grows the top, up grows the bottom.
  const sign = zone === 'left' || zone === 'top' ? 1 : -1;

  return (
    <div
      className={`ui-splitter ui-splitter-${horizontal ? 'h' : 'v'}`}
      role="separator"
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-label={`Resize the ${zone} panels`}
      aria-valuenow={z.size}
      aria-valuemin={MIN_SIZE[zone]}
      aria-valuemax={MAX_SIZE[zone]}
      aria-valuetext={`${z.size} pixels`}
      tabIndex={0}
      data-help="panels"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pos: horizontal ? e.clientY : e.clientX, size: z.size };
        document.body.classList.add('ui-resizing');
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const delta = (horizontal ? e.clientY : e.clientX) - start.current.pos;
        resizeZone(zone, start.current.size + sign * delta);
      }}
      onPointerUp={() => {
        start.current = null;
        document.body.classList.remove('ui-resizing');
      }}
      onPointerCancel={() => {
        start.current = null;
        document.body.classList.remove('ui-resizing');
      }}
      onDoubleClick={() => resizeZone(zone, DEFAULT_SIZE[zone])}
      onKeyDown={(e) => {
        // Arrows resize (Shift for bigger steps), Home and End go to the smallest and largest, Enter resets.
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const grow = zone === 'top' ? 'ArrowDown' : horizontal ? 'ArrowUp' : zone === 'left' ? 'ArrowRight' : 'ArrowLeft';
        const shrink = zone === 'top' ? 'ArrowUp' : horizontal ? 'ArrowDown' : zone === 'left' ? 'ArrowLeft' : 'ArrowRight';
        const step = e.shiftKey ? 64 : 16;
        let next: number | null = null;
        if (e.key === grow) next = z.size + step;
        else if (e.key === shrink) next = z.size - step;
        else if (e.key === 'Home') next = MIN_SIZE[zone];
        else if (e.key === 'End') next = MAX_SIZE[zone];
        else if (e.key === 'Enter') next = DEFAULT_SIZE[zone];
        if (next === null) return;
        e.preventDefault();
        resizeZone(zone, clampSize(zone, next));
      }}
    />
  );
}
