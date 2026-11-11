import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePopover } from '../ui/popover';

export type MenuItem =
  | { label: string; onClick: () => void; hint?: string; danger?: boolean; disabled?: boolean; checked?: boolean; swatch?: string }
  | { separator: true }
  | { heading: string }
  | { node: ReactNode };

/**
 * A little floating box at a screen point. It sits on the page itself (never inside the timeline, which scrolls and
 * clips), stays on screen, and closes on a click outside, Escape or losing focus. Children are the content.
 */
export function Floating({ x, y, onClose, children, className = '' }: { x: number; y: number; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x, y });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setAt({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  usePopover(ref, onClose);
  return createPortal(
    <div ref={ref} className={`tl-floating ${className}`} style={{ left: at.x, top: at.y }} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </div>,
    document.body,
  );
}

/** A right-click menu. Closes when something is picked. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  // A menu may only hold menu items. With a slider or a box in it, it's a plain group of buttons instead.
  const plain = items.some((it) => 'node' in it);
  return (
    <Floating x={x} y={y} onClose={onClose} className="tl-menu">
      <div role={plain ? 'group' : 'menu'}>
        {items.map((it, i) => {
          if ('separator' in it) return <div key={i} className="tl-menu-sep" role="separator" />;
          if ('heading' in it) return <div key={i} className="tl-menu-heading">{it.heading}</div>;
          if ('node' in it) return <div key={i} className="tl-menu-node">{it.node}</div>;
          return (
            <button
              key={i}
              type="button"
              role={plain ? undefined : 'menuitem'}
              className={`tl-menu-item${it.danger ? ' is-danger' : ''}`}
              disabled={it.disabled}
              onClick={() => {
                onClose();
                it.onClick();
              }}
            >
              <span className="tl-menu-check" aria-hidden="true">{it.checked ? '✓' : ''}</span>
              {it.swatch ? <i className={`tl-menu-swatch tl-lc-${it.swatch}`} aria-hidden="true" /> : null}
              <span className="tl-menu-label">{it.label}</span>
              {it.hint ? <kbd className="tl-menu-hint">{it.hint}</kbd> : null}
            </button>
          );
        })}
      </div>
    </Floating>
  );
}

/** A name box for renaming in place: Enter or clicking away keeps the new name, Escape leaves it as it was. */
export function InlineName({ value, onDone, className = '', label }: { value: string; onDone: (next: string | null) => void; className?: string; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <input
      ref={ref}
      className={`tl-name-input ${className}`}
      defaultValue={value}
      aria-label={label}
      maxLength={60}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.currentTarget.value);
        else if (e.key === 'Escape') finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}
