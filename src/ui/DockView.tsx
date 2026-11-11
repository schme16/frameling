// The docked zones (left, right, bottom): tabs you can drag, splitters you can pull, zones that fold away.
import { Component, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { getPanel, type DockZone } from '../core/registry';
import { clampSize, DEFAULT_SIZE, dock, hidePanel, movePanel, resizeZone, setActive, toggleCollapsed } from './dock';
import { Icon } from './icons';
import { createStore } from './mini';

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
    for (let i = 0; i < tabs.length; i++) {
      const r = tabs[i].getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) return i;
    }
    return tabs.length;
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

  const tabs = z.tabs.map((id, i) => {
    const p = getPanel(id);
    if (!p) return null;
    const on = id === active;
    return (
      <div
        key={id}
        className={`ui-tab${on && !z.collapsed ? ' is-chosen' : ''}${drag === id ? ' is-dragging' : ''}${dropAt === i && drag ? ' drop-before' : ''}${dropAt === i + 1 && i === z.tabs.length - 1 && drag ? ' drop-after' : ''}`}
        role="presentation"
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
          {(!z.collapsed || horizontal) && <span className="ui-tab-title">{p.title}</span>}
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
        <span className="ui-tabbar-fill" />
        {collapseBtn}
      </div>
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
