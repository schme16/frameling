import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { store, useStore } from '../core/store';
import { resolveMenus, type MenuItem } from './menus';
import { commandEnabled, runCommand } from './palette';
import { Icon } from './icons';
import { Keys } from './ShortcutChip';
import { effectiveKeys } from './keys';

export function MenuBar() {
  const [open, setOpen] = useState<number | null>(null);
  // The open submenu (by label), inside the open menu.
  const [sub, setSub] = useState<string | null>(null);
  useEffect(() => setSub(null), [open]);
  // While a menu is open, re-read on every change so ticks and greyed items stay true. While closed, don't
  // re-render at all (the playhead moving would otherwise redraw the menu bar every frame).
  useStore((s) => (open === null ? null : s));
  const menus = resolveMenus();
  const bar = useRef<HTMLElement>(null);

  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);

  const focusItem = (menu: number, which: 'first' | 'last' | number) => {
    requestAnimationFrame(() => {
      const items = [...(bar.current?.querySelectorAll<HTMLElement>(topItems(menu)) ?? [])];
      (which === 'first' ? items[0] : which === 'last' ? items[items.length - 1] : items[which])?.focus();
    });
  };

  const onBarKey = (e: React.KeyboardEvent, index: number) => {
    const n = menus.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
      const wasOpen = open !== null;
      if (wasOpen) setOpen(next);
      bar.current?.querySelectorAll<HTMLElement>('[data-top]')[next]?.focus();
      if (wasOpen) focusItem(next, 'first');
    } else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(index);
      focusItem(index, 'first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(index);
      focusItem(index, 'last');
    } else if (e.key === 'Escape') setOpen(null);
  };

  const onItemKey = (e: React.KeyboardEvent<HTMLElement>, index: number) => {
    const list = [...(bar.current?.querySelectorAll<HTMLElement>(topItems(index)) ?? [])];
    const at = list.indexOf(e.currentTarget);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(at + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(at - 1 + list.length) % list.length]?.focus();
    } else if (jumpKey(e.key)) {
      e.preventDefault();
      list[jumpTo(e.key, at, list.length)]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(null);
      bar.current?.querySelectorAll<HTMLElement>('[data-top]')[index]?.focus();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length;
      setOpen(next);
      bar.current?.querySelectorAll<HTMLElement>('[data-top]')[next]?.focus();
      focusItem(next, 'first');
    } else if (e.key === 'Tab') setOpen(null);
  };

  const subItems = () => [...(bar.current?.querySelectorAll<HTMLElement>('.ui-submenu [role^="menuitem"]:not([aria-disabled="true"])') ?? [])];
  const onSubKey = (e: React.KeyboardEvent<HTMLElement>, menu: number) => {
    const list = subItems();
    const at = list.indexOf(e.currentTarget);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    } else if (jumpKey(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      list[jumpTo(e.key, at, list.length)]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const label = sub;
      setSub(null);
      bar.current?.querySelector<HTMLElement>(`[data-menu="${menu}"] [data-sub="${label}"]`)?.focus();
    } else if (e.key === 'Tab') setOpen(null);
  };

  const row = (it: MenuItem, i: number, menu: number, inSub = false): React.ReactNode => {
    if (it.kind === 'separator') return <div key={`s${i}`} className="ui-menu-sep" role="separator" />;
    if (it.kind === 'heading') return <div key={`h${i}`} className="ui-menu-heading" role="presentation">{it.label}</div>;
    if (it.kind === 'submenu') {
      const shown = sub === it.label;
      return (
        <div key={`sub-${it.label}`} className="ui-menu-subwrap" onMouseEnter={() => setSub(it.label)} onMouseLeave={() => setSub(null)}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={shown}
            data-sub={it.label}
            className={`ui-menu-item${shown ? ' is-open' : ''}`}
            onClick={() => setSub(shown ? null : it.label)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setSub(it.label);
                requestAnimationFrame(() => subItems()[0]?.focus());
              } else onItemKey(e, menu);
            }}
          >
            <span className="ui-menu-tick" />
            <span className="ui-menu-label">{it.label}</span>
            <Icon name="chevron-right" size={14} />
          </button>
          {shown && (
            <SubmenuBox label={it.label}>{it.items.map((x, j) => row(x, j, menu, true))}</SubmenuBox>
          )}
        </div>
      );
    }
    const c = it.command;
    const enabled = commandEnabled(c);
    const checked = c.checked ? safe(() => c.checked!(store().get())) : undefined;
    const role = c.checked ? 'menuitemcheckbox' : 'menuitem';
    return (
      <button
        key={c.id}
        type="button"
        role={role}
        aria-checked={c.checked ? !!checked : undefined}
        aria-disabled={!enabled || undefined}
        className={`ui-menu-item${enabled ? '' : ' is-disabled'}`}
        data-command={c.id}
        onKeyDown={(e) => (inSub ? onSubKey(e, menu) : onItemKey(e, menu))}
        onClick={() => {
          if (!enabled) return;
          setOpen(null);
          runCommand(c);
        }}
      >
        <span className="ui-menu-tick">{checked && <Icon name="check" size={14} />}</span>
        <span className="ui-menu-label">{c.label}</span>
        {effectiveKeys(c)[0] && <Keys shortcut={effectiveKeys(c)[0]} className="ui-keys-menu" />}
      </button>
    );
  };

  return (
    <nav className="ui-menubar" role="menubar" aria-label="Menus" ref={bar} data-help="menus">
      {menus.map(({ menu, items }, index) => (
        <div key={menu.label} className="ui-menu-wrap">
          <button
            type="button"
            role="menuitem"
            data-top
            data-quest={`menu-${menu.label.toLowerCase()}`}
            aria-haspopup="menu"
            aria-expanded={open === index}
            className={`ui-menu-top${open === index ? ' is-open' : ''}`}
            onClick={() => setOpen(open === index ? null : index)}
            onMouseEnter={() => open !== null && setOpen(index)}
            onKeyDown={(e) => onBarKey(e, index)}
          >
            {menu.label}
          </button>
          {open === index && (
            <div className="ui-menu" role="menu" aria-label={menu.label} data-menu={index}>
              {items.map((it, i) => row(it, i, index))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

const PAGE = 8;
const jumpKey = (k: string): boolean => k === 'Home' || k === 'End' || k === 'PageUp' || k === 'PageDown';
/** Where Home, End, PageUp and PageDown land in a list of `n` items from item `at`. */
export function jumpTo(key: string, at: number, n: number): number {
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return Math.max(0, Math.min(n - 1, at + (key === 'PageDown' ? PAGE : -PAGE)));
}

/**
 * A submenu opens beside its row. It is fixed to the window (so the menu it belongs to can scroll without clipping it),
 * kept inside the window, and scrolls itself when it is taller than the window.
 */
function SubmenuBox({ label, children }: { label: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const row = el?.parentElement?.getBoundingClientRect();
    if (!el || !row) return;
    const gap = 8;
    el.style.maxHeight = `${window.innerHeight - gap * 2}px`;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = row.right + 2 + w <= window.innerWidth - gap ? row.right + 2 : Math.max(gap, row.left - w - 2);
    el.style.left = `${left}px`;
    el.style.top = `${Math.max(gap, Math.min(row.top - 7, window.innerHeight - gap - h))}px`;
  }, []);
  return (
    <div ref={box} className="ui-menu ui-submenu" role="menu" aria-label={label}>
      {children}
    </div>
  );
}

// The menu's own items, not the ones in an open submenu.
const topItems = (menu: number) =>
  `[data-menu="${menu}"] > [role^="menuitem"]:not([aria-disabled="true"]), [data-menu="${menu}"] > .ui-menu-subwrap > [role^="menuitem"]`;

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
