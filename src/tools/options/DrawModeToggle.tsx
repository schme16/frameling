// The "Keep separate / Merge together" switch at the top of every vector drawing tool's options.
import { findLayer } from '../../core/doc';
import { useStore } from '../../core/store';
import { Field, Toggle } from '../../canvas/controls';
import { layerDrawMode, setLayerDrawMode, type DrawMode } from '../merge-mode';

/** Two little circles: apart with their own outlines, or joined into one blob. */
function Glyph({ mode }: { mode: DrawMode }) {
  return (
    <svg className="cv-drawmode-glyph" width="26" height="16" viewBox="0 0 26 16" aria-hidden="true">
      {mode === 'object' ? (
        <>
          <circle cx="9" cy="8" r="6" fill="currentColor" opacity="0.35" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="17" cy="8" r="6" fill="currentColor" opacity="0.35" stroke="currentColor" strokeWidth="1.3" />
        </>
      ) : (
        <path d="M13 3.53A6 6 0 1 0 13 12.47A6 6 0 1 0 13 3.53Z" fill="currentColor" opacity="0.85" />
      )}
    </svg>
  );
}

const HINT: Record<DrawMode, string> = {
  object: 'Each shape stays on its own, so you can move it later (object drawing).',
  merge: 'Shapes join their own colour and cut other colours, like paint (merge drawing). Ctrl+G keeps a shape apart.',
};

/** `variant` 'switch' is the B look from the A/B comparison; the app uses the default. */
export function DrawModeToggle({ variant = 'segments' }: { variant?: 'segments' | 'switch' }) {
  const layer = useStore((s) => findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1]);
  if (!layer || layer.kind !== 'vector') return null;
  const mode = layerDrawMode(layer);
  const set = (m: DrawMode) => setLayerDrawMode(layer.id, m);
  if (variant === 'switch') return <Toggle label="Merge shapes together" checked={mode === 'merge'} onChange={(on) => set(on ? 'merge' : 'object')} hint={HINT[mode]} />;
  return (
    <Field label="Shapes on this layer" hint={HINT[mode]}>
      <div className="cv-choice cv-drawmode" role="radiogroup" aria-label="Shapes on this layer" data-quest="draw-mode">
        {(['object', 'merge'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className="cv-choice-btn" data-on={mode === m} title={m === 'object' ? 'Keep shapes separate (object drawing). Key: J' : 'Merge shapes together (merge drawing). Key: J'} onClick={() => set(m)}>
            <Glyph mode={m} />
            {m === 'object' ? 'Separate' : 'Merge'}
          </button>
        ))}
      </div>
    </Field>
  );
}
