// The colour picker. One for the whole app: a square for saturation and brightness, a strip for hue, a strip for
// opacity (alpha) where see-through makes sense, and a hex box. `ColourPicker` is the picker itself (the Colours panel
// puts it inline); `ColourField` is a small swatch that opens it as a popover; `ColourPopover` is the popover alone,
// for a menu or a well that opens it from somewhere else.
//
// Where a colour can't be see-through, pass `alpha={false}` and say why in `why`: the picker then shows that line
// instead of a slider that would do nothing. Where it can, `note` is for anything that bends what see-through means.
import { createPortal } from 'react-dom';
import { flyoutLayer } from '../layers';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { alphaByte, alphaPercent, hexToHsv, hsvToHex, readColourText, solidOf, withAlpha, withAlphaPercent, type HSV } from '../../canvas/colors';
import { usePopover } from '../popover';
import '../../canvas/canvas.css';
import './colourPicker.css';

/** What a colour place says about see-through. */
export interface ColourRules {
  /** Offer the opacity slider. Default yes. */
  alpha?: boolean;
  /** When there is no slider: why not, in plain words. Shown in the picker so nobody hunts for it. */
  why?: string;
  /** When there is a slider: anything that changes what it means here. */
  note?: string;
}

/** Turns a drag on an element into 0..1 positions, with pointer capture so it keeps working outside the box. */
export function useDrag(onMove: (x: number, y: number) => void, onEnd?: () => void) {
  const drag = useRef(false);
  const read = (e: RPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onMove(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  return {
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      drag.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      read(e);
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => {
      if (drag.current) read(e);
    },
    onPointerUp: () => {
      if (drag.current) onEnd?.();
      drag.current = false;
    },
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function HexBox({ value, alpha, onCommit, onEnd }: { value: string; alpha: boolean; onCommit: (hex: string) => void; onEnd?: () => void }) {
  const shown = alpha ? value : solidOf(value);
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(shown);
    setBad(false);
  }, [shown]);
  const commit = (v: string) => {
    const c = readColourText(v, alpha);
    if (!c) return setBad(true);
    setBad(false);
    onCommit(c);
    setText(c);
    onEnd?.();
  };
  return (
    <label className="cv-hex">
      <span className="cv-field-label">Hex</span>
      <input
        className="cv-hex-input"
        value={text}
        spellCheck={false}
        aria-invalid={bad}
        aria-label={alpha ? 'Colour as hex, like #ff9e6d or #ff9e6d80' : 'Colour as hex, like #ff9e6d'}
        data-bad={bad}
        onChange={(e) => {
          setText(e.target.value);
          const typed = e.target.value.trim();
          setBad(!readColourText(typed) && typed.length > 3);
          // Applies as you type once it is a whole colour.
          if (/^#?([0-9a-f]{6}|[0-9a-f]{8})$/i.test(typed)) {
            const c = readColourText(typed, alpha);
            if (c) onCommit(c);
          }
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
      />
    </label>
  );
}

export function ColourPicker({ value, onChange, onEnd, alpha = true, why, note }: { value: string; onChange: (hex: string) => void; onEnd?: () => void } & ColourRules) {
  const solid = solidOf(value);
  const a = alpha ? alphaByte(value) : 255;
  // The hue and saturation are kept here because greys and blacks have no hue of their own: dragging down to black
  // shouldn't throw the hue away.
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(solid) ?? { h: 0, s: 0, v: 0 });
  useEffect(() => {
    if (hsvToHex(hsv).toLowerCase() !== solid.toLowerCase()) {
      const next = hexToHsv(solid);
      if (next) setHsv(next);
    }
    // only when the colour changes from outside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solid]);
  /** Sends a colour out; the opacity stays exactly as it was unless the slider moved it. */
  const send = (n: HSV, byte = a) => {
    setHsv(n);
    const hex = hsvToHex(n);
    onChange(alpha ? withAlpha(hex, byte) : hex);
  };
  const sv = useDrag((x, y) => send({ ...hsv, s: x, v: 1 - y }), onEnd);
  const hue = useDrag((x) => send({ ...hsv, h: x * 360 }), onEnd);
  const op = useDrag((x) => send(hsv, Math.round(clamp01(x) * 100) * 2.55), onEnd);
  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const pct = Math.round((a / 255) * 100);
  const onSvKey = (e: RKeyEvent) => {
    const d = e.shiftKey ? 0.1 : 0.02;
    const m: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
    const k = m[e.key];
    if (!k) return;
    e.preventDefault();
    send({ ...hsv, s: clamp01(hsv.s + k[0]), v: clamp01(hsv.v + k[1]) });
  };
  const onHueKey = (e: RKeyEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    send({ ...hsv, h: (hsv.h + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 20 : 4) + 360) % 360 });
  };
  const onOpKey = (e: RKeyEvent) => {
    const step = e.shiftKey ? 10 : 1;
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = pct - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = pct + step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    if (next === null) return;
    e.preventDefault();
    send(hsv, (Math.min(100, Math.max(0, next)) / 100) * 255);
  };
  const full = alpha ? value : solid;
  return (
    <div className="cp-picker">
      <div className="cv-picker">
        <div className="cv-sv" style={{ backgroundColor: pure }} {...sv} role="slider" aria-label="Saturation and brightness" aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`} tabIndex={0} onKeyDown={onSvKey}>
          <div className="cv-sv-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hsvToHex(hsv) }} />
        </div>
        <div className="cv-hue" {...hue} role="slider" aria-label="Hue" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)} tabIndex={0} onKeyDown={onHueKey}>
          <div className="cv-hue-knob" style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: pure }} />
        </div>
        {alpha && (
          <div className="cp-alpha-row">
            <span className="cv-field-label" title="How solid the colour is (alpha). 100% is solid, 0% is clear.">
              Opacity
            </span>
            <div className="cp-alpha" style={{ '--cp': solid } as CSSProperties} {...op} role="slider" aria-label="Opacity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}% solid`} tabIndex={0} onKeyDown={onOpKey}>
              <div className="cp-alpha-knob" style={{ left: `${pct}%`, '--cp': full } as CSSProperties} />
            </div>
            <output className="cp-alpha-val">{pct}%</output>
          </div>
        )}
      </div>
      <div className="cp-hex-row">
        <span className="cp-chip cp-chip-static" style={{ '--chip': full } as CSSProperties} aria-hidden="true" />
        <HexBox value={value} alpha={alpha} onCommit={(hex) => send(hexToHsv(hex) ?? hsv, alpha ? alphaByte(hex) : 255)} onEnd={onEnd} />
      </div>
      {!alpha && why && (
        <p className="cp-note" data-kind="why">
          {why}
        </p>
      )}
      {alpha && note && (
        <p className="cp-note" data-kind="note">
          {note}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- popover

/** A place the popover opens next to: a box on screen, or a point (a right-click). */
export type ColourAnchor = { left: number; top: number; right?: number; bottom?: number };

const WIDTH = 232;

/**
 * The picker in a small floating box beside `at`. It changes the colour as you drag (`onChange`), or, with `onCommit`,
 * waits and hands over the final colour when it closes (for a change that is costly or makes an undo step each time).
 */
export function ColourPopover({
  value,
  at,
  label,
  onChange,
  onCommit,
  onClose,
  alpha,
  why,
  note,
  opener,
}: { value: string; at: ColourAnchor; label: string; onChange?: (hex: string) => void; onCommit?: (hex: string) => void; onClose: () => void; opener?: HTMLElement | null } & ColourRules) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(value);
  const latest = useRef(value);
  const closing = useRef(onClose);
  closing.current = onClose;
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: at.left, top: (at.bottom ?? at.top) + 6 });
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    const left = Math.max(8, Math.min(at.left, window.innerWidth - WIDTH - 8));
    let top = (at.bottom ?? at.top) + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, at.top - h - 6);
    setPos({ left, top });
  }, [at.left, at.top, at.bottom, note, why]);
  const change = (hex: string) => {
    latest.current = hex;
    setDraft(hex);
    onChange?.(hex);
  };
  const close = () => closing.current();
  // However it closes (a click away, Escape, its own swatch pressed again), the last colour is handed over once.
  const commit = useRef({ onCommit, value });
  commit.current = { onCommit, value };
  useEffect(
    () => () => {
      const { onCommit: done, value: first } = commit.current;
      if (done && latest.current.toLowerCase() !== first.toLowerCase()) done(latest.current);
    },
    [],
  );
  useEffect(() => {
    const away = (e: Event) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !(opener && opener.contains(t))) close();
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
    // close reads refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opener]);
  usePopover(ref, close);
  return createPortal(
    <div ref={ref} className="cp-pop" role="dialog" aria-label={label} style={{ left: pos.left, top: pos.top, width: WIDTH, zIndex: flyoutLayer(opener) }}>
      <ColourPicker value={draft} onChange={change} alpha={alpha} why={why} note={note} />
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- the swatch that opens it

/** A swatch you click to open the picker. A see-through colour shows a chequerboard behind it. */
export function ColourField({
  value,
  onChange,
  onCommit,
  label,
  alpha,
  why,
  note,
  disabled,
  className = 'cp-chip',
  style,
  title,
  children,
  testId,
  empty,
}: {
  value: string;
  onChange?: (hex: string) => void;
  onCommit?: (hex: string) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children?: ReactNode;
  testId?: string;
  /** There is no colour yet ("none"): the swatch shows no colour of its own and the picker starts from `value`. */
  empty?: boolean;
} & ColourRules) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<ColourAnchor | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    if (open) return setOpen(false);
    const r = btn.current?.getBoundingClientRect();
    setAt(r ? { left: r.left, top: r.top, bottom: r.bottom } : { left: 20, top: 20 });
    setOpen(true);
  };
  const shown = alpha === false ? solidOf(value) : value;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={className}
        style={{ ...style, ...(empty ? {} : { '--chip': shown, '--well': shown }) } as CSSProperties}
        aria-label={`${label}: ${empty ? 'none' : shown}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title ?? `${label}: ${empty ? 'none' : shown}. Click to change it.`}
        data-testid={testId}
        disabled={disabled}
        onClick={toggle}
      >
        {children}
      </button>
      {open && at && <ColourPopover value={value} at={at} label={label} onChange={onChange} onCommit={onCommit} onClose={() => setOpen(false)} alpha={alpha} why={why} note={note} opener={btn.current} />}
    </>
  );
}
