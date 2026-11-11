// Small form controls shared by the tool options and the colour panel. Plain words, big targets, theme tokens only.
import type { ReactNode } from 'react';
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

export function Slider({ label, value, min, max, step = 1, onChange, format, hint }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; hint?: string }) {
  return (
    <Field label={label} value={format ? format(value) : value} hint={hint}>
      <input className="cv-slider" type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
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
