// The Brush options' top: the Brush as the one main choice, with the Tip and the Stick folded under it as the parts of
// this brush. Each part says "as it comes" or "changed" and has its own small reset; one button puts the whole brush back.
// Paper is the sheet's unless this brush keeps its own, so it sits beside them (with its own small status when it is the brush's). After a change the preview carries a tag naming what changed
// and the rows that changed light up for a couple of seconds (flash.ts).
import type { ReactNode } from 'react';
import { useStore } from '../core/store';
import { BrushPicker } from './BrushPicker';
import { flashHas, useFlash } from './flash';
import { brushesVersion, useBrushPresets } from './presets';
import { backToHowItCame, resetStick, resetTip, savedBrush } from './partsActions';
import { currentSpec } from '../dab/live';
import { partsOf, type Part, type Parts } from './parts';
import { pixelPartsOf } from './pixelParts';
import { savedPixelBrush } from './partsActions';
import { useDab } from '../dab/settings';
import { useDry } from '../dry/settings';
import './parts.css';

const Undo = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 6.5h6a3 3 0 0 1 0 6H6" />
    <path d="M6 3.5 3.2 6.5 6 9.5" />
  </svg>
);

/** Lights its children's row for a moment when this part has just changed. */
export function LitRow({ part, children }: { part: Part; children: ReactNode }) {
  const flash = useFlash();
  const on = flashHas(flash, part);
  return (
    <div className="bf-box" data-lit={on || undefined}>
      {children}
      {on && <i key={flash.n} className="bf-ring" aria-hidden="true" />}
    </div>
  );
}

/** The top preview with the tag that names what just changed. The tag is words, so it shows with reduced motion too. */
export function PreviewFlash({ children }: { children: ReactNode }) {
  const flash = useFlash();
  return (
    <div className="bf-prev" data-lit={flash.parts.length ? '' : undefined}>
      {children}
      {flash.parts.length > 0 && (
        <>
          <i key={`w${flash.n}`} className="bf-wipe" aria-hidden="true" />
          <span key={`t${flash.n}`} className="bf-tag" role="status">
            {flash.text}
          </span>
        </>
      )}
    </div>
  );
}

function Part({ label, changed, saved, reset, control, resetControl, command, children }: { command: string; label: string; changed: boolean; saved: boolean; reset: () => void; control: string; resetControl: string; children: ReactNode }) {
  return (
    <div className="bp-part" data-changed={changed} data-control={control}>
      <div className="bp-part-head">
        <span className="tp-label">{label}</span>
        {saved && (
          <span className="bp-st" data-on={changed || undefined}>
            {changed && <i aria-hidden="true" />}
            {changed ? 'changed' : 'as it comes'}
            {changed && (
              <button type="button" className="bp-reset" data-control={resetControl} data-command={command} onClick={reset} title={`Put the ${label.toLowerCase()} back as this brush comes`} aria-label={`Put the ${label.toLowerCase()} back`}>
                <Undo />
              </button>
            )}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

interface View {
  parts: Parts;
  /** The name of the saved brush to put things back to, or undefined when there is none (not a saved brush). */
  was: string | undefined;
  tip: boolean;
  stick: { shown: boolean; off: boolean };
  footer: string | null;
}

/** The parts box itself, the same for both sides: a title, Back to how it came, and a row for each part the brush has. */
function PartsView({ parts: p, was, tip, stick, footer }: View) {
  return (
    <section className="bp-parts" data-changed={p.changed} aria-label="Parts of this brush">
      <header className="bp-parts-head">
        <span className="bp-parts-title">Parts of this brush</span>
        {p.changed && (
          <button type="button" className="bp-back" data-control="revert" data-command="brush.backToHowItCame" onClick={() => void backToHowItCame()} title={`Put the tip, the stick and the rest back as ${was} comes`}>
            <Undo />
            Back to how it came
          </button>
        )}
      </header>
      <div className="bp-parts-rows">
        {tip && (
          <Part label="Tip" changed={p.tip} saved={!!was} reset={() => void resetTip()} control="tip-picker" resetControl="reset-tip" command="brush.resetTip">
            <LitRow part="tip">
              <span data-testid="brush-tips" className="tp-row">
                <BrushPicker side="tip" />
              </span>
            </LitRow>
          </Part>
        )}
        {stick.shown && (
          <Part label="Stick" changed={p.stick} saved={!!was} reset={() => void resetStick()} control="stick-picker" resetControl="reset-stick" command="brush.resetStick">
            <LitRow part="stick">
              <span data-testid="brush-stick" className="tp-row">
                <BrushPicker side="stick" disabled={stick.off ? 'Turn on Catch on paper to pick a stick' : undefined} />
              </span>
            </LitRow>
          </Part>
        )}
      </div>
      {footer && <p className="bp-parts-foot">{footer}</p>}
    </section>
  );
}

/** The Tip and the Stick as parts of the vector Brush. `stick` is the Stick row (only for the tips that have one). */
export function PartsBox({ stick, stickOff, paperBelow }: { stick: boolean; stickOff: boolean; paperBelow: boolean }) {
  const live = useStore((s) => s.ui.brush);
  useBrushPresets(brushesVersion);
  const was = savedBrush();
  return <PartsView parts={partsOf(was?.brush, live)} was={was?.name} tip stick={{ shown: stick, off: stickOff }} footer={paperBelow ? 'Paper is the sheet’s, unless this brush keeps its own. Picking a brush leaves the sheet’s as it is.' : null} />;
}

/**
 * The same box for a pixel brush: the Pixel brush has a Tip (Round, Square or Picture), Chalk and charcoal a Stick, Soft paint
 * neither (so it shows no box at all). A Pixel brush's paper is its grain's own, in the Paper group below.
 */
export function PixelPartsBox({ tip, stick }: { tip: boolean; stick: boolean }) {
  useDab((d) => d);
  useDry((d) => d.medium);
  useBrushPresets(brushesVersion);
  const was = savedPixelBrush();
  if (!tip && !stick) return null;
  return <PartsView parts={pixelPartsOf(was?.pixel, currentSpec())} was={was?.name} tip={tip} stick={{ shown: stick, off: false }} footer={null} />;
}
