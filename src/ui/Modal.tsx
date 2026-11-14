// A dialog shell: dim backdrop, focus kept inside, Esc closes, focus goes back to where it was.
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';
import { pressedBackdrop } from './backdropClick';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  onClose,
  children,
  className = '',
  size = 'md',
  hideHeader = false,
  initialFocus,
  describedBy,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  hideHeader?: boolean;
  /** CSS selector inside the dialog to focus first (else the dialog itself, so no tooltip pops up on open). */
  initialFocus?: string;
  /** The id of the text inside that says what the dialog is about, so a screen reader reads it out on opening. */
  describedBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const target = (initialFocus && el?.querySelector<HTMLElement>(initialFocus)) || el?.querySelector<HTMLElement>('[data-autofocus]') || el;
    target?.focus();
    return () => {
      if (before && document.contains(before)) before.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Let a control inside (a shortcut recorder, an open select) use Escape first.
      if (e.defaultPrevented) return;
      e.stopPropagation();
      closeRef.current();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="ui-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) pressedBackdrop(e.clientX, e.clientY, ref.current, () => closeRef.current());
      }}
    >
      <div ref={ref} className={`ui-modal ui-modal-${size} ${className}`} role="dialog" aria-modal="true" aria-label={title} aria-describedby={describedBy} tabIndex={-1} onKeyDown={onKey}>
        {!hideHeader && (
          <div className="ui-modal-head">
            <h2>{title}</h2>
            <button type="button" className="ui-icon-btn" aria-label="Close" title="Close" onClick={() => closeRef.current()}>
              <Icon name="close" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
