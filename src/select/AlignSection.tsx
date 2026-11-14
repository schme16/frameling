// The Align and Space out buttons in the Properties panel, under Position and size. They run the same code as the
// commands in the palette and the Edit menu (align-ops.ts).
import { useState, type ReactNode } from 'react';
import { useStore } from '../core/store';
import { docDpi, toPx, unitInfo } from '../core/units';
import { usePrefs } from '../ui/prefs';
import { Tip } from '../canvas/controls';
import { Section } from '../symbols/Num';
import type { AlignKind, Axis } from './align';
import { alignSelection, alignTargetNow, pickedCount, spreadSelection } from './align-ops';
import { setAlignTo, useAlignTo } from './align-settings';

// Each icon: the bar the shapes line up on, and two bars of different lengths lined up on it. 16 x 16, drawn in currentColor.
const ICONS: Record<AlignKind | Axis, ReactNode> = {
  left: (
    <>
      <path d="M2.5 1.5v13" />
      <rect x="5" y="3.5" width="9" height="3.4" rx="0.8" />
      <rect x="5" y="9.1" width="5.5" height="3.4" rx="0.8" />
    </>
  ),
  centre: (
    <>
      <path d="M8 1.5v13" />
      <rect x="3" y="3.5" width="10" height="3.4" rx="0.8" />
      <rect x="4.8" y="9.1" width="6.4" height="3.4" rx="0.8" />
    </>
  ),
  right: (
    <>
      <path d="M13.5 1.5v13" />
      <rect x="2" y="3.5" width="9" height="3.4" rx="0.8" />
      <rect x="5.5" y="9.1" width="5.5" height="3.4" rx="0.8" />
    </>
  ),
  top: (
    <>
      <path d="M1.5 2.5h13" />
      <rect x="3.5" y="5" width="3.4" height="9" rx="0.8" />
      <rect x="9.1" y="5" width="3.4" height="5.5" rx="0.8" />
    </>
  ),
  middle: (
    <>
      <path d="M1.5 8h13" />
      <rect x="3.5" y="3" width="3.4" height="10" rx="0.8" />
      <rect x="9.1" y="4.8" width="3.4" height="6.4" rx="0.8" />
    </>
  ),
  bottom: (
    <>
      <path d="M1.5 13.5h13" />
      <rect x="3.5" y="2" width="3.4" height="9" rx="0.8" />
      <rect x="9.1" y="5.5" width="3.4" height="5.5" rx="0.8" />
    </>
  ),
  across: (
    <>
      <path d="M1.5 2v12M14.5 2v12" />
      <rect x="5.4" y="4.5" width="5.2" height="7" rx="0.8" />
    </>
  ),
  down: (
    <>
      <path d="M2 1.5h12M2 14.5h12" />
      <rect x="4.5" y="5.4" width="7" height="5.2" rx="0.8" />
    </>
  ),
};

function Glyph({ kind }: { kind: AlignKind | Axis }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[kind]}
    </svg>
  );
}

const ALIGN_BUTTONS: { kind: AlignKind; label: string; tip: string }[] = [
  { kind: 'left', label: 'Align left', tip: 'Line up on the left edges' },
  { kind: 'centre', label: 'Align centre', tip: 'Line up on one middle line, side to side' },
  { kind: 'right', label: 'Align right', tip: 'Line up on the right edges' },
  { kind: 'top', label: 'Align top', tip: 'Line up on the top edges' },
  { kind: 'middle', label: 'Align middle', tip: 'Line up on one middle line, up and down' },
  { kind: 'bottom', label: 'Align bottom', tip: 'Line up on the bottom edges' },
];

export function AlignSection() {
  // Re-read when the selection or the drawing changes.
  useStore((s) => s.doc);
  useStore((s) => s.ui.selection);
  const wanted = useAlignTo();
  const unit = usePrefs((p) => p.units);
  const dpi = useStore((s) => docDpi(s.doc));
  const [gap, setGap] = useState('');
  const n = pickedCount();
  const to = alignTargetNow(wanted);
  const where = to === 'page' ? 'the page' : 'the box round them';
  const gapPx = gap.trim() === '' || !Number.isFinite(Number(gap)) ? null : toPx(Number(gap), unit, dpi);
  return (
    <Section title="Align and space out">
      <div className="al-row" role="group" aria-label="Align">
        {ALIGN_BUTTONS.map((b) => (
          <button key={b.kind} type="button" className="al-btn" aria-label={b.label} data-tip={b.label} data-tip-desc={`${b.tip}, to ${where}.`} onClick={() => void alignSelection(b.kind)}>
            <Glyph kind={b.kind} />
          </button>
        ))}
      </div>
      {n > 1 && (
        <div className="al-to" role="radiogroup" aria-label="Line up to">
          <span>Line up to</span>
          <button type="button" role="radio" aria-checked={wanted === 'selection'} className={`al-pick${wanted === 'selection' ? ' is-on' : ''}`} onClick={() => setAlignTo('selection')} data-tip="Their own box" data-tip-desc="The box round everything you picked.">
            Their box
          </button>
          <button type="button" role="radio" aria-checked={wanted === 'page'} className={`al-pick${wanted === 'page' ? ' is-on' : ''}`} onClick={() => setAlignTo('page')} data-tip="The page" data-tip-desc="The edges and middle of the page.">
            The page
          </button>
        </div>
      )}
      <div className="al-row al-spread" role="group" aria-label="Space out">
        <button type="button" className="al-btn" aria-label="Space out across" data-tip="Space out across" data-tip-desc="Make the gaps between three or more shapes the same, left to right." onClick={() => void spreadSelection('across', gapPx)}>
          <Glyph kind="across" />
        </button>
        <button type="button" className="al-btn" aria-label="Space out down" data-tip="Space out down" data-tip-desc="Make the gaps between three or more shapes the same, top to bottom." onClick={() => void spreadSelection('down', gapPx)}>
          <Glyph kind="down" />
        </button>
        <label className="al-gap" data-tip="Gap" data-tip-desc="Leave this empty to share out the room the shapes already take. Type a number to set the gap between each one exactly.">
          <span>Gap</span>
          <span className="sy-num-box">
            <input type="number" step={unit === 'px' ? 1 : 10 ** -unitInfo(unit).places} value={gap} placeholder="even" aria-label="Gap between shapes" onChange={(e) => setGap(e.target.value)} />
            {unit !== 'px' && <i>{unit}</i>}
          </span>
        </label>
      </div>
      <Tip>{n === 1 ? 'One shape lines up to the page.' : n > 1 ? `Pick three or more shapes to space them out. Lining up goes to ${where}.` : 'Lines up to the page. Spacing out needs three or more shapes.'}</Tip>
    </Section>
  );
}
