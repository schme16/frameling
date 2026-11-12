// Small pieces the options of several formats share.
import type { Doc } from '../../core/format';
import { clipLoopWords, type Plan } from '../plan';
import type { ExportSettings } from '../types';

/** Says that the clip being exported sets the loop, and lets a hand-made choice go back to following it. */
export function LoopNote({ doc, s, plan, onFollow }: { doc: Doc; s: ExportSettings; plan: Plan; onFollow: () => void }) {
  const clip = clipLoopWords(doc, s);
  if (!clip) return null;
  if (plan.loopFromClip) return <p className="ex-note">Set by the clip &ldquo;{clip.name}&rdquo;, which {clip.plays}. Tick or untick to choose another way.</p>;
  return (
    <p className="ex-note">
      The clip &ldquo;{clip.name}&rdquo; {clip.plays}.{' '}
      <button type="button" className="ex-link" onClick={onFollow}>
        Follow the clip
      </button>
    </p>
  );
}

export function Check({ checked, onChange, disabled, children, hint }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <label className={`ex-check${disabled ? ' ex-off' : ''}`} title={disabled ? hint : undefined}>
      <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
      {disabled && hint && <small className="ex-why">{hint}</small>}
    </label>
  );
}
