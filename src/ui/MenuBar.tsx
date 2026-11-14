import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { store, useStore } from '../core/store';
import { menuTitle, resolveMenus, type MenuItem } from './menus';
import { useMenuEdits } from './menuState';
import { commandEnabled, runCommand } from './palette';
import { Icon } from './icons';
import { Keys } from './ShortcutChip';
import { effectiveKeys } from './keys';
import { headingTo, HOVER_GRACE, HOVER_STEP, type Box, type Pt } from './hoverIntent';
import { menusThatFit } from './menuFold';

export function MenuBar() {
  const [open, setOpen] = useState<number | null>(null);
  // The open submenu (by label), inside the open menu.
  const [sub, setSub] = useState<string | null>(null);
  useEffect(() => setSub(null), [open]);
  // While a menu is open, re-read on every change so ticks and greyed items stay true. While closed, don't
  // re-render at all (the playhead moving would otherwise redraw the menu bar every frame).
  useStore((s) => (open === null ? null : s));
  // New menu changes, or another workspace (which has its own), redraw the bar even while no menu is open.
  useMenuEdits((e) => e);
  const menus = resolveMenus();
  const bar = useRef<HTMLElement>(null);
  // Menus that don't fit beside the rest of the top bar fold into a More menu at the end (see menuFold.ts).
  const [shown, setShown] = useState(Infinity);
  const [moreOpen, setMoreOpen] = useState(false);
  const folded = Math.min(shown, menus.length) < menus.length;
  const firstFolded = Math.min(shown, menus.length);
  useLayoutEffect(() => {
    const el = bar.current;
    const top = el?.parentElement;
    if (!el || !top) return;
    const fit = () => {
      const wraps = [...el.querySelectorAll<HTMLElement>(':scope > .ui-menu-wrap:not(.ui-menu-more)')];
      const widths = wraps.map((w) => w.offsetWidth);
      const more = el.querySelector<HTMLElement>(':scope > .ui-menu-more');
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      // The room the bar has: the top bar's width less everything else on it (the logo, the name, the workspace tabs and the buttons).
      const cs = getComputedStyle(top);
      let others = 0;
      let count = 0;
      for (const c of top.children) {
        count++;
        if (c === el) continue;
        others += c.classList.contains('ui-topbar-mid') ? Math.min(NAME_ROOM, (c as HTMLElement).offsetWidth) : (c as HTMLElement).offsetWidth;
      }
      const room = top.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - others - (parseFloat(cs.columnGap) || 0) * (count - 1) - (parseFloat(getComputedStyle(el).marginLeft) || 0);
      setShown(menusThatFit(widths, room, more?.offsetWidth || MORE_WIDTH, gap));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(top);
    for (const c of top.children) if (c !== el) ro.observe(c);
    return () => ro.disconnect();
  }, [menus.length]);
  useEffect(() => {
    if (!folded) setMoreOpen(false);
  }, [folded]);
  // Where the pointer was and is, the open submenu's box, and the change we are holding back while the pointer is
  // still on its way to that box. Moving diagonally into a submenu crosses the rows below it; without this, each of
  // those rows would close the submenu out from under you.
  const trail = useRef<{ prev: Pt | null; now: Pt | null }>({ prev: null, now: null });
  const subBox = useRef<Box | null>(null);
  const pend = useRef<{ timer: number; until: number } | null>(null);
  const subNow = useRef<string | null>(null);
  subNow.current = sub;

  const stopPend = () => {
    if (pend.current) window.clearTimeout(pend.current.timer);
    pend.current = null;
  };
  /** Ask for the submenu to change. It happens at once unless the pointer is heading into the open one. */
  const askSub = (label: string | null) => {
    if (label === subNow.current) {
      stopPend();
      return;
    }
    const until = pend.current?.until ?? Date.now() + HOVER_GRACE;
    if (subNow.current !== null && Date.now() < until && headingTo(trail.current.prev, trail.current.now, subBox.current)) {
      if (pend.current) window.clearTimeout(pend.current.timer);
      pend.current = { until, timer: window.setTimeout(() => askSub(label), HOVER_STEP) };
      return;
    }
    stopPend();
    setSub(label);
  };
  useEffect(() => stopPend, []);
  useEffect(() => {
    stopPend();
    if (sub === null) subBox.current = null;
  }, [sub]);

  // Escape closes an open menu wherever the keyboard happens to be, and never reaches the canvas behind it (where it
  // would drop the selection). A submenu goes first, so Escape walks back out one level at a time.
  useEffect(() => {
    if (open === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      if (subNow.current !== null) {
        stopPend();
        setSub(null);
        return;
      }
      setOpen(null);
      bar.current?.querySelectorAll<HTMLElement>('[data-top]:not([data-folded])')[open]?.focus();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [open]);

  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) {
        setOpen(null);
        setMoreOpen(false);
      }
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);

  useEffect(() => {
    if (!moreOpen || open !== null) return;
    const away = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [moreOpen, open]);

  const focusItem = (menu: number, which: 'first' | 'last' | number) => {
    requestAnimationFrame(() => {
      const items = [...(bar.current?.querySelectorAll<HTMLElement>(topItems(menu)) ?? [])];
      (which === 'first' ? items[0] : which === 'last' ? items[items.length - 1] : items[which])?.focus();
    });
  };

  const onBarKey = (e: React.KeyboardEvent, index: number) => {
    // The menus that show, and the More button after them when some are folded.
    const n = firstFolded + (folded ? 1 : 0);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
      const wasOpen = open !== null && open < firstFolded;
      if (wasOpen && next < firstFolded) setOpen(next);
      else if (wasOpen) setOpen(null);
      bar.current?.querySelectorAll<HTMLElement>('[data-top]:not([data-folded])')[next]?.focus();
      if (wasOpen && next < firstFolded) focusItem(next, 'first');
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
      bar.current?.querySelectorAll<HTMLElement>('[data-top]:not([data-folded])')[index]?.focus();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      // A menu opened from More has no neighbours to move to.
      if (index >= firstFolded) return;
      const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + firstFolded) % firstFolded;
      setOpen(next);
      bar.current?.querySelectorAll<HTMLElement>('[data-top]:not([data-folded])')[next]?.focus();
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
        <div key={`sub-${it.label}`} className="ui-menu-subwrap" onMouseEnter={() => askSub(it.label)} onMouseLeave={() => askSub(null)}>
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
            <SubmenuBox label={it.label} onBox={(b) => (subBox.current = b)} onEnter={stopPend}>
              {it.items.map((x, j) => row(x, j, menu, true))}
            </SubmenuBox>
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
        onMouseEnter={inSub ? undefined : () => askSub(null)}
        onKeyDown={(e) => (inSub ? onSubKey(e, menu) : onItemKey(e, menu))}
        onClick={() => {
          if (!enabled) return;
          setOpen(null);
          setMoreOpen(false);
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
    <nav
      className="ui-menubar"
      role="menubar"
      aria-label="Menus"
      ref={bar}
      data-help="menus"
      onMouseMove={(e) => {
        trail.current = { prev: trail.current.now, now: { x: e.clientX, y: e.clientY } };
      }}
    >
      {menus.map(({ menu, items }, index) => (
        <div key={menu.label} className={`ui-menu-wrap${index >= firstFolded ? ' is-folded' : ''}`} aria-hidden={index >= firstFolded || undefined}>
          <button
            type="button"
            role="menuitem"
            data-top
            data-folded={index >= firstFolded ? '' : undefined}
            tabIndex={index >= firstFolded ? -1 : undefined}
            data-quest={`menu-${menu.label.toLowerCase()}`}
            aria-haspopup="menu"
            aria-expanded={open === index}
            className={`ui-menu-top${open === index ? ' is-open' : ''}`}
            onClick={() => setOpen(open === index ? null : index)}
            onMouseEnter={() => open !== null && setOpen(index)}
            onKeyDown={(e) => onBarKey(e, index)}
          >
            {menuTitle(menu)}
          </button>
          {open === index && index < firstFolded && (
            <div className="ui-menu" role="menu" aria-label={menuTitle(menu)} data-menu={index}>
              {items.map((it, i) => row(it, i, index))}
            </div>
          )}
        </div>
      ))}
      {folded && (
        <div className="ui-menu-wrap ui-menu-more">
          <button
            type="button"
            role="menuitem"
            data-top
            data-quest="menu-more"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="More menus"
            className={`ui-menu-top${moreOpen ? ' is-open' : ''}`}
            onClick={() => {
              setOpen(null);
              setMoreOpen(!moreOpen);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpen(null);
                setMoreOpen(true);
                requestAnimationFrame(() => bar.current?.querySelector<HTMLElement>('.ui-menu-more [role^="menuitem"]:not([data-top])')?.focus());
              } else if (e.key === 'Escape') setMoreOpen(false);
              else onBarKey(e, firstFolded);
            }}
          >
            More
            <Icon name="chevron-down" size={12} />
          </button>
          {moreOpen && open !== null && open >= firstFolded && menus[open] && (
            <div className="ui-menu" role="menu" aria-label={menuTitle(menus[open].menu)} data-menu={open}>
              <button
                type="button"
                role="menuitem"
                className="ui-menu-item"
                onClick={() => setOpen(null)}
                onKeyDown={(e) => onItemKey(e, open)}
              >
                <span className="ui-menu-tick">
                  <Icon name="chevron-left" size={14} />
                </span>
                <span className="ui-menu-label">More menus</span>
              </button>
              {menus[open].items.map((it, i) => row(it, i, open))}
            </div>
          )}
          {moreOpen && (open === null || open < firstFolded) && (
            <div className="ui-menu" role="menu" aria-label="More menus" data-menu="more">
              {menus.slice(firstFolded).map(({ menu }, k) => (
                <button
                  key={menu.label}
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  className="ui-menu-item"
                  data-more-menu={menu.label}
                  onClick={() => {
                    setOpen(firstFolded + k);
                    requestAnimationFrame(() => focusItem(firstFolded + k, 'first'));
                  }}
                  onKeyDown={(e) => {
                    const list = [...(bar.current?.querySelectorAll<HTMLElement>('[data-menu="more"] > [role="menuitem"]') ?? [])];
                    const at = list.indexOf(e.currentTarget);
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      list[(at + 1) % list.length]?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      list[(at - 1 + list.length) % list.length]?.focus();
                    } else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpen(firstFolded + k);
                      requestAnimationFrame(() => focusItem(firstFolded + k, 'first'));
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setMoreOpen(false);
                      bar.current?.querySelector<HTMLElement>('.ui-menu-more [data-top]')?.focus();
                    }
                  }}
                >
                  <span className="ui-menu-tick" />
                  <span className="ui-menu-label">{menuTitle(menu)}</span>
                  <Icon name="chevron-right" size={14} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

/** The room kept for the drawing's name when the bar works out how many menus fit, and a stand-in width for the More button before it is on screen. */
const NAME_ROOM = 96;
const MORE_WIDTH = 64;

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
function SubmenuBox({
  label,
  children,
  onBox,
  onEnter,
}: {
  label: string;
  children: React.ReactNode;
  onBox: (b: Box) => void;
  onEnter: () => void;
}) {
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
    const top = Math.max(gap, Math.min(row.top - 7, window.innerHeight - gap - h));
    el.style.top = `${top}px`;
    onBox({ left, top, right: left + w, bottom: top + h });
  }, []);
  return (
    <div ref={box} className="ui-menu ui-submenu" role="menu" aria-label={label} onMouseEnter={onEnter}>
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
