// Small fields the Particles and Text panels share: a number box, a colour well and a titled section.
import { useState, type ReactNode } from 'react';
import '../symbols/symbols.css';
import { SectionScope } from './explain/ExplainIcon';
import { ColourField } from './colour/ColourPicker';
import './panelFields.css';

export function Num({ label, value, onChange, step = 1, min, max, suffix, title }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; title?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 100) / 100);
  const fix = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const commit = (s: string) => {
    const n = Number(s);
    if (s.trim() !== '' && Number.isFinite(n)) onChange(fix(n));
    setDraft(null);
  };
  return (
    <label className="sy-num" title={title}>
      <span>{label}</span>
      <span className="sy-num-box">
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={shown}
          aria-label={label}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(fix(n));
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit(e.currentTarget.value);
          }}
        />
        {suffix && <i>{suffix}</i>}
      </span>
    </label>
  );
}

/** A colour with a label. See-through (opacity) is offered unless `alpha` is false, and then `why` says why not. */
export function ColorWell({ label, value, onChange, title, alpha = true, why }: { label: string; value: string; onChange: (v: string) => void; title?: string; alpha?: boolean; why?: string }) {
  return (
    <div className="pt-color" title={title}>
      <ColourField label={label} value={value} onChange={onChange} alpha={alpha} why={why} />
      <span>{label}</span>
    </div>
  );
}

export function Section({ title, children, open = true, help }: { title: string; children: ReactNode; open?: boolean; help?: string }) {
  return (
    <SectionScope title={title}>
      {(icon) => (
        <details className="pt-section" open={open} data-help={help}>
          <summary className="sy-section-title">
            {title}
            {icon}
          </summary>
          <div className="pt-section-body">{children}</div>
        </details>
      )}
    </SectionScope>
  );
}
