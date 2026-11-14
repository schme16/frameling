// The workspace switcher beside the document name: which workspace you are in, and a press to change it. Three or more
// small tabs (or one chip with the name on a narrow window, or by choice), with your own workspaces alongside the ones
// that come with the app, and a More list when there are too many for tabs.
import { useEffect, useRef, useState } from 'react';
import { getCommand } from '../core/registry';
import { applyWorkspace, dock, listWorkspaces } from './dock';
import type { Workspace } from './dockModel';
import { Icon } from './icons';
import { effectiveKeys, shortcutLabel } from './keys';
import { Keys } from './ShortcutChip';
import { runCommand } from './palette';
import { usePopover } from './popover';
import { usePrefs } from './prefs';
import { chipName, switcherSlots } from './switcherModel';

/** Narrower than this, the tabs make way for the chip so the menus and the name still fit. */
const NARROW = '(max-width: 1399px)';

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(NARROW).matches);
  useEffect(() => {
    const m = window.matchMedia?.(NARROW);
    if (!m) return;
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

const commandOf = (w: Workspace) => getCommand(`view.workspace.${w.id}`);
/** The first key a workspace has (yours get none unless you give one), as the menus would show it. */
const keyOf = (w: Workspace): string | undefined => {
  const c = commandOf(w);
  return c ? effectiveKeys(c)[0] : undefined;
};
const tipFor = (w: Workspace): string => {
  const c = commandOf(w);
  const key = c && effectiveKeys(c)[0] ? ` (${shortcutLabel(c)})` : '';
  return `${w.name}: ${w.about ?? 'Your saved panel layout.'}${key}`;
};

function List({ items, currentId, onClose, at }: { items: Workspace[]; currentId: string; onClose: () => void; at: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  usePopover(ref, onClose);
  // The keyboard starts on the workspace you are in, not the top of the list.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-checked=true]')?.focus();
  }, []);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || at?.contains(t)) return;
      onClose();
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [onClose, at]);
  const box = at?.getBoundingClientRect();
  // The switcher sits at the right of the bar, so the list hangs from its right edge and never runs off the window.
  const style: React.CSSProperties = box ? { top: box.bottom + 4, right: Math.max(8, window.innerWidth - box.right) } : {};
  const move = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const rows = [...(ref.current?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [])];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    rows[(i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
  };
  const run = (id: string) => {
    onClose();
    const c = getCommand(id);
    if (c) runCommand(c);
  };
  return (
    <div className="ui-menu ws-list" role="menu" aria-label="Workspaces" ref={ref} style={style} onKeyDown={move}>
      {items.map((w) => {
        const key = keyOf(w);
        return (
          <button
            key={w.id}
            type="button"
            role="menuitemradio"
            aria-checked={w.id === currentId}
            className="ui-menu-item"
            data-workspace={w.id}
            data-tip={w.about}
            onClick={() => {
              onClose();
              applyWorkspace(w.id);
            }}
          >
            <span className="ui-menu-tick">{w.id === currentId && <Icon name="check" size={14} />}</span>
            <span className="ui-menu-label">{w.name}</span>
            {key && <Keys shortcut={key} className="ui-keys-menu" />}
          </button>
        );
      })}
      <div className="ui-menu-sep" role="separator" />
      <button type="button" role="menuitem" className="ui-menu-item" data-command="view.saveWorkspace" onClick={() => run('view.saveWorkspace')}>
        <span className="ui-menu-tick" />
        <span className="ui-menu-label">{getCommand('view.saveWorkspace')?.label ?? 'Save layout as a workspace...'}</span>
      </button>
      <button type="button" role="menuitem" className="ui-menu-item" data-command="view.manageWorkspaces" onClick={() => run('view.manageWorkspaces')}>
        <span className="ui-menu-tick" />
        <span className="ui-menu-label">{getCommand('view.manageWorkspaces')?.label ?? 'Manage workspaces...'}</span>
      </button>
    </div>
  );
}

export function WorkspaceSwitcher() {
  const look = usePrefs((p) => p.workspaceSwitcher);
  const currentId = dock.use((d) => d.workspaceId);
  // The list changes when you save, delete or import one.
  const user = dock.use((d) => d.user);
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  if (look === 'off') return null;

  const all = listWorkspaces();
  void user;
  const asChip = look === 'chip' || narrow;
  const close = () => setOpen(false);

  if (asChip) {
    return (
      <div className="ws-switch" data-help="workspace-switcher">
        <button
          ref={opener}
          type="button"
          className={`ws-chip${open ? ' is-open' : ''}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Workspace: ${chipName(all, currentId)}. Change it.`}
          data-tip="Change workspace: the layout of tools and panels"
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="workspace" size={14} />
          <span className="ws-chip-name">{chipName(all, currentId)}</span>
          <Icon name="chevron-down" size={12} />
        </button>
        {open && <List items={all} currentId={currentId} onClose={close} at={opener.current} />}
      </div>
    );
  }

  const { tabs, more } = switcherSlots(all, currentId);
  return (
    <div className="ws-switch" data-help="workspace-switcher">
      <div className="ws-tabs" role="group" aria-label="Workspace">
        {tabs.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`ws-tab${w.id === currentId ? ' is-on' : ''}`}
            aria-pressed={w.id === currentId}
            data-workspace={w.id}
            data-tip={tipFor(w)}
            onClick={() => applyWorkspace(w.id)}
          >
            {w.name}
          </button>
        ))}
        <button
          ref={opener}
          type="button"
          className={`ws-tab ws-more${open ? ' is-open' : ''}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={more.length ? 'More workspaces' : 'All workspaces'}
          data-tip={more.length ? 'More workspaces, and your own layouts' : 'All your workspaces, and saving a new one'}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="chevron-down" size={13} />
        </button>
      </div>
      {open && <List items={all} currentId={currentId} onClose={close} at={opener.current} />}
    </div>
  );
}
