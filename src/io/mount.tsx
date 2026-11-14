import { useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './io.css';
import { pressedBackdrop } from '../ui/backdropClick';

/** Puts a dialog on screen, outside the app's own tree, and hands it a function that closes it again. */
export function mountModal(render: (close: () => void) => ReactElement): () => void {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const before = document.activeElement as HTMLElement | null;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.unmount();
    host.remove();
    before?.focus?.();
  };
  root.render(render(close));
  return close;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A friendly centred dialog: dim backdrop, Escape closes, Tab stays inside, and the app behind never sees the keys. */
export function Modal({ title, onClose, children, wide = false, canClose = true, className = '' }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; canClose?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el).focus();
  }, []);
  return (
    <div className="io-backdrop" onMouseDown={(e) => e.target === e.currentTarget && canClose && pressedBackdrop(e.clientX, e.clientY, ref.current, onClose)}>
      <div
        ref={ref}
        className={`io-modal${wide ? ' io-wide' : ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' && canClose) {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Tab') {
            const items = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((x) => x.offsetParent !== null);
            if (!items.length) return;
            const i = items.indexOf(document.activeElement as HTMLElement);
            if (e.shiftKey && i <= 0) {
              e.preventDefault();
              items[items.length - 1].focus();
            } else if (!e.shiftKey && i === items.length - 1) {
              e.preventDefault();
              items[0].focus();
            }
          }
        }}
      >
        <div className="io-head">
          <h2 id={titleId}>{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}
