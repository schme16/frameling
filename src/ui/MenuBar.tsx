import { useEffect, useRef, useState } from 'react';
import { store, useStore } from '../core/store';
import { resolveMenus, type MenuItem } from './menus';
import { commandEnabled, runCommand } from './palette';
import { Icon } from './icons';
import { Keys } from './ShortcutChip';
import { effectiveKeys } from './keys';

export function MenuBar() {
  const [open, setOpen] = useState<number | null>(null);
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
      const items = [...(bar.current?.querySelectorAll<HTMLElement>(`[data-menu="${menu}"] [role^="menuitem"]:not([aria-disabled="true"])`) ?? [])];
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
    const list = [...(bar.current?.querySelectorAll<HTMLElement>(`[data-menu="${index}"] [role^="menuitem"]:not([aria-disabled="true"])`) ?? [])];
    const at = list.indexOf(e.currentTarget);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(at + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(at - 1 + list.length) % list.length]?.focus();
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

  const row = (it: MenuItem, i: number, menu: number) => {
    if (it.kind === 'separator') return <div key={`s${i}`} className="ui-menu-sep" role="separator" />;
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
        onKeyDown={(e) => onItemKey(e, menu)}
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

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
