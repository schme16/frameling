// Small form controls shared by the tool options and the colour panel. Plain words, big targets, theme tokens only.
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import './canvas.css';

export function Field({ label, value, children, hint }: { label: string; value?: ReactNode; children: ReactNode; hint?: string }) {
  return (
    <div className="cv-field">
      <div className="cv-field-head">
        <span className="cv-field-label">{label}</span>
        {value !== undefined && <span className="cv-field-value">{value}</span>}
      </div>
      {children}
      {hint && <div className="cv-field-hint">{hint}</div>}
    </div>
  );
}

/** Where a slider lands for a pointer at `x`, with modifiers: Alt or Ctrl moves ten times slower from where the fine drag
 * started (precision), Shift snaps to ten steps (speed). Pure, so it's tested. */
export function sliderValueAt(o: { x: number; left: number; width: number; min: number; max: number; step: number; fine: { x: number; value: number } | null; coarse: boolean }): number {
  const span = o.max - o.min;
  const raw = o.fine ? o.fine.value + ((o.x - o.fine.x) / Math.max(1, o.width)) * span * 0.1 : o.min + ((o.x - o.left) / Math.max(1, o.width)) * span;
  const q = o.coarse ? o.step * 10 : o.fine ? o.step / 10 : o.step;
  const v = Math.round((raw - o.min) / q) * q + o.min;
  return clampTo(v, o.min, o.max);
}

const clampTo = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number(v.toFixed(6))));

/**
 * A slider with its value shown as a button: click the number to type one in (Enter keeps it, Escape cancels).
 * Drag with Shift for big steps, Alt or Ctrl for fine control; the arrow keys do the same (Shift x10, Alt/Ctrl a tenth).
 */
export function Slider({ label, value, min, max, step = 1, onChange, format, hint }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; hint?: string }) {
  const [typing, setTyping] = useState<string | null>(null);
  const fine = useRef<{ x: number; value: number } | null>(null);
  const shown = format ? format(value) : String(value);
  const commit = (text: string) => {
    const n = parseFloat(text.replace(/[^0-9.+-eE]/g, ''));
    setTyping(null);
    if (Number.isFinite(n)) onChange(clampTo(n, min, max));
  };
  const valueNode =
    typing === null ? (
      <button type="button" className="cv-field-value cv-slider-value" title="Click to type a number" aria-label={`${label}: ${shown}. Type a value`} onClick={() => setTyping(String(value))}>
        {shown}
      </button>
    ) : (
      <input
        className="cv-slider-type"
        type="text"
        inputMode="decimal"
        autoFocus
        aria-label={`${label}, type a value from ${min} to ${max}`}
        value={typing}
        onChange={(e) => setTyping(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit(e.currentTarget.value);
          else if (e.key === 'Escape') setTyping(null);
        }}
      />
    );
  const drag = (e: PointerEvent<HTMLInputElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const precise = e.altKey || e.ctrlKey || e.metaKey;
    if (precise && !fine.current) fine.current = { x: e.clientX, value };
    if (!precise) fine.current = null;
    const v = sliderValueAt({ x: e.clientX, left: r.left, width: r.width, min, max, step, fine: fine.current, coarse: e.shiftKey });
    if (v !== value) onChange(v);
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const by = e.shiftKey ? step * 10 : e.altKey || e.ctrlKey || e.metaKey ? step / 10 : step;
    onChange(clampTo(value + dir * by, min, max));
  };
  return (
    <div className="cv-field">
      <div className="cv-field-head">
        <span className="cv-field-label">{label}</span>
        {valueNode}
      </div>
      <input
        className="cv-slider"
        type="range"
        min={min}
        max={max}
        step="any"
        value={value}
        aria-label={label}
        aria-valuetext={shown}
        title="Shift: big steps. Alt or Ctrl: fine control."
        onChange={(e) => {
          if (!fine.current) onChange(clampTo(Math.round((Number(e.target.value) - min) / step) * step + min, min, max));
        }}
        onPointerDown={(e) => {
          if (!(e.shiftKey || e.altKey || e.ctrlKey || e.metaKey)) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          fine.current = null;
          drag(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e);
        }}
        onPointerUp={(e) => {
          fine.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onKeyDown={key}
      />
      {hint && <div className="cv-field-hint">{hint}</div>}
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="cv-field">
      <label className="cv-toggle" data-on={checked}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="cv-toggle-track" aria-hidden="true">
          <span className="cv-toggle-knob" />
        </span>
        <span className="cv-toggle-label">{label}</span>
      </label>
      {hint && <div className="cv-field-hint">{hint}</div>}
    </div>
  );
}

export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <Field label={label}>
      <div className="cv-choice" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="cv-choice-btn" data-on={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function Tip({ children }: { children: ReactNode }) {
  return <p className="cv-tip">{children}</p>;
}

export function ActionButton({ children, onClick, disabled, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className="cv-action" onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}
