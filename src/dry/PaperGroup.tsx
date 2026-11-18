// The Paper group: one control for the paper, the same in every tool that catches on it (chalk and charcoal, the pixel
// brush with grain on, a chalk or charcoal tip that catches on paper). The paper is the sheet's: picking one here picks it
// for all of them. A brush, vector or pixel, can keep a paper of its own, and the group says so in words, never only by a
// colour. A brush that keeps one counts it as a part of the brush (`part`): as it comes, or changed, with a small reset.
import type { ReactNode } from 'react';
import { ActionButton, Tip, Toggle } from '../canvas/controls';
import { withChoice } from '../core/choices';
import { PAPER_PINNED_CHOICE } from './choices';
import { paperInfo, type PaperKind } from './paper';
import { PaperPicker } from './PaperPicker';
import { paperNow, paperSaid, pickNeedsAnswer, pickPaper } from './sheet';
import { getDry, setPaper, useDry } from './settings';
import './paperGroup.css';

interface Props {
  /** The paper this brush keeps for itself, when it has one. */
  own?: PaperKind;
  /** Where a brush can keep its own paper: sets it, or clears it to follow the sheet again. */
  onOwn?: (paper: PaperKind | undefined) => void;
  /** The switch for a tool that can catch on paper or not. Without it the paper is always on. */
  toggle?: { checked: boolean; onChange: (on: boolean) => void; hint?: string };
  /** The sliders that go with the paper (how much it catches, how big the grain is). */
  children?: ReactNode;
  /** What shows in the box while the switch is off, for a tool whose grain still works without paper. */
  off?: ReactNode;
  /** Extra words under the paper choice, for what is particular to the tool. */
  tip?: string;
  /** The paper as a part of a saved brush: whether there is a saved brush to compare with, whether the paper differs from it, and how to put it back. */
  part?: { saved: boolean; changed: boolean; reset: () => void };
}

export function PaperGroup({ own, onOwn, toggle, children, off, tip, part }: Props) {
  const sheet = useDry((s) => s.paper);
  const open = !toggle || toggle.checked;
  const now = paperNow(sheet, own);

  const pick = (picked: PaperKind) => {
    const before = { sheet: getDry().paper, own };
    const apply = (where: 'sheet' | 'brush') => {
      const next = pickPaper(before, picked, where);
      if (next.sheet !== getDry().paper) setPaper(next.sheet);
      if (onOwn && next.own !== before.own) onOwn(next.own);
    };
    if (onOwn && pickNeedsAnswer(before, picked)) {
      withChoice<'brush' | 'sheet'>(PAPER_PINNED_CHOICE, apply, {
        gently: {
          undo: () => {
            setPaper(before.sheet);
            onOwn(before.own);
          },
        },
      });
    } else apply('sheet');
  };

  return (
    <section className="pg" aria-label="Paper" data-testid="paper-group" data-control="paper" data-source={open ? now.source : 'off'}>
      <header className="pg-head">
        <span className="pg-title">Paper</span>
        {open && (
          <span className="pg-now" data-source={now.source}>
            {paperInfo(now.paper).label}, {now.source === 'sheet' ? 'the sheet’s' : 'this brush’s own'}
          </span>
        )}
        {part?.saved && own !== undefined && (
          <span className="bp-st" data-on={part.changed || undefined}>
            {part.changed && <i aria-hidden="true" />}
            {part.changed ? 'changed' : 'as it comes'}
            {part.changed && (
              <button type="button" className="bp-reset" data-control="reset-paper" data-command="brush.resetPaper" onClick={part.reset} title="Put the paper back as this brush comes" aria-label="Put the paper back as this brush comes">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3.5 6.5h6a3 3 0 0 1 0 6H6" />
                  <path d="M6 3.5 3.2 6.5 6 9.5" />
                </svg>
              </button>
            )}
          </span>
        )}
      </header>
      {toggle && <Toggle control="catch-on-paper" label="Catch on paper" checked={toggle.checked} onChange={toggle.onChange} hint={toggle.hint} />}
      {open && (
        <>
          <PaperPicker value={now.paper} onPick={pick} />
          <Tip>{`${paperInfo(now.paper).hint} ${tip ?? ''}`.trim()}</Tip>
          <Tip stays={now.source === 'brush'}>{paperSaid(now, sheet)}</Tip>
          {onOwn && now.source === 'brush' && <ActionButton control="paper-keep" onClick={() => onOwn(undefined)} title="Let this brush use the sheet's paper again">Use the sheet&rsquo;s paper</ActionButton>}
          {onOwn && now.source === 'sheet' && (
            <ActionButton control="paper-keep" onClick={() => onOwn(sheet)} title="Keep this brush on this paper, even when you change the sheet">
              Keep this brush on {paperInfo(sheet).label}
            </ActionButton>
          )}
          {children}
        </>
      )}
      {!open && off}
    </section>
  );
}
