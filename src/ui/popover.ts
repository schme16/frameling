// Small floating menus and popovers (right-click menus, swatch menus): focus goes in when they open, Escape closes
// them without also reaching the canvas (where it would deselect), and focus goes back where it was. Tab out of
// one closes it and lands on the next control after what opened it (a menu closes on any Tab); focus moving
// somewhere else closes it too. A popup that opens another popup (a menu with a colour picker, say) counts focus
// inside that child as its own, and Escape closes the innermost one first.
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

// Controls Tab can reach, in page order, skipping hidden and inert ones.
function tabbables(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.tabIndex >= 0 && !e.closest('[inert]') && (e.offsetParent !== null || e.getClientRects().length > 0));
}

/** Where Tab or Shift+Tab goes from a popup: the next (or previous) control after what opened it, never back to it. */
export function tabTarget(popup: HTMLElement, opener: HTMLElement | null, back: boolean): HTMLElement | null {
  const anchor = opener && document.contains(opener) && !popup.contains(opener) && opener !== document.body ? opener : popup;
  const list = tabbables().filter((e) => !popup.contains(e));
  const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
  const PRECEDING = Node.DOCUMENT_POSITION_PRECEDING;
  const inside = (e: HTMLElement) => anchor.contains(e) || e.contains(anchor);
  const pick = list.filter((e) => !inside(e) && anchor.compareDocumentPosition(e) & (back ? PRECEDING : FOLLOWING));
  return (back ? pick[pick.length - 1] : pick[0]) ?? null;
}

// A menu holds only menu items, so Tab always leaves it; anything else leaves from its first or last control.
function leaves(el: HTMLElement, back: boolean): boolean {
  const mine = tabbables().filter((e) => el.contains(e));
  const active = document.activeElement;
  if (!active || !el.contains(active)) return false;
  if (mine.length && mine.every((e) => /^menuitem/.test(e.getAttribute('role') ?? ''))) return true;
  if (!mine.length) return true;
  return back ? active === mine[0] : active === mine[mine.length - 1];
}

// Every open popup, so a parent can tell that focus inside a child popup (often portaled elsewhere) is still its own.
interface Entry { el: HTMLElement; opener: HTMLElement | null }
const open = new Set<Entry>();

function childrenOf(e: Entry, seen = new Set<Entry>()): Entry[] {
  const out: Entry[] = [];
  for (const c of open) {
    if (c === e || seen.has(c) || !c.opener || !e.el.contains(c.opener)) continue;
    seen.add(c);
    out.push(c, ...childrenOf(c, seen));
  }
  return out;
}

/** Whether a node is inside this popup or inside any popup opened from it. */
function owns(e: Entry, node: Node | null): boolean {
  return !!node && (e.el.contains(node) || childrenOf(e).some((c) => c.el.contains(node)));
}

export function usePopover(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  // Read while rendering: an input with autofocus takes focus before effects run, and the opener would be lost.
  const opener = useRef<HTMLElement | null | undefined>(undefined);
  if (opener.current === undefined) opener.current = document.activeElement as HTMLElement | null;
  useEffect(() => {
    const before = opener.current ?? null;
    const el = ref.current;
    // Listed before focus moves in, so a parent already knows this is its child.
    const entry: Entry | null = el ? { el, opener: before } : null;
    if (entry) open.add(entry);
    const focusIn = () => {
      if (!el || el.contains(document.activeElement)) return;
      el.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    };
    // Right away, then once more a frame later: whatever opened it (a right-click, a key press) may take focus back
    // as it finishes.
    focusIn();
    const raf = requestAnimationFrame(() => {
      const now = document.activeElement;
      if (!now || now === document.body || now === before) focusIn();
    });
    // Tab out of it, or focus going somewhere else by keyboard or code, closes it. A pointer press is left to the
    // popup's own click-away handling (the button that opened it may toggle it).
    let closed = false;
    let pointer = false;
    const shut = () => {
      if (closed) return;
      closed = true;
      close.current();
    };
    const tab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.defaultPrevented || !el || !el.contains(document.activeElement) || !leaves(el, e.shiftKey)) return;
      const to = tabTarget(el, before, e.shiftKey);
      e.preventDefault();
      to?.focus();
      shut();
    };
    const out = (e: FocusEvent) => {
      const to = e.relatedTarget as Node | null;
      if (!pointer && entry && to && !owns(entry, to)) shut();
    };
    const down = () => {
      pointer = true;
    };
    const up = () => setTimeout(() => (pointer = false), 0);
    window.addEventListener('keydown', tab, true);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    el?.addEventListener('focusout', out);
    return () => {
      window.removeEventListener('keydown', tab, true);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      el?.removeEventListener('focusout', out);
      if (entry) open.delete(entry);
      cancelAnimationFrame(raf);
      // Only take focus back if it was inside (or nowhere): clicking away onto something else keeps that.
      const now = document.activeElement;
      if (before && document.contains(before) && (!now || now === document.body || (entry ? owns(entry, now) : false) || !document.contains(now))) before.focus();
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A popup with an open child leaves Escape to the child.
      const mine = ref.current && [...open].find((x) => x.el === ref.current);
      if (mine && childrenOf(mine).length) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
}
