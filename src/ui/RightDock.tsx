// The right side as Properties plus a labelled rail. Presentation only: which panels are here, which one is open and
// how wide it is all still come from the dock layout (dock.ts), so workspaces, dragging and the View menu work as before.
//   Properties: the sections for what you're doing now (tool options, colours, the selection's motion, effects, text...)
//   in one scroll, each folding. Sections that don't apply yet wait at the bottom with what would make them apply.
//   The rail: Properties, then every other panel here with its name, in groups. A Panels button lists everything.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getPanel, type DockZone } from '../core/registry';
import { useStore } from '../core/store';
import { dock, hidePanel, setActive, toggleCollapsed } from './dock';
import { dragState, dropIndexFor, startPanelDrag } from './dockDrag';
import { menuPoint, openDockMenu, panelMenu } from './dockMenus';
import { dragging, PanelBoundary } from './dockShared';
import { Icon } from './icons';
import { openHelp } from './overlays';
import { infoFor, railGroups, sectionsNow, shortName, splitZone, PANEL_INFO } from './panelInfo';
import { PanelPicker } from './PanelPicker';
import { folded, foldAll, onlyOpen, panelPicker, setFolded, togglePicker, type RightStyle } from './rightStyle';
import './rightDock.css';

export const RAIL_W = 68;
const PROPS = '__properties';

/** Which Properties section to open when the person presses Properties on the rail. */
let lastSection: string | null = null;
/** The section Properties last scrolled to. */
let lastShown: string | null = null;

export function RightDock({ zone, style }: { zone: DockZone; style: RightStyle }) {
  const z = dock.use((d) => d.layout.zones[zone]);
  const drag = dragging.use((v) => v);
  const names = dock.use((d) => d.layout.names);
  const dropAt = dragState.use((d) => dropIndexFor(d, { zone }, z.tabs.length));
  const merge = style === 'inspector';
  const { sections, rail } = splitZone(z.tabs, merge);
  const active = z.active && z.tabs.includes(z.active) ? z.active : (z.tabs[0] ?? null);
  const onProps = merge && !!active && sections.includes(active);
  if (onProps) lastSection = active;
  const picker = panelPicker.use((v) => v);

  // The rail, top to bottom: Properties (when there are sections), then the groups.
  const groups = railGroups(rail);
  const items: string[] = [...(merge && sections.length ? [PROPS] : []), ...groups.flatMap((g) => g.ids)];
  const chosen = z.collapsed ? null : onProps ? PROPS : active;

  const open = (id: string) => {
    if (id === PROPS) {
      const to = lastSection && sections.includes(lastSection) ? lastSection : sections[0];
      if (to) setActive(zone, to);
      return;
    }
    // Pressing the open one again folds the side away, like Illustrator's icon strip.
    if (id === active && !z.collapsed && !onProps) return toggleCollapsed(zone, true);
    setActive(zone, id);
  };
  const focusItem = (id: string) => requestAnimationFrame(() => document.getElementById(`rd-tab-${id}`)?.focus());

  const onKey = (e: React.KeyboardEvent, id: string) => {
    if (id !== PROPS && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
      e.preventDefault();
      e.stopPropagation();
      const at = menuPoint(e.currentTarget);
      openDockMenu(at.x, at.y, panelMenu(id, at));
      return;
    }
    if (e.key === 'Delete' && id !== PROPS) {
      e.preventDefault();
      e.stopPropagation();
      hidePanel(id);
      return;
    }
    const i = items.indexOf(id);
    const n = items.length;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowUp' ? (i - 1 + n) % n : -1;
    if (to < 0) return;
    e.preventDefault();
    e.stopPropagation();
    open(items[to]);
    focusItem(items[to]);
  };

  const tabFor = (id: string) => {
    const isProps = id === PROPS;
    const p = isProps ? null : getPanel(id);
    if (!isProps && !p) return null;
    const title = isProps ? 'Properties' : (names?.[id] ?? p!.title);
    const label = isProps ? 'Properties' : (names?.[id] ?? shortName(p!));
    const on = chosen === id;
    const blurb = isProps ? 'Settings for what you are doing now: the tool, colours and whatever you have selected.' : infoFor(p!).blurb;
    const before = drag && dropAt !== null && dropAt === (isProps ? 0 : z.tabs.indexOf(id));
    return (
      <button
        key={id}
        type="button"
        role="tab"
        id={`rd-tab-${id}`}
        data-rail-id={id}
        className={`rd-item${on ? ' is-chosen' : ''}${before ? ' drop-before' : ''}${drag === id ? ' is-dragging' : ''}`}
        aria-selected={on}
        aria-controls={on ? 'rd-body' : undefined}
        aria-label={title}
        aria-describedby={`rd-desc-${id}`}
        tabIndex={(chosen ?? items[0]) === id ? 0 : -1}
        data-help={isProps ? 'properties' : (p!.help ?? 'panels')}
        data-tip={title}
        data-tip-desc={`${blurb}${isProps ? '' : ' Drag to move it. Right-click for more.'}`}
        data-dock-tab={id}
        data-panel-id={isProps ? undefined : id}
        onPointerDown={isProps ? undefined : (e) => startPanelDrag(e, id)}
        onContextMenu={
          isProps
            ? undefined
            : (e) => {
                e.preventDefault();
                openDockMenu(e.clientX, e.clientY, panelMenu(id, { x: e.clientX, y: e.clientY }));
              }
        }
        onClick={() => open(id)}
        onKeyDown={(e) => onKey(e, id)}
      >
        <Icon name={isProps ? 'sliders' : p!.icon} size={18} />
        <span className="rd-item-label">{label}</span>
        <span className="ui-sr-only" id={`rd-desc-${id}`}>
          {blurb}
        </span>
      </button>
    );
  };

  const panel = !onProps && active ? getPanel(active) : undefined;
  const width = z.collapsed ? RAIL_W : z.size + RAIL_W;

  return (
    <section className={`ui-zone ui-zone-${zone} rd${z.collapsed ? ' is-collapsed' : ''}${drag ? ' is-target' : ''}`} style={{ width }} aria-label={`${zone} side`} data-dock-area="" data-dock-zone={zone}>
      {!z.collapsed && (onProps || panel) && (
        <div className="rd-body" role="tabpanel" id="rd-body" aria-labelledby={`rd-tab-${onProps ? PROPS : active}`} data-panel-id={onProps ? undefined : (active ?? undefined)}>
          {onProps ? (
            <Inspector sections={sections} active={active} />
          ) : (
            panel && (
              <>
                <header className="rd-head">
                  <Icon name={panel.icon} size={16} />
                  <h2 className="rd-head-title">{names?.[panel.id] ?? panel.title}</h2>
                  <button type="button" className="ui-icon-btn" aria-label={`Help on ${panel.title}`} data-tip="What's this?" onClick={() => openHelp(panel.help ?? 'panels')}>
                    <Icon name="help" size={14} />
                  </button>
                  <button type="button" className="ui-icon-btn" aria-label={`Close ${panel.title}`} data-tip={`Close ${panel.title}`} data-tip-desc="Bring it back from the Panels button or the View menu." onClick={() => hidePanel(panel.id)}>
                    <Icon name="close" size={13} />
                  </button>
                </header>
                <p className="rd-head-blurb">{infoFor(panel).blurb}</p>
                <div className="rd-scroll">
                  <PanelBoundary name={panel.title} key={panel.id}>
                    <panel.component />
                  </PanelBoundary>
                </div>
              </>
            )
          )}
        </div>
      )}
      <div className="rd-rail" data-dock-strip="" data-dock-zone={zone} data-dock-tabs={z.tabs.join(',')} data-dock-axis="y">
        <div className="rd-rail-items" role="tablist" aria-label="Right side" aria-orientation="vertical">
          {merge && sections.length > 0 && tabFor(PROPS)}
          {groups.map((g, gi) => (
            <div key={g.group} className="rd-group" role="presentation">
              {(gi > 0 || (merge && sections.length > 0)) && <span className="rd-sep" aria-hidden="true" />}
              {g.ids.map(tabFor)}
            </div>
          ))}
        </div>
        <span className="rd-fill" />
        <button
          type="button"
          className={`rd-item rd-panels${picker ? ' is-open' : ''}`}
          data-panels-button
          aria-haspopup="dialog"
          aria-expanded={!!picker}
          aria-label="All panels"
          data-tip="All panels"
          data-tip-desc="Every panel with what it's for. Open one, or bring back one you closed."
          data-help="panels"
          onClick={(e) => togglePicker(e.currentTarget)}
        >
          <Icon name="workspace" size={18} />
          <span className="rd-item-label">Panels</span>
        </button>
        <button
          type="button"
          className="ui-icon-btn rd-fold"
          aria-label={z.collapsed ? 'Open the right side' : 'Fold the right side away'}
          aria-expanded={!z.collapsed}
          data-tip={z.collapsed ? 'Open the side' : 'Fold the side away'}
          data-help="panels"
          onClick={() => toggleCollapsed(zone)}
        >
          <Icon name={z.collapsed ? 'chevron-left' : 'chevron-right'} size={14} />
        </button>
      </div>
      {picker && <PanelPicker at={picker} side="left" onClose={() => panelPicker.set(null)} />}
    </section>
  );
}

// ---------------------------------------------------------------- Properties

function Inspector({ sections, active }: { sections: string[]; active: string | null }) {
  // Joined so the selector hands back something stable between renders.
  const key = useStore((s) => {
    const r = sectionsNow(sections, s, active);
    return `${r.shown.join(',')}|${r.idle.join(',')}`;
  });
  const [shownKey, idleKey] = key.split('|');
  const shown = shownKey ? shownKey.split(',') : [];
  const idle = idleKey ? idleKey.split(',') : [];
  const fold = folded.use((f) => f);
  const [flash, setFlash] = useState<string | null>(null);
  // Null at first, so coming back to Properties from another place also lands on the section asked for.
  const prev = useRef<string | null>(null);

  // Asking for a section (View menu, a button elsewhere, "also here" below) opens it, scrolls to it and lights it up.
  useLayoutEffect(() => {
    if (!active || prev.current === active) return;
    const first = prev.current === null;
    prev.current = active;
    setFolded(active, false);
    const el = document.getElementById(`rd-sec-${active}`);
    el?.scrollIntoView({ block: 'nearest' });
    // Opening Properties on the section you were on needs no fanfare.
    if (!first || (lastShown !== null && active !== lastShown)) setFlash(active);
    lastShown = active;
  }, [active]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div className="rd-scroll rd-props">
      <header className="rd-head">
        <Icon name="sliders" size={16} />
        <h2 className="rd-head-title">Properties</h2>
        <button type="button" className="ui-icon-btn" aria-label="Help on Properties" data-tip="What's this?" onClick={() => openHelp('properties')}>
          <Icon name="help" size={14} />
        </button>
      </header>
      {shown.map((id) => (
        <Section key={id} id={id} open={!fold.includes(id)} flash={flash === id} all={shown} />
      ))}
      {idle.length > 0 && (
        <div className="rd-idle" role="group" aria-labelledby="rd-idle-title">
          <h3 className="rd-idle-title" id="rd-idle-title">
            Also here
          </h3>
          {idle.map((id) => {
            const p = getPanel(id);
            if (!p) return null;
            return (
              <button key={id} type="button" className="rd-idle-item" data-tip={p.title} data-tip-desc={infoFor(p).blurb} data-help={p.help ?? 'properties'} onClick={() => setActive('right', id)}>
                <Icon name={p.icon} size={15} />
                <span className="rd-idle-name">{p.title}</span>
                <span className="rd-idle-why">{PANEL_INFO[id]?.idle}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({ id, open, flash, all }: { id: string; open: boolean; flash: boolean; all: string[] }) {
  const p = getPanel(id);
  const info = PANEL_INFO[id];
  const detail = useStore((s) => {
    try {
      return info?.detail?.(s) ?? '';
    } catch {
      return '';
    }
  });
  if (!p) return null;
  return (
    <section className={`rd-sec${open ? '' : ' is-folded'}${flash ? ' is-flash' : ''}`} id={`rd-sec-${id}`} aria-labelledby={`rd-sec-h-${id}`} data-help={p.help}>
      <h3
        className="rd-sec-head"
        data-panel-id={id}
        onPointerDown={(e) => startPanelDrag(e, id)}
        onContextMenu={(e) => {
          e.preventDefault();
          openDockMenu(e.clientX, e.clientY, panelMenu(id, { x: e.clientX, y: e.clientY }));
        }}
      >
        <button
          type="button"
          className="rd-sec-toggle"
          id={`rd-sec-h-${id}`}
          aria-expanded={open}
          aria-controls={`rd-sec-b-${id}`}
          data-tip={open ? `Fold ${p.title}` : `Open ${p.title}`}
          data-tip-desc={`${info?.blurb ?? ''} Alt-click to open only this one. Right-click to fold or open them all.`}
          data-help={p.help}
          onClick={(e) => (e.altKey ? onlyOpen(id, all) : setFolded(id, open))}
          onContextMenu={(e) => {
            e.preventDefault();
            foldAll(all, open);
          }}
        >
          <Icon name="chevron-down" size={13} className="rd-sec-chev" />
          <Icon name={p.icon} size={15} />
          <span className="rd-sec-title">{p.title}</span>
          {detail && <span className="rd-sec-detail">{detail}</span>}
        </button>
        <button type="button" className="ui-icon-btn rd-sec-help" aria-label={`Help on ${p.title}`} data-tip="What's this?" onClick={() => openHelp(p.help ?? 'properties')}>
          <Icon name="help" size={13} />
        </button>
      </h3>
      {open && (
        <div className="rd-sec-body" id={`rd-sec-b-${id}`}>
          <PanelBoundary name={p.title}>
            <p.component />
          </PanelBoundary>
        </div>
      )}
    </section>
  );
}
