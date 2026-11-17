// The Paper picker: a button like the Brush, Tip and Stick ones, with a swatch of the paper's grain, that drops a list of
// the five papers each with its own swatch. It changes nothing by itself: the Paper group says what picking means (the
// sheet's paper, or a brush's own).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { flyoutLayer } from '../ui/layers';
import { placePopup, type PopupPlace } from '../ui/placePopup';
import { usePopover } from '../ui/popover';
import { PAPERS, paperInfo, paperTile, type PaperKind } from './paper';
import { PaperSwatch } from './PaperSwatch';
import './paperPicker.css';

const SW_W = 92;
const SW_H = 30;

function Menu({ anchor, value, onPick, onClose }: { anchor: HTMLElement; value: PaperKind; onPick: (p: PaperKind) => void; onClose: (refocus: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const shut = useCallback(() => onClose(true), [onClose]);
  usePopover(ref, shut);
  const spot = useCallback(
    (): PopupPlace => placePopup({ anchor: anchor.getBoundingClientRect(), win: { w: window.innerWidth, h: window.innerHeight }, width: Math.max(260, anchor.getBoundingClientRect().width), height: ref.current?.offsetHeight ?? 300 }),
    [anchor],
  );
  const [pos, setPos] = useState<PopupPlace>(spot);
  useLayoutEffect(() => {
    const n = spot();
    setPos((p) => (p.left === n.left && p.width === n.width && p.top === n.top && p.bottom === n.bottom && p.maxHeight === n.maxHeight ? p : n));
  });
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [anchor, onClose]);
  const edge = pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom };
  return createPortal(
    <div ref={ref} className="pk-pop pp-menu" role="listbox" aria-label="Pick a paper" style={{ ...edge, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, zIndex: flyoutLayer(anchor) }}>
      <div className="pk-rows">
        {PAPERS.map((p) => (
          <div
            key={p.id}
            role="option"
            aria-selected={p.id === value}
            tabIndex={0}
            className="pk-row pk-row-tip"
            data-on={p.id === value}
            title={p.hint}
            onClick={() => {
              onPick(p.id);
              onClose(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick(p.id);
                onClose(true);
              }
            }}
          >
            <span className="pp-sw">
              <PaperSwatch kind={p.id} w={SW_W} h={SW_H} />
            </span>
            <span className="pk-main">
              <span className="pk-name">
                <span className="pk-name-text">{p.label}</span>
              </span>
              <span className="pp-hint">{p.hint.split(':')[0]}</span>
            </span>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** Makes the five papers' tiles one at a time when the browser is idle, so the first time the list opens costs a copy. */
function warmPapers(): () => void {
  let n = 0;
  let id: number | ReturnType<typeof setTimeout> | undefined;
  const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));
  const next = () => {
    if (n >= PAPERS.length) return;
    paperTile(PAPERS[n++].id);
    id = idle(next);
  };
  id = idle(next);
  return () => {
    if (id === undefined) return;
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id as number);
    clearTimeout(id as ReturnType<typeof setTimeout>);
  };
}

/** `value` is the paper the button shows; `sub` is the small line under its name (whose paper it is). */
export function PaperPicker({ value, onPick, sub }: { value: PaperKind; onPick: (p: PaperKind) => void; sub?: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => warmPapers(), []);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => btn.current?.focus());
  }, []);
  return (
    <div data-control="paper-choice">
      <button ref={btn} type="button" className="pk-btn" aria-haspopup="listbox" aria-expanded={open} title="Pick the paper, by what its grain looks like" onClick={() => (open ? close(true) : setOpen(true))}>
        <span className="pk-btn-sample pp-sw">
          <PaperSwatch kind={value} w={SW_W} h={SW_H} />
        </span>
        <span className="pk-btn-text">
          <span className="pk-btn-name">
            <span className="pk-btn-name-text">{paperInfo(value).label}</span>
          </span>
          {sub && <span className="pk-btn-sub">{sub}</span>}
        </span>
        <span className="pk-caret" aria-hidden="true">
          <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </button>
      {open && btn.current && <Menu anchor={btn.current} value={value} onPick={onPick} onClose={close} />}
    </div>
  );
}
