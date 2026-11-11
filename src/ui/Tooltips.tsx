// Tooltips for the whole app. Nothing to wire up: any element with a `title`, a `data-tip` or a `data-command` gets
// one. The tip shows a name, what it does, the shortcut and a "Learn more" link when a help page exists.
//
//   data-command="edit.undo"   everything comes from the command (name, description, shortcut, help)
//   title / data-tip="Text"    a plain tip; add data-tip-desc, data-tip-keys="Mod+Z" and data-help="topic" if wanted
//
// `title` is moved to `data-tip` the first time it's pointed at, so the browser's own grey tooltip never shows.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getCommand, getHelp } from '../core/registry';
import { effectiveKeys } from './keys';
import { openHelp } from './overlays';
import { Keys } from './ShortcutChip';

export interface TipContent {
  title: string;
  desc?: string;
  /** Raw shortcut strings (`Mod+Z`). */
  keys: string[];
  help?: string;
}

const SELECTOR = '[title], [data-tip], [data-command]';

/** What the tip for an element says, or null if it has none. */
export function tipFor(el: Element): TipContent | null {
  const cmdId = el.getAttribute('data-command');
  const cmd = cmdId ? getCommand(cmdId) : undefined;
  const title = el.getAttribute('data-tip') || el.getAttribute('title') || cmd?.label || '';
  if (!title) return null;
  const keysAttr = el.getAttribute('data-tip-keys');
  const keys = keysAttr ? keysAttr.split(',').map((s) => s.trim()).filter(Boolean) : cmd ? effectiveKeys(cmd) : [];
  const help = el.getAttribute('data-help') || cmd?.help || undefined;
  return { title, desc: el.getAttribute('data-tip-desc') || cmd?.description || undefined, keys, help: help && getHelp(help) ? help : undefined };
}

interface Shown {
  tip: TipContent;
  rect: DOMRect;
}

export function TooltipLayer() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const current = useRef<Element | null>(null);
  const lastShownAt = useRef(0);
  const overTip = useRef(false);

  useEffect(() => {
    const clear = () => {
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
    };
    const hide = () => {
      clear();
      current.current = null;
      setShown(null);
      setPos(null);
    };
    const show = (el: Element, delay: number) => {
      // Take the browser's own tooltip out of the picture, keep the words.
      const t = el.getAttribute('title');
      if (t) {
        if (!el.getAttribute('data-tip')) el.setAttribute('data-tip', t);
        if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', t);
        el.removeAttribute('title');
      }
      const tip = tipFor(el);
      if (!tip) return;
      clear();
      current.current = el;
      const go = () => {
        lastShownAt.current = Date.now();
        setPos(null);
        setShown({ tip, rect: el.getBoundingClientRect() });
      };
      const quick = Date.now() - lastShownAt.current < 400;
      if (delay === 0 || quick) go();
      else showTimer.current = window.setTimeout(go, delay);
    };
    const over = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest(SELECTOR) : null;
      if (!el || el === current.current) return;
      if (el.closest('.ui-tip')) return;
      show(el, 550);
    };
    const out = (e: MouseEvent) => {
      const to = e.relatedTarget instanceof Element ? e.relatedTarget : null;
      if (current.current && !(to && (current.current.contains(to) || to.closest('.ui-tip')))) {
        clear();
        // A moment of grace so the pointer can travel onto the tip to press "Learn more".
        hideTimer.current = window.setTimeout(() => {
          if (!overTip.current) hide();
        }, 160);
      }
    };
    const focusIn = (e: FocusEvent) => {
      const el = e.target instanceof Element ? e.target.closest(SELECTOR) : null;
      if (el && el.matches(':focus-visible')) show(el, 0);
    };
    const focusOut = () => hide();
    const down = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('.ui-tip')) return;
      hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'F1') hide();
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', hide);
    document.addEventListener('scroll', hide, true);
    return () => {
      clear();
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', hide);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);

  // Place it under the thing, or over it when there's no room, and keep it on screen.
  useLayoutEffect(() => {
    if (!shown || !box.current) return;
    const b = box.current.getBoundingClientRect();
    const r = shown.rect;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = r.bottom + 8;
    if (top + b.height > vh - 8) top = Math.max(8, r.top - b.height - 8);
    // Tools sit at the left edge: put the tip beside them rather than over the canvas edge.
    let left = r.left + r.width / 2 - b.width / 2;
    if (r.width < 60 && r.left < 70 && r.height < 60) {
      left = r.right + 8;
      top = Math.max(8, Math.min(vh - b.height - 8, r.top + r.height / 2 - b.height / 2));
    }
    left = Math.max(8, Math.min(vw - b.width - 8, left));
    setPos({ left, top });
  }, [shown]);

  if (!shown) return null;
  const { tip } = shown;
  return (
    <div
      ref={box}
      className="ui-tip"
      role="tooltip"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      onMouseEnter={() => (overTip.current = true)}
      onMouseLeave={() => {
        overTip.current = false;
        setShown(null);
      }}
    >
      <div className="ui-tip-head">
        <strong>{tip.title}</strong>
        {tip.keys[0] && <Keys shortcut={tip.keys[0]} />}
      </div>
      {tip.desc && <div className="ui-tip-desc">{tip.desc}</div>}
      {tip.help && (
        <button
          type="button"
          className="ui-tip-more"
          onClick={() => {
            setShown(null);
            openHelp(tip.help);
          }}
        >
          Learn more
        </button>
      )}
    </div>
  );
}

