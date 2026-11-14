import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { allTools, getTool } from '../core/registry';
import { findLayer } from '../core/doc';
import type { LayerKind } from '../core/format';
import { store, useStore } from '../core/store';
import { syncDynamicCommands } from './dynamic';
import { pickTool } from '../tools/pick';
import { Icon } from './icons';
import { currentWorkspace, dock, railOf } from './dock';
import { startToolsDrag, nudgeTools } from './dockDrag';
import { menuPoint, openDockMenu, toolsMenu } from './dockMenus';
import type { DockZone } from './dockModel';
import { useFeaturesVersion } from '../features/use';
import { usePrefs } from './prefs';
import { usePopover } from './popover';
import { awayPlaces, groupName, headingOf, hiddenTools, railFor, resolveGroups, slotMates, twinFor, visibleGroups, whyOff, type RailTool, type ToolGroup } from './toolArrange';
import { iconSizeFor, ToolbarBuilder } from './ToolbarBuilder';
import { toast } from './toast';
import { askGroupRename, currentGroups, flyRequest, foldToolGroup, frontTools, groupMenu, railNote, setToolbarEditing, startToolDrag, stepTool, toolbarEditing, toolDrag, toolMenu } from './toolRail';

/** The kind of layer being drawn on (the last one when none is picked), or null with no layers. */
function useActiveKind(): LayerKind | null {
  return useStore((s) => (findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1])?.kind ?? null);
}

/** The tool rail where it is docked: it renders in the slot of the side it was put on, and nowhere else. */
export function ToolSlot({ at }: { at: DockZone }) {
  const place = dock.use((d) => d.layout.tools.place);
  return place === at ? <ToolStrip place={at} /> : null;
}

/** The tool rail as a small window over the canvas, when it has been floated. */
export function ToolFloat() {
  const place = dock.use((d) => d.layout.tools.place);
  const x = dock.use((d) => d.layout.tools.x);
  const y = dock.use((d) => d.layout.tools.y);
  const [h, setH] = useState(window.innerHeight);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  if (place !== 'float') return null;
  return (
    <div className="ui-float-tools" style={{ left: Math.min(x, window.innerWidth - 110), top: Math.min(y, h - 80), maxHeight: Math.max(120, h - y - 12) }}>
      <ToolStrip place="float" />
    </div>
  );
}

/** The nearest button in a direction, judged by where they are on screen (the rail is a grid, not a line). */
function neighbour(buttons: HTMLElement[], from: HTMLElement, key: string): HTMLElement | undefined {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const down = key === 'ArrowDown';
  const up = key === 'ArrowUp';
  const right = key === 'ArrowRight';
  let best: HTMLElement | undefined;
  let bestScore = Infinity;
  for (const b of buttons) {
    if (b === from) continue;
    const r = b.getBoundingClientRect();
    const dx = r.left + r.width / 2 - ax;
    const dy = r.top + r.height / 2 - ay;
    const along = down ? dy : up ? -dy : right ? dx : -dx;
    const across = down || up ? Math.abs(dx) : Math.abs(dy);
    if (along < 4) continue;
    const score = along + across * 3;
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  if (best) return best;
  // Nothing further that way: wrap round to the other end.
  const i = buttons.indexOf(from);
  return buttons[(i + (down || right ? 1 : -1) + buttons.length) % buttons.length];
}

/** The stacked style's flyout: the rest of a group, beside its button. */
function Flyout({ group, groups, anchor, place, visible, off, why, current, onPick, onClose }: { group: ToolGroup; groups: ToolGroup[]; anchor: DOMRect; place: DockZone | 'float'; visible: (id: string) => boolean; off: Set<string>; why: (id: string) => string; current: string; onPick: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  usePopover(ref, onClose);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [onClose]);
  const side = place === 'top' ? 'below' : place === 'bottom' ? 'above' : place === 'right' || (place === 'float' && anchor.left > window.innerWidth / 2) ? 'left' : 'right';
  const style: React.CSSProperties =
    side === 'below' ? { top: anchor.bottom + 6, left: Math.max(8, anchor.left) } : side === 'above' ? { bottom: window.innerHeight - anchor.top + 6, left: Math.max(8, anchor.left) } : side === 'left' ? { top: Math.max(8, anchor.top), right: window.innerWidth - anchor.left + 6 } : { top: Math.max(8, anchor.top), left: anchor.right + 6 };
  const tools = group.tools.filter(visible);
  // The name box hangs where the flyout is; the flyout closes so it has the screen to itself.
  const rename = () => {
    onClose();
    askGroupRename(group.id, { x: anchor.right + 6, y: anchor.top });
  };
  const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const id = (document.activeElement as HTMLElement | null)?.dataset.toolId;
    if (e.altKey && id) {
      stepTool(id, e.key === 'ArrowDown' ? 1 : -1, visible);
      requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-tool-id="${id}"]`)?.focus());
      return;
    }
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return createPortal(
    <div ref={ref} className="ui-tool-fly" role="menu" aria-label={`${groupName(group, groups)} tools`} style={style} data-tool-axis="y" onKeyDown={onKey}>
      <div className="ui-tool-fly-head" role="presentation" onDoubleClick={rename}>
        {groupName(group, groups)}
      </div>
      {tools.map((id) => {
        const t = getTool(id);
        if (!t) return null;
        return (
          <button
            key={id}
            type="button"
            role="menuitemradio"
            aria-checked={current === id}
            className={`ui-tool-fly-item${current === id ? ' is-chosen' : ''}${off.has(id) ? ' is-off' : ''}`}
            aria-disabled={off.has(id) || undefined}
            data-tool-id={id}
            data-command={`tools.${id}`}
            {...(off.has(id) ? { 'data-tip': t.label, 'data-tip-desc': why(id) } : {})}
            onClick={() => onPick(id)}
            onPointerDown={(e) => startToolDrag(e, id, () => visibleGroups(currentGroups(), visible), visible, onClose)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openDockMenu(e.clientX, e.clientY, [...toolMenu(id, visible), { separator: true }, ...toolsMenu()]);
            }}
          >
            <Icon name={t.icon} size={18} />
            <span>{t.label}</span>
          </button>
        );
      })}
      <button type="button" role="menuitem" className="ui-tool-fly-item ui-tool-fly-rename" data-tip="Rename this group" data-tip-desc="Give the group a name of your own." data-help="tool-strip" onClick={rename}>
        <Icon name="pencil" size={16} />
        <span>Rename group...</span>
      </button>
    </div>,
    document.body,
  );
}

export function ToolStrip({ place = 'left' }: { place?: DockZone | 'float' }) {
  // A feature turned on or off adds or takes away tools.
  useFeaturesVersion();
  syncDynamicCommands();
  const sideways = place === 'top' || place === 'bottom';
  const style = usePrefs((p) => p.toolRail);
  const stacked = style === 'stacked';
  const size = usePrefs((p) => p.toolSize);
  const showNames = usePrefs((p) => p.toolNames);
  const editing = toolbarEditing.use((e) => e);
  const iconPx = iconSizeFor(size);
  const kind = useActiveKind();
  const current = useStore((s) => s.ui.tool);
  // The workspace can narrow the strip (the Pixel workspace shows only pixel art tools on pixel layers).
  const wsId = dock.use((d) => d.workspaceId);
  // Vector and pixel layers get the same rail; what doesn't work on this layer is greyed out where it sits.
  const everything = allTools() as RailTool[];
  const only = kind && wsId ? currentWorkspace()?.tools?.[kind] : undefined;
  const greyOut = usePrefs((p) => p.toolsOffLayer === 'grey');
  const rail = railFor(everything, kind, only, greyOut);
  const tools = rail.shown.map((id) => getTool(id)!).filter(Boolean);
  const ids = rail.shown.join(',');
  const offKey = rail.off.join(',');
  const off = useMemo(() => new Set(offKey ? offKey.split(',') : []), [offKey]);
  const why = (id: string): string => whyOff({ label: getTool(id)?.label, layers: getTool(id)?.layers ?? [] }, kind);
  const choose = (id: string) => {
    if (off.has(id)) toast(why(id), { quill: null });
    else pickTool(id);
  };
  const saved = dock.use((d) => railOf(d));
  // Each tool with where it asked to start in the rail, as text so the memo below only reruns when that changes.
  const allKey = allTools().map((t) => `${t.id}|${t.group ?? ''}|${t.groupAt ?? ''}|${t.slot ?? ''}`).join(',');
  const shown = useMemo(() => new Set(ids ? ids.split(',') : []), [ids]);
  // The whole arrangement, put-away tools too (they stay in their groups, to come back to).
  const whole = useMemo(
    () =>
      resolveGroups(
        saved,
        allKey.split(',').filter(Boolean).map((k) => {
          const [id, group, at, slot] = k.split('|');
          return { id, group: group || undefined, groupAt: at === '' ? undefined : Number(at), slot: slot || undefined };
        }),
      ),
    [saved, allKey],
  );
  const awayIds = useMemo(() => new Set(hiddenTools(whole)), [whole]);
  // What the shelf shows: one for each place, and only the ones that exist on the rail for this layer.
  const awayList = useMemo(() => awayPlaces(whole, slotMates(allTools())).filter((id) => getTool(id)), [whole, allKey]);
  const visible = (id: string) => shown.has(id) && !awayIds.has(id);
  const groups = useMemo(() => visibleGroups(whole, (id) => shown.has(id) && !awayIds.has(id)), [whole, shown, awayIds]);
  const drag = toolDrag.use((d) => d);
  const note = railNote.use((n) => n);
  const front = frontTools.use((f) => f);
  const navRef = useRef<HTMLElement>(null);
  const [fly, setFly] = useState<{ group: string; rect: DOMRect } | null>(null);
  // Where the rail is on screen, for the panel that sits beside it while it is being changed.
  const [railRect, setRailRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!editing) return;
    const measure = () => setRailRect(navRef.current?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [editing, size, showNames, stacked, place, groups.length]);
  const held = useRef<{ timer: number; fired: boolean }>({ timer: 0, fired: false });
  const byId = new Map(tools.map((t) => [t.id, t]));
  const axis = sideways ? 'y' : 'x';

  // The picked tool doesn't work on this kind of layer: move to the same job there (the Lasso becomes the Pixel lasso),
  // or else the first one that does. A tool the workspace only leaves out of the strip still works (picked by its key,
  // say), so it's left alone.
  useEffect(() => {
    const now = getTool(current);
    if (!tools.length || !now || !kind || now.layers.includes(kind)) return;
    const next = twinFor(everything, current, kind) ?? tools.find((t) => !off.has(t.id))?.id;
    if (next) store().setUi({ tool: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, ids, kind]);

  // Whatever tool is used from a group is the one its stacked button shows.
  useEffect(() => {
    const g = groups.find((x) => x.tools.includes(current));
    if (g && frontTools.get()[g.id] !== current) frontTools.set((f) => ({ ...f, [g.id]: current }));
  }, [current, groups]);
  useEffect(() => {
    if (!stacked) setFly((f) => (f && groups.find((g) => g.id === f.group)?.fold ? f : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stacked]);
  // Something outside (a quest) asked for a group's flyout.
  const asked = flyRequest.use((r) => r);
  useEffect(() => {
    if (!asked) return;
    flyRequest.set(null);
    const btn = navRef.current?.querySelector<HTMLElement>(`.ui-tool.is-stack[data-tool-group="${asked}"]`);
    if (btn) setFly({ group: asked, rect: btn.getBoundingClientRect() });
  }, [asked, stacked]);

  // One button for the group: every group when the rail is in the one-per-group style, else the ones folded one by one.
  const foldedGroup = (g: ToolGroup): boolean => stacked || !!g.fold;
  const frontOf = (g: ToolGroup): string => {
    if (g.tools.includes(current)) return current;
    const f = front[g.id];
    if (f && g.tools.includes(f) && !off.has(f)) return f;
    return g.tools.find((t) => !off.has(t)) ?? g.tools[0];
  };

  const refocus = (id: string) =>
    requestAnimationFrame(() => navRef.current?.querySelector<HTMLElement>(`[data-tool-id="${id}"]`)?.focus());

  const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
    const active = document.activeElement as HTMLElement | null;
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const at = menuPoint(active ?? e.currentTarget);
      const gid = active?.dataset.toolGroup;
      if (gid && active?.classList.contains('is-stack')) return setFly({ group: gid, rect: active.getBoundingClientRect() });
      const id = active?.dataset.toolId;
      return openDockMenu(at.x, at.y, id ? [...toolMenu(id, visible), { separator: true }, ...toolsMenu()] : toolsMenu());
    }
    if (!e.key.startsWith('Arrow')) return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button.ui-tool')];
    if (!active || !buttons.includes(active as HTMLButtonElement)) return;
    if (e.altKey) {
      // Alt and an arrow moves the tool along the rail: a step on the short way, a row on the long way.
      const id = active.dataset.toolId;
      if (!id) return;
      const flows = sideways ? e.key === 'ArrowUp' || e.key === 'ArrowDown' : e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      const by = (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) * (flows ? 1 : 2);
      e.preventDefault();
      stepTool(id, by, visible);
      refocus(id);
      return;
    }
    e.preventDefault();
    neighbour(buttons, active, e.key)?.focus();
  };

  const markOf = (id: string): string => {
    const m = drag?.mark;
    if (!m) return '';
    return (m.kind === 'before' || m.kind === 'after') && m.tool === id ? ` is-drop-${m.kind}` : '';
  };

  const onPickGroup = (g: ToolGroup) => {
    if (held.current.fired) {
      held.current.fired = false;
      return;
    }
    choose(frontOf(g));
  };

  const grip = (
    <button
      type="button"
      className="ui-tools-grip"
      aria-label="Move the tools. Arrow keys nudge them while they float."
      data-tip="Move the tools"
      data-tip-desc="Drag to float them, or onto a side of the canvas to dock them there. Right-click for more."
      data-help="tool-strip"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        startToolsDrag(e, { x: e.clientX - r.left + 4, y: e.clientY - r.top + 4 });
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        const d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null;
        if (!d || place !== 'float') return;
        e.preventDefault();
        e.stopPropagation();
        nudgeTools(d[0], d[1]);
      }}
    >
      <Icon name="grip" size={14} />
    </button>
  );

  const flyGroup = fly ? groups.find((g) => g.id === fly.group) : undefined;
  const ghost = drag ? getTool(drag.id) : undefined;

  return (
    <nav
      ref={navRef}
      className={`ui-tools${sideways ? ' is-sideways' : ''}${place === 'float' ? ' is-floating' : ''}${stacked ? ' is-stacked' : ' is-two'}${drag ? ' is-arranging' : ''}${editing ? ' is-editing' : ''}${showNames && !sideways ? ' has-names' : ''} is-size-${size}`}
      aria-label="Tools"
      aria-describedby="tool-rail-hint"
      data-help="tool-strip"
      onKeyDown={onKey}
      onContextMenu={(e) => {
        e.preventDefault();
        const id = (e.target as HTMLElement).closest<HTMLElement>('[data-tool-id]')?.dataset.toolId;
        const gid = (e.target as HTMLElement).closest<HTMLElement>('[data-tool-group]')?.dataset.toolGroup;
        openDockMenu(e.clientX, e.clientY, id ? [...toolMenu(id, visible), { separator: true }, ...toolsMenu()] : gid ? [...groupMenu(gid, { x: e.clientX, y: e.clientY }, visible), { separator: true }, ...toolsMenu()] : toolsMenu());
      }}
    >
      <span id="tool-rail-hint" className="ui-sr-only">
        {stacked || groups.some((g) => g.fold) ? 'Press and hold a one-button group, or open its menu, to pick another tool from it. Hold Alt and press an arrow key on any other tool to move it.' : 'Hold Alt and press an arrow key to move the focused tool.'}
      </span>
      <span className="ui-sr-only" role="status" aria-live="polite">
        {note}
      </span>
      {grip}
      <div className="ui-tool-groups">
        {groups.map((g, gi) => {
          const heading = headingOf(g, groups);
          const folded = foldedGroup(g);
          return (
            <Fragment key={g.id}>
              {gi > 0 && (
                <div
                  className={`ui-tool-gap${drag?.mark?.kind === 'gap' && drag.mark.at === gi ? ' is-drop' : ''}`}
                  data-tool-gap={gi}
                  aria-hidden="true"
                  data-tip={editing ? 'A new group goes here' : heading ?? groupName(g, groups)}
                  data-tip-desc={editing ? 'Drag a tool onto the +, or click a tool and choose Start a new group here.' : 'Double-click to rename this group. Right-click for more.'}
                  data-help={editing ? 'tool-builder' : 'tool-strip'}
                  onDoubleClick={() => askGroupRename(g.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openDockMenu(e.clientX, e.clientY, [...groupMenu(g.id, { x: e.clientX, y: e.clientY }, visible), { separator: true }, ...toolsMenu()]);
                  }}
                />
              )}
              {!sideways && editing ? (
                <div className="ui-tool-head is-edit" data-tool-head={g.id}>
                  <button type="button" className={`ui-tool-head-name${heading ? '' : ' is-empty'}`} data-tip="Name this group" data-tip-desc="Type a name. Leave it empty and the group is just a divider." data-help="tool-builder" onClick={() => askGroupRename(g.id)}>
                    {heading ?? 'Name it'}
                  </button>
                  <button
                    type="button"
                    className={`ui-tool-fold${folded ? ' is-on' : ''}`}
                    aria-pressed={folded}
                    aria-label={`Fold ${heading ?? 'this group'} into one button`}
                    disabled={stacked}
                    data-tip={stacked ? 'Every group is one button' : folded ? 'Open this group out' : 'Fold into one button'}
                    data-tip-desc={stacked ? 'Rail style is One per group. Choose Every tool to fold only some.' : 'The rest of the group waits behind the button. Press and hold it to reach them.'}
                    data-help="tool-builder"
                    onClick={() => foldToolGroup(g.id, !g.fold)}
                  >
                    <Icon name={folded ? 'chevron-right' : 'chevron-down'} size={14} />
                  </button>
                </div>
              ) : !sideways && showNames && heading ? (
                <div className="ui-tool-head" aria-hidden="true" data-tool-head={g.id} onDoubleClick={() => askGroupRename(g.id)}>
                  {heading}
                </div>
              ) : null}
              {folded ? (
                (() => {
                  const id = frontOf(g);
                  const t = byId.get(id);
                  if (!t) return null;
                  const more = g.tools.length > 1;
                  return (
                    <button
                      type="button"
                      className={`ui-tool is-stack${more ? ' has-more' : ''}${off.has(id) ? ' is-off' : ''}${g.tools.includes(current) ? ' is-chosen' : ''}${drag?.mark?.kind === 'group' && drag.mark.group === g.id ? ' is-drop-group' : ''}`}
                      aria-label={more ? `${t.label}. ${groupName(g, groups)} group, ${g.tools.length} tools.` : t.label}
                      aria-pressed={g.tools.includes(current)}
                      aria-haspopup={more ? 'menu' : undefined}
                      aria-disabled={off.has(id) || undefined}
                      data-tip={`${t.label}, in ${groupName(g, groups)}`}
                      {...(off.has(id) ? { 'data-tip-desc': why(id) } : {})}
                      data-command={`tools.${id}`}
                      data-help={t.help}
                      data-tool-group={g.id}
                      onPointerDown={(e) => {
                        if (e.button !== 0 || !more) return;
                        const el = e.currentTarget;
                        held.current.fired = false;
                        window.clearTimeout(held.current.timer);
                        held.current.timer = window.setTimeout(() => {
                          held.current.fired = true;
                          setFly({ group: g.id, rect: el.getBoundingClientRect() });
                        }, 420);
                      }}
                      onPointerUp={() => window.clearTimeout(held.current.timer)}
                      onPointerLeave={() => window.clearTimeout(held.current.timer)}
                      onPointerCancel={() => window.clearTimeout(held.current.timer)}
                      onClick={(e) => {
                        // While the tools are being changed a press opens what can be done to the group.
                        if (editing && !held.current.fired) {
                          const at = menuPoint(e.currentTarget);
                          return openDockMenu(at.x, at.y, groupMenu(g.id, at, visible));
                        }
                        onPickGroup(g);
                      }}
                      onContextMenu={(e) => {
                        if (!more) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setFly({ group: g.id, rect: e.currentTarget.getBoundingClientRect() });
                      }}
                    >
                      <Icon name={t.icon} size={iconPx} />
                    </button>
                  );
                })()
              ) : (
                <div className={`ui-tool-group${drag?.mark?.kind === 'group' && drag.mark.group === g.id ? ' is-drop' : ''}`} role="group" aria-label={groupName(g, groups)} data-tool-group={g.id} data-tool-axis={axis}>
                  {g.tools.map((id) => {
                    const t = byId.get(id);
                    if (!t) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`ui-tool${current === id ? ' is-chosen' : ''}${off.has(id) ? ' is-off' : ''}${drag?.id === id ? ' is-lifted' : ''}${markOf(id)}`}
                        aria-label={t.label}
                        aria-pressed={current === id}
                        aria-disabled={off.has(id) || undefined}
                        {...(off.has(id) ? { 'data-tip': t.label, 'data-tip-desc': why(id) } : {})}
                        data-command={`tools.${id}`}
                        data-help={t.help}
                        data-tool-id={id}
                        onClick={(e) => {
                          // While the tools are being changed a press opens what can be done to the tool.
                          if (!editing) return choose(id);
                          const at = menuPoint(e.currentTarget);
                          openDockMenu(at.x, at.y, toolMenu(id, visible));
                        }}
                        onPointerDown={(e) => startToolDrag(e, id, () => groups, visible)}
                      >
                        <Icon name={t.icon} size={iconPx} />
                      </button>
                    );
                  })}
                </div>
              )}
            </Fragment>
          );
        })}
        {(drag || editing) && groups.length > 0 && <div className={`ui-tool-gap is-end${drag?.mark?.kind === 'gap' && drag.mark.at === groups.length ? ' is-drop' : ''}`} data-tool-gap={groups.length} aria-hidden="true" data-tip={editing ? 'A new group goes here' : undefined} data-tip-desc={editing ? 'Drag a tool onto the +.' : undefined} />}
      </div>
      {!editing && awayList.length > 0 && (
        <button
          type="button"
          className="ui-tools-away"
          aria-label={`${awayList.length} ${awayList.length === 1 ? 'tool' : 'tools'} put away. Press to bring them back.`}
          data-tip={`${awayList.length} put away`}
          data-tip-desc="Press to see them and bring any back."
          data-help="tool-builder"
          onClick={() => setToolbarEditing(true)}
        >
          <Icon name="eye-off" size={14} />
          <span>{awayList.length}</span>
        </button>
      )}
      {!tools.length && <span className="ui-tools-empty" aria-hidden="true"><Icon name="brush" size={20} /></span>}
      {fly && flyGroup && (
        <Flyout
          group={flyGroup}
          groups={groups}
          anchor={fly.rect}
          place={place}
          visible={visible}
          off={off}
          why={why}
          current={current}
          onPick={(id) => {
            setFly(null);
            choose(id);
            refocus(id);
          }}
          onClose={() => setFly(null)}
        />
      )}
      {editing && <ToolbarBuilder anchor={railRect} place={place} away={awayList} visible={visible} />}
      {drag && ghost && createPortal(<div className="ui-tool-ghost" style={{ left: drag.x, top: drag.y }}><Icon name={ghost.icon} size={iconPx} /></div>, document.body)}
    </nav>
  );
}
