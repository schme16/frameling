import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { allTools, getTool } from '../core/registry';
import { findLayer } from '../core/doc';
import type { LayerKind } from '../core/format';
import { store, useStore } from '../core/store';
import { syncDynamicCommands } from './dynamic';
import { pickTool } from '../tools/pick';
import { Icon } from './icons';
import { currentWorkspace, dock, railOf, stripTools } from './dock';
import { startToolsDrag, nudgeTools } from './dockDrag';
import { menuPoint, openDockMenu, toolsMenu } from './dockMenus';
import type { DockZone } from './dockModel';
import { useFeaturesVersion } from '../features/use';
import { usePrefs } from './prefs';
import { usePopover } from './popover';
import { groupName, resolveGroups, visibleGroups, type ToolGroup } from './toolArrange';
import { askGroupRename, currentGroups, flyRequest, frontTools, groupMenu, railNote, startToolDrag, stepTool, toolDrag, toolMenu } from './toolRail';

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
function Flyout({ group, groups, anchor, place, visible, current, onPick, onClose }: { group: ToolGroup; groups: ToolGroup[]; anchor: DOMRect; place: DockZone | 'float'; visible: (id: string) => boolean; current: string; onPick: (id: string) => void; onClose: () => void }) {
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
      <div className="ui-tool-fly-head" role="presentation">
        <span className="ui-tool-fly-name" onDoubleClick={rename}>
          {groupName(group, groups)}
        </span>
        <button type="button" role="menuitem" className="ui-icon-btn ui-tool-fly-rename" aria-label={`Rename ${groupName(group, groups)}`} data-tip="Rename this group" data-tip-desc="Give the group a name of your own." data-help="tool-strip" onClick={rename}>
          <Icon name="pencil" size={13} />
        </button>
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
            className={`ui-tool-fly-item${current === id ? ' is-chosen' : ''}`}
            data-tool-id={id}
            data-command={`tools.${id}`}
            onClick={() => onPick(id)}
            onPointerDown={(e) => startToolDrag(e, id, () => visibleGroups(currentGroups(), visible), visible, onClose)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openDockMenu(e.clientX, e.clientY, toolMenu(id, visible));
            }}
          >
            <Icon name={t.icon} size={18} />
            <span>{t.label}</span>
          </button>
        );
      })}
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
  const kind = useActiveKind();
  const current = useStore((s) => s.ui.tool);
  // The workspace can narrow the strip (the Pixel workspace shows only pixel art tools on pixel layers).
  const wsId = dock.use((d) => d.workspaceId);
  const usable = allTools().filter((t) => !kind || t.layers.includes(kind));
  const tools = stripTools(usable, kind, wsId ? currentWorkspace() : undefined);
  const ids = tools.map((t) => t.id).join(',');
  const saved = dock.use((d) => railOf(d));
  // Each tool with where it asked to start in the rail, as text so the memo below only reruns when that changes.
  const allKey = allTools().map((t) => `${t.id}|${t.group ?? ''}|${t.groupAt ?? ''}`).join(',');
  const shown = useMemo(() => new Set(ids ? ids.split(',') : []), [ids]);
  const visible = (id: string) => shown.has(id);
  const groups = useMemo(
    () =>
      visibleGroups(
        resolveGroups(
          saved,
          allKey.split(',').filter(Boolean).map((k) => {
            const [id, group, at] = k.split('|');
            return { id, group: group || undefined, groupAt: at === '' ? undefined : Number(at) };
          }),
        ),
        (id) => shown.has(id),
      ),
    [saved, allKey, shown],
  );
  const drag = toolDrag.use((d) => d);
  const note = railNote.use((n) => n);
  const front = frontTools.use((f) => f);
  const navRef = useRef<HTMLElement>(null);
  const [fly, setFly] = useState<{ group: string; rect: DOMRect } | null>(null);
  const held = useRef<{ timer: number; fired: boolean }>({ timer: 0, fired: false });
  const byId = new Map(tools.map((t) => [t.id, t]));
  const axis = sideways ? 'y' : 'x';

  // The picked tool doesn't work on this kind of layer: move to the first one that does. A tool the workspace only
  // leaves out of the strip still works (picked by its key, say), so it's left alone.
  useEffect(() => {
    if (tools.length && getTool(current) && !usable.some((t) => t.id === current)) store().setUi({ tool: tools[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, ids]);

  // Whatever tool is used from a group is the one its stacked button shows.
  useEffect(() => {
    const g = groups.find((x) => x.tools.includes(current));
    if (g && frontTools.get()[g.id] !== current) frontTools.set((f) => ({ ...f, [g.id]: current }));
  }, [current, groups]);
  useEffect(() => {
    if (!stacked) setFly(null);
  }, [stacked]);
  // Something outside (a quest) asked for a group's flyout.
  const asked = flyRequest.use((r) => r);
  useEffect(() => {
    if (!asked) return;
    flyRequest.set(null);
    const btn = navRef.current?.querySelector<HTMLElement>(`.ui-tool.is-stack[data-tool-group="${asked}"]`);
    if (stacked && btn) setFly({ group: asked, rect: btn.getBoundingClientRect() });
  }, [asked, stacked]);

  const frontOf = (g: ToolGroup): string => {
    if (g.tools.includes(current)) return current;
    const f = front[g.id];
    return f && g.tools.includes(f) ? f : g.tools[0];
  };

  const refocus = (id: string) =>
    requestAnimationFrame(() => navRef.current?.querySelector<HTMLElement>(`[data-tool-id="${id}"]`)?.focus());

  const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
    const active = document.activeElement as HTMLElement | null;
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const at = menuPoint(active ?? e.currentTarget);
      const gid = active?.dataset.toolGroup;
      if (stacked && gid && active) return setFly({ group: gid, rect: active.getBoundingClientRect() });
      const id = active?.dataset.toolId;
      return openDockMenu(at.x, at.y, id ? [...toolMenu(id, visible), { separator: true }, ...toolsMenu()] : toolsMenu());
    }
    if (!e.key.startsWith('Arrow')) return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button.ui-tool')];
    if (!active || !buttons.includes(active as HTMLButtonElement)) return;
    if (e.altKey) {
      // Alt and an arrow moves the tool along the rail: a step on the short way, a row on the long way.
      const id = active.dataset.toolId;
      if (!id || stacked) return;
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
    pickTool(frontOf(g));
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
      className={`ui-tools${sideways ? ' is-sideways' : ''}${place === 'float' ? ' is-floating' : ''}${stacked ? ' is-stacked' : ' is-two'}${drag ? ' is-arranging' : ''}`}
      aria-label="Tools"
      aria-describedby="tool-rail-hint"
      data-help="tool-strip"
      onKeyDown={onKey}
      onContextMenu={(e) => {
        e.preventDefault();
        const id = (e.target as HTMLElement).closest<HTMLElement>('[data-tool-id]')?.dataset.toolId;
        const gid = (e.target as HTMLElement).closest<HTMLElement>('[data-tool-group]')?.dataset.toolGroup;
        openDockMenu(e.clientX, e.clientY, id ? [...toolMenu(id, visible), { separator: true }, ...toolsMenu()] : gid ? [...groupMenu(gid, { x: e.clientX, y: e.clientY }), { separator: true }, ...toolsMenu()] : toolsMenu());
      }}
    >
      <span id="tool-rail-hint" className="ui-sr-only">
        {stacked ? 'Press and hold a group, or open its menu, to pick another tool from it.' : 'Hold Alt and press an arrow key to move the focused tool.'}
      </span>
      <span className="ui-sr-only" role="status" aria-live="polite">
        {note}
      </span>
      {grip}
      <div className="ui-tool-groups">
        {groups.map((g, gi) => (
          <Fragment key={g.id}>
            {gi > 0 && (
              <div
                className={`ui-tool-gap${drag?.mark?.kind === 'gap' && drag.mark.at === gi ? ' is-drop' : ''}`}
                data-tool-gap={gi}
                aria-hidden="true"
                data-tip={groupName(g, groups)}
                data-tip-desc="Double-click to rename this group. Right-click for more."
                data-help="tool-strip"
                onDoubleClick={() => askGroupRename(g.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openDockMenu(e.clientX, e.clientY, [...groupMenu(g.id, { x: e.clientX, y: e.clientY }), { separator: true }, ...toolsMenu()]);
                }}
              />
            )}
            {stacked ? (
              (() => {
                const id = frontOf(g);
                const t = byId.get(id);
                if (!t) return null;
                const more = g.tools.length > 1;
                return (
                  <button
                    type="button"
                    className={`ui-tool is-stack${more ? ' has-more' : ''}${g.tools.includes(current) ? ' is-chosen' : ''}${drag?.mark?.kind === 'group' && drag.mark.group === g.id ? ' is-drop-group' : ''}`}
                    aria-label={more ? `${t.label}. ${groupName(g, groups)} group, ${g.tools.length} tools.` : t.label}
                    aria-pressed={g.tools.includes(current)}
                    aria-haspopup={more ? 'menu' : undefined}
                    data-tip={`${t.label}, in ${groupName(g, groups)}`}
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
                    onClick={() => onPickGroup(g)}
                    onContextMenu={(e) => {
                      if (!more) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setFly({ group: g.id, rect: e.currentTarget.getBoundingClientRect() });
                    }}
                  >
                    <Icon name={t.icon} size={20} />
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
                      className={`ui-tool${current === id ? ' is-chosen' : ''}${drag?.id === id ? ' is-lifted' : ''}${markOf(id)}`}
                      aria-label={t.label}
                      aria-pressed={current === id}
                      data-command={`tools.${id}`}
                      data-help={t.help}
                      data-tool-id={id}
                      onClick={() => pickTool(id)}
                      onPointerDown={(e) => startToolDrag(e, id, () => groups, visible)}
                    >
                      <Icon name={t.icon} size={20} />
                    </button>
                  );
                })}
              </div>
            )}
          </Fragment>
        ))}
        {drag && groups.length > 0 && <div className={`ui-tool-gap is-end${drag.mark?.kind === 'gap' && drag.mark.at === groups.length ? ' is-drop' : ''}`} data-tool-gap={groups.length} aria-hidden="true" />}
      </div>
      {!tools.length && <span className="ui-tools-empty" aria-hidden="true"><Icon name="brush" size={20} /></span>}
      {fly && flyGroup && (
        <Flyout
          group={flyGroup}
          groups={groups}
          anchor={fly.rect}
          place={place}
          visible={visible}
          current={current}
          onPick={(id) => {
            setFly(null);
            pickTool(id);
            refocus(id);
          }}
          onClose={() => setFly(null)}
        />
      )}
      {drag && ghost && createPortal(<div className="ui-tool-ghost" style={{ left: drag.x, top: drag.y }}><Icon name={ghost.icon} size={20} /></div>, document.body)}
    </nav>
  );
}
