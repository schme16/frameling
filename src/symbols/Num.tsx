// The small number boxes of the Properties panel (and the camera and artboard panels): a label, a number and a unit.
import { useState, type ReactNode } from 'react';
import { useStore } from '../core/store';
import { docDpi, pxTo, roundIn, toPx, unitInfo } from '../core/units';
import { usePrefs } from '../ui/prefs';

/**
 * How a box takes what is typed. 'live' (the usual) lands every keystroke, coalesced into one undo step. 'enter' waits for
 * Enter or leaving the box, for changes that cut or compound as they land (a number typed in two keystrokes would turn
 * a shape twice); the little arrows still land at once, one click at a time.
 */
export type NumCommit = 'live' | 'enter';

export function Num({ label, value, onChange, step = 1, suffix, title, commit = 'live' }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string; title?: string; commit?: NumCommit }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 100) / 100);
  const done = (s: string) => {
    const n = Number(s);
    if (s.trim() !== '' && Number.isFinite(n)) onChange(n);
    setDraft(null);
  };
  return (
    <label className="sy-num" title={title}>
      <span>{label}</span>
      <span className="sy-num-box">
        <input
          type="number"
          step={step}
          value={shown}
          aria-label={label}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            // Typing has an input type of its own; the arrows and the wheel do not, and each of those is a finished step.
            const typed = !!(e.nativeEvent as InputEvent).inputType && !/^insertReplacementText$/.test((e.nativeEvent as InputEvent).inputType);
            const land = commit === 'live' || !typed;
            if (land && e.target.value.trim() !== '' && Number.isFinite(n)) {
              onChange(n);
              if (commit === 'enter') setDraft(null);
            }
          }}
          onBlur={(e) => {
            if (draft !== null || commit === 'live') done(e.target.value);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') done(e.currentTarget.value);
            if (e.key === 'Escape' && commit === 'enter' && draft !== null) setDraft(null);
          }}
        />
        {suffix && <i>{suffix}</i>}
      </span>
    </label>
  );
}

/** A length typed in the chosen unit (Preferences > Units), stored as stage pixels. */
export function LengthNum({ label, px, onPx, title, commit }: { label: string; px: number; onPx: (px: number) => void; title?: string; commit?: NumCommit }) {
  const unit = usePrefs((p) => p.units);
  const dpi = useStore((s) => docDpi(s.doc));
  return <Num label={label} value={roundIn(pxTo(px, unit, dpi), unit)} suffix={unit === 'px' ? undefined : unit} step={unit === 'px' ? 1 : 10 ** -unitInfo(unit).places} onChange={(v) => onPx(toPx(v, unit, dpi))} title={title} commit={commit} />;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sy-section">
      <h3 className="sy-section-title">{title}</h3>
      {children}
    </section>
  );
}
