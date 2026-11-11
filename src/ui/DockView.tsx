// The docked zones (left, right, bottom): tabs you can drag, splitters you can pull, zones that fold away.
import { Component, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { getPanel, type DockZone } from '../core/registry';
import { clampSize, DEFAULT_SIZE, dock, hidePanel, movePanel, resizeZone, setActive, toggleCollapsed } from './dock';
import { Icon } from './icons';
import { createStore } from './mini';
import { fitTabs, NAMED_PANELS, type TabFit } from './tabFit';

const dragging = createStore<string | null>(null);

/** One broken panel shouldn't take the window with it. */
class PanelBoundary extends Component<{ children: ReactNode; name: string }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: unknown, info: ErrorInfo) {
    console.error(`Panel "${this.props.name}" crashed`, e, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ui-panel-broken">
        <Icon name="warning" size={20} />
        <p>The {this.props.name} panel tripped over something.</p>
        <button type="button" className="ui-btn" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}

const COLLAPSE_ICON: Record<DockZone, string> = { left: 'chevron-left', right: 'chevron-right', bottom: 'chevron-down' };
const EXPAND_ICON: Record<DockZone, string> = { left: 'chevron-right', right: 'chevron-left', bottom: 'chevron-up' };

export function DockZoneView({ zone }: { zone: DockZone }) {
  const z = dock.use((d) => d.layout.zones[zone]);
  const drag = dragging.use((v) => v);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const horizontal = zone === 'bottom';
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
      const fold = el.querySelector<HTMLElement>('.ui-zone-fold')?.getBoundingClientRect().width ?? 24;
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

  if (!z.tabs.length) {
    if (!drag) return null;
    return (
      <div
        className={`ui-zone ui-zone-${zone} ui-zone-empty is-target`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (drag) movePanel(drag, zone);
          dragging.set(null);
        }}
      >
        <span>Drop here</span>
      </div>
    );
  }

  const active = z.active ?? z.tabs[0];
  const panel = getPanel(active);

  const indexAt = (e: React.DragEvent): number => {
    const tabs = [...(bar.current?.querySelectorAll<HTMLElement>('.ui-tab') ?? [])];
    for (const t of tabs) {
      const r = t.getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) return Number(t.dataset.index);
    }
    return z.tabs.length;
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropAt(indexAt(e));
  };
  const onDrop = (e: React.DragEvent) => {
    if (!drag) return;
    e.preventDefault();
    movePanel(drag, zone, dropAt ?? indexAt(e));
    dragging.set(null);
    setDropAt(null);
  };
  const dropClass = drag ? ' is-target' : '';

  const shown = fit ? new Set(fit.shown) : null;
  const iconOnly = fit !== null && fit.mode !== 'full';
  const tabs = z.tabs.map((id, i) => {
    const p = getPanel(id);
    if (!p) return null;
    if (shown && !shown.has(i)) return null;
    const on = id === active;
    return (
      <div
        key={id}
        className={`ui-tab${on && !z.collapsed ? ' is-chosen' : ''}${drag === id ? ' is-dragging' : ''}${dropAt === i && drag ? ' drop-before' : ''}${dropAt === i + 1 && i === z.tabs.length - 1 && drag ? ' drop-after' : ''}`}
        role="presentation"
        data-index={i}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', id);
          e.dataTransfer.effectAllowed = 'move';
          dragging.set(id);
        }}
        onDragEnd={() => {
          dragging.set(null);
          setDropAt(null);
        }}
      >
        <button
          type="button"
          role="tab"
          id={`ui-tab-${id}`}
          aria-selected={on && !z.collapsed}
          aria-controls={`ui-panel-${id}`}
          className="ui-tab-main"
          data-help={p.help ?? 'panels'}
          data-tip={p.title}
          data-tip-desc={z.collapsed ? 'Press to open. Drag to move it.' : 'Drag to move it to another place.'}
          onClick={() => setActive(zone, id)}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            const next = z.tabs[(i + step + z.tabs.length) % z.tabs.length];
            setActive(zone, next);
            requestAnimationFrame(() => document.getElementById(`ui-tab-${next}`)?.focus());
          }}
        >
          <Icon name={p.icon} size={15} />
          {flat && !(iconOnly && !on && !fit?.named.includes(i)) && <span className="ui-tab-title">{p.title}</span>}
        </button>
        {on && !z.collapsed && (
          <button type="button" className="ui-tab-close" aria-label={`Close ${p.title} panel`} data-tip={`Close ${p.title}`} data-tip-desc="Bring it back from the View menu." onClick={() => hidePanel(id)}>
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
    <section className={`ui-zone ui-zone-${zone}${z.collapsed ? ' is-collapsed' : ''}${dropClass}`} style={style} aria-label={`${zone} panels`} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="ui-tabbar" role="tablist" ref={bar} aria-orientation={z.collapsed && !horizontal ? 'vertical' : 'horizontal'}>
        {tabs}
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
                      <span className="ui-menu-label">{p.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <span className="ui-tabbar-fill" />
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
                    <span className="ui-tab-title">{p.title}</span>
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
      {!z.collapsed && panel && (
        <div className="ui-panel" role="tabpanel" id={`ui-panel-${active}`} aria-labelledby={`ui-tab-${active}`}>
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
  if (!z.tabs.length || z.collapsed) return null;
  const horizontal = zone === 'bottom';
  const sign = zone === 'left' ? 1 : -1;

  return (
    <div
      className={`ui-splitter ui-splitter-${horizontal ? 'h' : 'v'}`}
      role="separator"
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-label={`Resize the ${zone} panels`}
      aria-valuenow={z.size}
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
        resizeZone(zone, start.current.size + (horizontal ? -delta : sign * delta));
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
        const grow = horizontal ? 'ArrowUp' : zone === 'left' ? 'ArrowRight' : 'ArrowLeft';
        const shrink = horizontal ? 'ArrowDown' : zone === 'left' ? 'ArrowLeft' : 'ArrowRight';
        if (e.key !== grow && e.key !== shrink) return;
        e.preventDefault();
        resizeZone(zone, clampSize(zone, z.size + (e.key === grow ? 16 : -16)));
      }}
    />
  );
}
