// The dock's things that sit over everything: the drop bands and the label that follow a drag, the right-click menu
// and the little name box. One of these is mounted by the app shell.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getPanel } from '../core/registry';
import { dock, panelTitle, renameFloat, renamePanel } from './dock';
import { dragState, dropNote, railGeometry, type DragState } from './dockDrag';
import { railBands } from './railDrop';
import { closeDockMenu, dockMenu, renaming } from './dockMenus';
import { currentGroups, renameToolGroup } from './toolRail';
import { groupName } from './toolArrange';
import { installPanelFocus } from './dockShared';
import { ZONES, type DockZone } from './dockModel';
import { Icon } from './icons';

export function DockOverlays() {
  useEffect(() => installPanelFocus(), []);
  return (
    <>
      <DragLayer />
      <DockMenuView />
      <RenameBox />
    </>
  );
}

const BAND = 56;

/** While something is being dragged: a band along each edge of the canvas to dock on, a ghost of the window a drop would make, and a label. */
function DragLayer() {
  const d = dragState.use((v) => v);
  if (!d) return null;
  if (d.kind === 'tools' && d.rail) return <RailDragLayer d={d} />;
  const stage = document.querySelector('.ui-canvas')?.getBoundingClientRect();
  const over: DockZone | null = d.kind === 'tools' ? (d.toolsAt && d.toolsAt !== 'float' ? d.toolsAt : null) : d.target && 'zone' in d.target ? d.target.zone : null;
  const verb = d.kind === 'tools' ? 'Tools' : 'Dock';
  const band = (z: DockZone, style: React.CSSProperties, label: string) => (
    <div key={z} className={`dock-edge dock-edge-${z}${over === z ? ' is-over' : ''}`} data-dock-edge={z} style={style}>
      <span>{label}</span>
    </div>
  );
  const t = d.target;
  return (
    <>
      {stage && (
        <>
          {band('left', { left: stage.left, top: stage.top, width: BAND, height: stage.height }, `${verb} left`)}
          {band('right', { left: stage.right - BAND, top: stage.top, width: BAND, height: stage.height }, `${verb} right`)}
          {band('top', { left: stage.left + BAND, top: stage.top, width: Math.max(0, stage.width - BAND * 2), height: BAND - 8 }, `${verb} at the top`)}
          {band('bottom', { left: stage.left + BAND, top: stage.bottom - (BAND - 8), width: Math.max(0, stage.width - BAND * 2), height: BAND - 8 }, `${verb} at the bottom`)}
        </>
      )}
      {d.kind === 'panel' && t && 'newFloat' in t && <div className="dock-ghost" style={{ left: t.newFloat.x, top: t.newFloat.y }} />}
      <Chip d={d} />
    </>
  );
}

const SIDE_LABEL: Record<DockZone, string> = { left: 'the left', right: 'the right', top: 'the top', bottom: 'the bottom' };

/** While the tool rail is carried: a band along each outer edge of the work area, an outline round the canvas to float on, and a label. */
function RailDragLayer({ d }: { d: DragState }) {
  const g = railGeometry();
  const rail = d.rail!;
  const bands = g ? railBands(g) : null;
  const over = rail.drop && 'dock' in rail.drop ? rail.drop.dock : null;
  const floating = !!rail.drop && 'float' in rail.drop;
  return (
    <>
      {g && (
        <div className={`dock-float-zone${floating ? ' is-over' : ''}`} style={{ left: g.canvas.left, top: g.canvas.top, width: g.canvas.right - g.canvas.left, height: g.canvas.bottom - g.canvas.top }} aria-hidden="true" />
      )}
      {bands &&
        ZONES.map((z) => (
          <div
            key={z}
            className={`dock-edge dock-edge-${z}${over === z ? ' is-over' : ''}${rail.home === z ? ' is-home' : ''}`}
            data-dock-edge={z}
            style={{ left: bands[z].left, top: bands[z].top, width: bands[z].right - bands[z].left, height: bands[z].bottom - bands[z].top }}
          >
            <span>{rail.home === z ? `Back on ${SIDE_LABEL[z]}, as it was` : `Dock on ${SIDE_LABEL[z]}`}</span>
          </div>
        ))}
      <Chip d={d} />
    </>
  );
}

function Chip({ d }: { d: DragState }) {
  const note = dropNote(d);
  return (
    <div className="dock-chip" style={{ left: d.x + 14, top: d.y + 14 }} aria-hidden="true">
      <Icon name="grip" size={12} />
      <strong>{d.label}</strong>
      {note && <span>{note}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- the menu

function DockMenuView() {
  const m = dockMenu.use((v) => v);
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x: 0, y: 0 });
  useEscape(!!m, closeDockMenu);
  // Focus goes to the first item when it opens, and back to where it was when it shuts.
  useEffect(() => {
    if (!m) return;
    const before = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus());
    return () => {
      cancelAnimationFrame(raf);
      const now = document.activeElement;
      if (before && document.contains(before) && (!now || now === document.body || ref.current?.contains(now) || !document.contains(now))) before.focus();
    };
  }, [m]);
  useLayoutEffect(() => {
    if (!m) return;
    const r = ref.current?.getBoundingClientRect();
    setAt({ x: Math.max(6, Math.min(m.x, window.innerWidth - (r?.width ?? 240) - 6)), y: Math.max(6, Math.min(m.y, window.innerHeight - (r?.height ?? 200) - 6)) });
  }, [m]);
  useEffect(() => {
    if (!m) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeDockMenu();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('blur', closeDockMenu);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('blur', closeDockMenu);
    };
  }, [m]);
  if (!m) return null;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return (
    <div className="ui-menu ui-dock-menu" role="menu" ref={ref} style={{ left: at.x, top: at.y }} onKeyDown={onKey} onContextMenu={(e) => e.preventDefault()}>
      {m.items.map((it, i) => {
        if ('separator' in it) return <div key={i} className="ui-menu-sep" role="separator" />;
        if ('heading' in it)
          return (
            <div key={i} className="ui-dock-menu-head" role="presentation">
              {it.heading}
            </div>
          );
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`ui-menu-item${it.disabled ? ' is-disabled' : ''}${it.danger ? ' is-danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              closeDockMenu();
              it.onClick();
            }}
          >
            <span className="ui-menu-tick">{it.checked && <Icon name="check" size={13} />}</span>
            <span className="ui-menu-label">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- the name box

/** The name a tool group has without one of its own (so typing that back clears the custom name). */
function usualGroupName(id: string): string {
  const groups = currentGroups();
  const g = groups.find((x) => x.id === id);
  return g ? groupName({ ...g, name: undefined }, groups) : '';
}

function RenameBox() {
  const r = renaming.use((v) => v);
  const l = dock.use((d) => d.layout);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLFormElement>(null);
  const kind = r?.kind;
  const id = r?.id;
  useEffect(() => {
    if (!kind || !id) return;
    const cur = dock.get().layout;
    if (kind === 'group') {
      const groups = currentGroups();
      const g = groups.find((x) => x.id === id);
      setDraft(g ? groupName(g, groups) : '');
    } else setDraft(kind === 'panel' ? panelTitle(id, cur) : (cur.floats.find((f) => f.id === id)?.name ?? ''));
  }, [kind, id]);
  const close = () => renaming.set(null);
  useEscape(!!r, close);
  useEffect(() => {
    if (!r) return;
    const before = document.activeElement as HTMLElement | null;
    return () => {
      const now = document.activeElement;
      if (before && document.contains(before) && (!now || now === document.body || !document.contains(now))) before.focus();
    };
  }, [r]);
  useEffect(() => {
    if (!r) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [r]);
  if (!r) return null;
  const exists = r.kind === 'panel' ? true : r.kind === 'group' ? currentGroups().some((g) => g.id === r.id) : l.floats.some((f) => f.id === r.id);
  if (!exists) return null;
  const commit = () => {
    if (r.kind === 'group') renameToolGroup(r.id, draft.trim() === usualGroupName(r.id) ? '' : draft);
    else if (r.kind === 'panel') renamePanel(r.id, draft.trim() === panelTitleOriginal(r.id) ? '' : draft);
    else renameFloat(r.id, draft);
    close();
  };
  return (
    <form
      className="ui-dock-rename"
      ref={ref}
      style={{ left: Math.max(6, Math.min(r.x, window.innerWidth - 270)), top: Math.max(6, Math.min(r.y, window.innerHeight - 90)) }}
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <label>
        <span>{r.kind === 'panel' ? 'Name this panel' : r.kind === 'group' ? 'Name this group of tools' : 'Name this window'}</span>
        <input type="text" autoFocus value={draft} maxLength={40} placeholder={r.kind === 'panel' ? '' : r.kind === 'group' ? 'Group name' : 'Named after its front panel'} onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.target.select()} />
      </label>
      <div className="ui-dock-rename-row">
        <button type="submit" className="ui-btn ui-btn-primary ui-btn-small">
          Save
        </button>
        <button type="button" className="ui-btn ui-btn-small" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const panelTitleOriginal = (id: string): string => getPanel(id)?.title ?? id;

/** Escape closes a popup that is open, without also reaching the canvas (where it would deselect). */
function useEscape(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [open, close]);
}
