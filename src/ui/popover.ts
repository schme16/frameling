// Small floating menus and popovers (right-click menus, swatch menus): focus goes in when they open, Escape closes
// them without also reaching the canvas (where it would deselect), and focus goes back where it was.
import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function usePopover(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current;
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
    return () => {
      cancelAnimationFrame(raf);
      // Only take focus back if it was inside (or nowhere): clicking away onto something else keeps that.
      const now = document.activeElement;
      if (before && document.contains(before) && (!now || now === document.body || el?.contains(now) || !document.contains(now))) before.focus();
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
}
