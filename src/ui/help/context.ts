// What F1 should show: the help topic for whatever the pointer is over, or what has focus, or the contents.
import { getCommand } from '../../core/registry';

let hovered: Element | null = null;

export function trackHover(): () => void {
  const over = (e: Event) => void (hovered = e.target instanceof Element ? e.target : null);
  const leave = (e: MouseEvent) => {
    if (!e.relatedTarget) hovered = null;
  };
  document.addEventListener('mouseover', over, true);
  document.addEventListener('mouseout', leave, true);
  return () => {
    document.removeEventListener('mouseover', over, true);
    document.removeEventListener('mouseout', leave, true);
  };
}

/** The help topic id an element (or something around it) points at, with `data-help` or `data-command`. */
export function helpIdFor(el: Element | null): string | null {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const direct = n.getAttribute('data-help');
    if (direct) return direct;
    const cmd = n.getAttribute('data-command');
    if (cmd) {
      const h = getCommand(cmd)?.help;
      if (h) return h;
    }
  }
  return null;
}

export function contextualHelpId(): string | null {
  return helpIdFor(hovered) ?? helpIdFor(document.activeElement);
}
