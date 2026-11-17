// The Paper group: one control for the paper, the same in every tool that catches on it (chalk and charcoal, the pixel
// brush with grain on, a chalk or charcoal tip that catches on paper). The paper is the sheet's: picking one here picks it
// for all of them. A pixel brush can keep a paper of its own, and the group says so in words, never only by a colour.
import { useRef, type ReactNode } from 'react';
import { ActionButton, Tip, Toggle } from '../canvas/controls';
import { withChoice } from '../core/choices';
import { useStackWhenTight } from '../ui/fitRow';
import { PAPER_PINNED_CHOICE } from './choices';
import { PAPERS, paperInfo, type PaperKind } from './paper';
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
}

export function PaperGroup({ own, onOwn, toggle, children, off, tip }: Props) {
  const sheet = useDry((s) => s.paper);
  const row = useRef<HTMLDivElement>(null);
  const open = !toggle || toggle.checked;
  useStackWhenTight(row, [open]);
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
    <section className="pg" aria-label="Paper" data-testid="paper-group" data-source={open ? now.source : 'off'}>
      <header className="pg-head">
        <span className="pg-title">Paper</span>
        {open && (
          <span className="pg-now" data-source={now.source}>
            {paperInfo(now.paper).label}, {now.source === 'sheet' ? 'the sheet’s' : 'this brush’s own'}
          </span>
        )}
      </header>
      {toggle && <Toggle label="Catch on paper" checked={toggle.checked} onChange={toggle.onChange} hint={toggle.hint} />}
      {open && (
        <>
          <div className="cv-choice" role="radiogroup" aria-label="Paper" ref={row}>
            {PAPERS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={p.id === now.paper} className="cv-choice-btn" data-on={p.id === now.paper} title={p.hint} onClick={() => pick(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <Tip>{`${paperInfo(now.paper).hint} ${tip ?? ''}`.trim()}</Tip>
          <Tip stays={now.source === 'brush'}>{paperSaid(now, sheet)}</Tip>
          {onOwn && now.source === 'brush' && <ActionButton onClick={() => onOwn(undefined)} title="Let this brush use the sheet's paper again">Use the sheet&rsquo;s paper</ActionButton>}
          {onOwn && now.source === 'sheet' && (
            <ActionButton onClick={() => onOwn(sheet)} title="Keep this brush on this paper, even when you change the sheet">
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
