// The right side as Properties plus a labelled rail. Presentation only: which panels are here, which one is open and
// how wide it is all still come from the dock layout (dock.ts), so workspaces, dragging and the View menu work as before.
//   Properties: the sections for what you're doing now (tool options, colours, the selection's motion, effects, text...)
//   in one scroll, each folding. Sections that don't apply yet wait at the bottom with what would make them apply.
//   The rail: Properties, then every other panel here with its name, in groups. A Panels button lists everything.
// Stacked groups (dockModel.ts) share this one rail: each group has a heading in it, and the content area beside it is
// split the same way, a box per group with the keyboard splitter between.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getPanel, type DockZone } from '../core/registry';
import { useStore } from '../core/store';
import { useTl } from '../timeline/state';
import { useLocked } from './lockState';
import { dock, MIN_SIZE, setActive, toggleCollapsed } from './dock';
import { hidePanel } from './lockedDock';
import { dragState, dropIndexFor, startPanelDrag } from './dockDrag';
import { menuPoint, openDockMenu, panelMenu } from './dockMenus';
import { groupsOf } from './dockModel';
import { dragging, PanelBoundary } from './dockShared';
import { Icon } from './icons';
import { openHelp } from './overlays';
import { PanelHelp, PanelScope, useShowExplanations } from './explain/ExplainIcon';
import { groupWord, infoFor, planRight, sectionsNow, shortName, PANEL_INFO, type RightGroupPlan } from './panelInfo';
import { PanelPicker } from './PanelPicker';
import { ZoneStack } from './DockGroup';
import { folded, foldAll, onlyOpen, panelPicker, setFolded, togglePicker, type RightStyle } from './rightStyle';
import './rightDock.css';
import { useShownZone } from './roomFolds';

export const RAIL_W = 68;
const PROPS = '__properties';

/** Which Properties section to open when the person presses Properties on the rail. */
let lastSection: string | null = null;
/** The section Properties last scrolled to. */
let lastShown: string | null = null;

/** The id of a group's content box: the first keeps the plain name. */
const bodyId = (group: number): string => (group === 0 ? 'rd-body' : `rd-body-${group}`);

/**
 * The right side: a content box per group (Properties or a panel, each with its heading) beside one rail that lists
 * every group's panels under that group's heading.
 */
export function RightDock({ zone, style }: { zone: DockZone; style: RightStyle }) {
  const z = useShownZone(dock.use((d) => d.layout.zones[zone]), zone);
  const width = z.collapsed ? RAIL_W : z.size + RAIL_W;
  const merge = style === 'inspector';
  const plans = planRight(groupsOf(z), merge);
  const first = plans[0];
  const picker = panelPicker.use((v) => v);
  // Remember the Properties section in front, so pressing Properties on the rail comes back to it.
  if (first.onProps && first.active) lastSection = first.active;
  return (
    <section className={`ui-zone ui-zone-${zone} rd${z.collapsed ? ' is-collapsed' : ''}`} style={z.collapsed ? { width } : { width, minWidth: MIN_SIZE[zone] + RAIL_W }} aria-label={`${zone} side`}>
      <div className="rd-top">
        {!z.collapsed && <ZoneStack zone={zone} render={(gi) => (plans[gi] ? <GroupBody zone={zone} plan={plans[gi]} /> : null)} />}
        <Rail zone={zone} plans={plans} />
        {picker && <PanelPicker at={picker} side="left" onClose={() => panelPicker.set(null)} />}
      </div>
    </section>
  );
}

/** One group's content: Properties, or its front panel under a heading with help and close. */
function GroupBody({ zone, plan }: { zone: DockZone; plan: RightGroupPlan }) {
  const names = dock.use((d) => d.layout.names);
  const showWords = useShowExplanations();
  const { active, onProps, sections } = plan;
  const panel = !onProps && active ? getPanel(active) : undefined;
  if (!onProps && !panel) return null;
  return (
    <div className="rd-body" role="tabpanel" id={bodyId(plan.index)} aria-labelledby={`rd-tab-${onProps ? PROPS : active}`} data-panel-id={onProps ? undefined : (active ?? undefined)}>
      {onProps ? (
        <Inspector sections={sections} active={active} />
      ) : (
        panel && (
          <>
            <header className="rd-head">
              <Icon name={panel.icon} size={16} />
              <h2 className="rd-head-title">{names?.[panel.id] ?? panel.title}</h2>
              <PanelHelp id={panel.id} title={names?.[panel.id] ?? panel.title} help={panel.help} blurb={infoFor(panel).blurb} />
              <button type="button" className="ui-icon-btn" aria-label={`Close ${panel.title}`} data-tip={`Close ${panel.title}`} data-tip-desc="Bring it back from the Panels button or the View menu." onClick={() => hidePanel(panel.id)}>
                <Icon name="close" size={13} />
              </button>
            </header>
            {showWords && <p className="rd-head-blurb">{infoFor(panel).blurb}</p>}
            <div className="rd-scroll">
              <PanelScope id={panel.id} title={panel.title} help={panel.help} bar>
                <PanelBoundary name={panel.title} key={panel.id}>
                  <panel.component />
                </PanelBoundary>
              </PanelScope>
            </div>
          </>
        )
      )}
    </div>
  );
}

/** The one rail down the whole side. With stacked groups, each group's places sit under its own heading. */
function Rail({ zone, plans }: { zone: DockZone; plans: RightGroupPlan[] }) {
  const locked = useLocked('panels');
  const z = useShownZone(dock.use((d) => d.layout.zones[zone]), zone);
  const drag = dragging.use((v) => v);
  const names = dock.use((d) => d.layout.names);
  const dropAts = dragState.use((d) => plans.map((p) => dropIndexFor(d, { zone, group: p.index }, p.tabs.length) ?? '').join(','));
  const picker = panelPicker.use((v) => v);
  const stacked = plans.length > 1;
  const dropAt = (g: number): number | null => {
    const v = dropAts.split(',')[g];
    return v ? Number(v) : null;
  };

  // The rail, top to bottom: each group's Properties (the first only, when it has sections), then its places.
  const itemsOf = (p: RightGroupPlan): string[] => [...(p.sections.length ? [PROPS] : []), ...p.places.flatMap((g) => g.ids)];
  const items: string[] = plans.flatMap(itemsOf);
  const owner = (id: string): RightGroupPlan => plans.find((p) => p.tabs.includes(id)) ?? plans[0];
  const first = plans[0];
  const chosenOf = (p: RightGroupPlan): string | null => (z.collapsed ? null : p.onProps ? PROPS : p.active);
  const tabStop = chosenOf(first) ?? items[0];

  const open = (id: string) => {
    if (id === PROPS) {
      const to = lastSection && first.sections.includes(lastSection) ? lastSection : first.sections[0];
      if (to) setActive(zone, to);
      return;
    }
    const p = owner(id);
    // Pressing the open one again folds the side away, like Illustrator's icon strip (a stacked side keeps its groups in view).
    if (!stacked && id === p.active && !z.collapsed && !p.onProps) return toggleCollapsed(zone, true);
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

  const tabFor = (id: string, p: RightGroupPlan) => {
    const isProps = id === PROPS;
    const pd = isProps ? null : getPanel(id);
    if (!isProps && !pd) return null;
    const title = isProps ? 'Properties' : (names?.[id] ?? pd!.title);
    const label = isProps ? 'Properties' : (names?.[id] ?? shortName(pd!));
    const on = chosenOf(p) === id;
    const blurb = isProps ? 'Settings for what you are doing now: the tool, colours and whatever you have selected.' : infoFor(pd!).blurb;
    const at = dropAt(p.index);
    const before = drag && at !== null && at === (isProps ? 0 : p.tabs.indexOf(id));
    return (
      <button
        key={id}
        type="button"
        role="tab"
        id={`rd-tab-${id}`}
        data-rail-id={id}
        className={`rd-item${on ? ' is-chosen' : ''}${before ? ' drop-before' : ''}${drag === id ? ' is-dragging' : ''}`}
        aria-selected={on}
        aria-controls={on ? bodyId(p.index) : undefined}
        aria-label={title}
        aria-describedby={`rd-desc-${id}`}
        tabIndex={tabStop === id ? 0 : -1}
        data-help={isProps ? 'properties' : (pd!.help ?? 'panels')}
        data-tip={title}
        data-tip-desc={`${blurb}${isProps ? '' : locked ? ' Right-click for more.' : ' Drag to move it. Right-click for more.'}`}
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
        <Icon name={isProps ? 'sliders' : pd!.icon} size={18} />
        <span className="rd-item-label">{label}</span>
        <span className="ui-sr-only" id={`rd-desc-${id}`}>
          {blurb}
        </span>
      </button>
    );
  };

  /** A group's places: Properties first, then the places in their kinds, kinds split by a line. */
  const places = (p: RightGroupPlan) => (
    <>
      {p.sections.length > 0 && tabFor(PROPS, p)}
      {p.places.map((g, gi) => (
        <div key={g.group} className="rd-group" role="presentation">
          {(gi > 0 || p.sections.length > 0) && <span className="rd-sep" aria-hidden="true" />}
          {g.ids.map((id) => tabFor(id, p))}
        </div>
      ))}
    </>
  );

  // One group: the whole rail is the drop bar. Several: each group is its own bar, and the rail between them takes a drop at the end.
  const railDrop = stacked
    ? { 'data-dock-area': '', 'data-dock-zone': zone }
    : { 'data-dock-strip': '', 'data-dock-zone': zone, 'data-dock-group': 0, 'data-dock-tabs': first.tabs.join(','), 'data-dock-axis': 'y' };

  return (
    <div className={`rd-rail${stacked ? ' is-stacked' : ''}`} {...railDrop}>
      <div className="rd-rail-items">
        {stacked ? (
          plans.map((p) => (
            <div key={p.index} className="rd-rgroup" data-dock-strip="" data-dock-zone={zone} data-dock-group={p.index} data-dock-tabs={p.tabs.join(',')} data-dock-axis="y">
              <h3 className="rd-ghead" id={`rd-gh-${p.index}`}>
                {groupWord(p.index, plans.length)}
              </h3>
              <div className="rd-tablist" role="tablist" aria-labelledby={`rd-gh-${p.index}`} aria-orientation="vertical">
                {places(p)}
              </div>
            </div>
          ))
        ) : (
          <div className="rd-tablist" role="tablist" aria-label="Right side" aria-orientation="vertical">
            {places(first)}
          </div>
        )}
      </div>
      <span className="rd-fill" />
      {locked && (
        // Takes no room of its own, so nothing beside it moves when the lock goes on.
        <span className="rd-lock" data-tip="Panels locked" data-tip-desc="The panels stay where they are. Right-click a tab and choose Unlock the panels to move them." data-help="lock-layout">
          <Icon name="lock" size={13} />
        </span>
      )}
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
  );
}

// ---------------------------------------------------------------- Properties

function Inspector({ sections, active }: { sections: string[]; active: string | null }) {
  // The Clip section shows while a clip is picked on the timeline (that is not in the document store).
  useTl((t) => t.clipId);
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
              <button key={id} type="button" data-wraps className="rd-idle-item" data-tip={p.title} data-tip-desc={infoFor(p).blurb} data-help={p.help ?? 'properties'} onClick={() => setActive('right', id)}>
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
        <PanelHelp id={p.id} title={p.title} help={p.help ?? 'properties'} blurb={info?.blurb} size={13} className="rd-sec-help" />
      </h3>
      {open && (
        <div className="rd-sec-body" id={`rd-sec-b-${id}`}>
          <PanelScope id={p.id} title={p.title} help={p.help ?? 'properties'} bar>
            <PanelBoundary name={p.title}>
              <p.component />
            </PanelBoundary>
          </PanelScope>
        </div>
      )}
    </section>
  );
}
