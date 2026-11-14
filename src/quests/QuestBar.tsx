import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../ui/icons';
import { QuillSays, useShowQuill } from '../ui/mascot';
import { stepScript } from '../ui/mascot/scripts';
import { openHelp } from '../ui/overlays';
import { engine, putDownQuest } from './runtime';
import { clearPraise, feedback } from './feedback';
import { getFullQuest, questProgress } from './registry';
import { cardForQuest, cardForStep, cardState, peekCard, pinCard, tuckCard, unpinCard } from './cardState';
import { pointerNear, placeCard, type Box, type Place, type Spot } from './place';
import { isCoveredByDialog, resolveTarget } from './target';

/** The drawing area: the card never covers it. */
const CANVAS = '.cv-root';
/** The card's widths, widest first, and the small bar it tucks down to. */
const WIDE = 420;
const NARROW = 320;
const BAR = { w: 270, h: 40 };
const MOVE_STEP = 24;

const boxOf = (el: Element | null): Box | null => {
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) } : null;
};
const same = (a: Place | null, b: Place) => !!a && a.left === b.left && a.top === b.top && a.w === b.w && a.mode === b.mode && a.size === b.size && a.covers === b.covers;

/** The room the card keeps to: below the menu bar, above the status bar. */
function insets() {
  const bar = document.querySelector('.ui-menubar')?.getBoundingClientRect();
  const status = document.querySelector('.ui-status')?.getBoundingClientRect();
  return { top: bar && bar.bottom > 0 ? Math.round(bar.bottom) + 8 : 44, bottom: status && status.height > 0 ? Math.round(window.innerHeight - status.top) + 8 : 36 };
}

/** The small guide bar, bottom-left above the status bar: what to do now, how far along, Skip and Show me. */
export function QuestBar() {
  const p = questProgress.use((x) => x);
  const praise = feedback.use((f) => f.praise);
  const quillOn = useShowQuill();
  const cs = cardState.use((x) => x);
  const quest = p.active ? getFullQuest(p.active) : undefined;
  const step = quest?.steps[p.step];
  const ref = useRef<HTMLElement>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const placed = useRef<Place | null>(null);
  const [drag, setDrag] = useState<Spot | null>(null);
  const [faded, setFaded] = useState(false);
  // The card's measured height at each width it has been shown at, for this step's words; and what it points at.
  const heights = useRef(new Map<number, number>());
  const seen = useRef<{ target: Box | null; canvas: Box | null; noRoom: boolean }>({ target: null, canvas: null, noRoom: false });

  // Quill presents the step: a cheer when the last one was just done, talk, point at the ring, then idle.
  const [cheerKey, setCheerKey] = useState(0);
  useEffect(() => {
    if (praise) setCheerKey(praise.key);
  }, [praise?.key]);
  const script = useMemo(
    () => (step ? stepScript(step.say, { cheer: !!praise, pointing: !!resolveTarget(step.target), hint: p.hint && !!step.hint }) : []),
    [quest?.id, step?.id, cheerKey, p.hint],
  );

  // A different quest starts with a fresh card; a new step brings a tucked card back.
  useEffect(() => cardForQuest(quest?.id ?? null), [quest?.id]);
  useEffect(() => cardForStep(), [step?.id, praise?.key]);

  // Measure what the step points at and the canvas, and put the card in the biggest free place near the target. It looks
  // again when the window changes and every moment, but only moves when its place is no longer good.
  useLayoutEffect(() => {
    if (!step) return;
    heights.current.clear();
    const look = () => {
      const card = ref.current;
      if (!card) return;
      const view = { w: window.innerWidth, h: window.innerHeight };
      const cur = placed.current;
      if (cur?.mode === 'card' && card.offsetHeight > 0) heights.current.set(cur.w, card.offsetHeight);
      const known = [...heights.current.entries()][0];
      const heightAt = (w: number) => heights.current.get(w) ?? (known ? Math.round(known[1] * (1 + 0.55 * (known[0] / w - 1))) : 220);
      const wide = Math.min(WIDE, view.w - 24);
      const widths = wide > NARROW ? [wide, NARROW] : [wide];
      const el = resolveTarget(step.target);
      const target = el && !isCoveredByDialog(el) ? boxOf(el) : null;
      const canvas = boxOf(document.querySelector(CANVAS));
      const st = cardState.get();
      const input = { view, insets: insets(), sizes: widths.map((w) => ({ w, h: heightAt(w) })), bar: BAR, target, avoid: canvas ? [canvas] : [], current: cur, pinned: st.pinned };
      seen.current = { target, canvas, noRoom: placeCard({ ...input, pinned: null }).mode === 'bar' };
      const next = placeCard({ ...input, tucked: st.tucked, peek: st.peek });
      if (!same(cur, next)) {
        placed.current = next;
        setPlace(next);
      } else if (cur && (cur.h !== next.h || cur.covers !== next.covers)) placed.current = next;
    };
    look();
    const every = setInterval(look, 300);
    const off = cardState.subscribe(look);
    window.addEventListener('resize', look);
    return () => {
      clearInterval(every);
      off();
      window.removeEventListener('resize', look);
    };
  }, [quest?.id, step?.id, praise?.key, p.hint]);

  // When there is no room and the card sits over something, it fades while the pointer is near what it covers.
  const covers = place?.covers && place.mode === 'card';
  useEffect(() => {
    if (!covers) return setFaded(false);
    const move = (e: PointerEvent) => {
      const c = ref.current?.getBoundingClientRect();
      const over = [seen.current.target, seen.current.canvas].filter((b): b is Box => !!b && !!c && c.left < b.right && c.right > b.left && c.top < b.bottom && c.bottom > b.top);
      setFaded(over.some((b) => pointerNear(b, { left: e.clientX, top: e.clientY }, 40)));
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [covers]);

  // Drag the card by its header. The place is kept for the rest of the quest.
  const grab = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !place || (e.target as HTMLElement).closest('button')) return;
    const from = { x: e.clientX, y: e.clientY, left: place.left, top: place.top };
    const at = (ev: PointerEvent): Spot => ({
      left: Math.min(Math.max(4, from.left + ev.clientX - from.x), Math.max(4, window.innerWidth - place.w - 4)),
      top: Math.min(Math.max(4, from.top + ev.clientY - from.y), Math.max(4, window.innerHeight - place.h - 4)),
    });
    let last: Spot = { left: from.left, top: from.top };
    const move = (ev: PointerEvent) => setDrag((last = at(ev)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (last.left !== from.left || last.top !== from.top) pinCard(last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    e.preventDefault();
  };
  // The same from the keyboard: arrows nudge it (Shift for bigger steps), Home lets it find its own place again.
  const nudge = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!place || e.target !== e.currentTarget) return;
    if (e.key === 'Home') return void (e.preventDefault(), unpinCard());
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const k = MOVE_STEP * (e.shiftKey ? 4 : 1);
    pinCard({ left: Math.min(Math.max(4, place.left + d[0] * k), Math.max(4, window.innerWidth - place.w - 4)), top: Math.min(Math.max(4, place.top + d[1] * k), Math.max(4, window.innerHeight - place.h - 4)) });
  };
  const at = drag ?? place;
  const style: React.CSSProperties = at ? { left: at.left, top: at.top, width: place?.w } : { visibility: 'hidden' };
  const cls = `qb${drag ? ' is-dragging' : ''}${faded ? ' is-faded' : ''}${place?.mode === 'bar' ? ' qb-tucked' : ''}`;

  if (!quest || !step) return null;
  // The small bar: the card put out of the way, or too big for the room there is. One press brings it back.
  if (place?.mode === 'bar') {
    const open = () => (cs.tucked && !seen.current.noRoom ? tuckCard(false) : cardState.set((s) => ({ ...s, tucked: false, peek: true })));
    return (
      <section ref={ref} className={cls} style={style} role="region" aria-label={`Quest: ${quest.title}`} data-quest="bar" data-card="bar">
        <header className="qb-head" onPointerDown={grab} onKeyDown={nudge} onDoubleClick={unpinCard} tabIndex={0} aria-label="Quest bar. Arrow keys move it, Home puts it back." title="Drag to move this. Double-click to put it back where it likes.">
          <span className="qb-icon">
            <Icon name={quest.icon} size={16} />
          </span>
          <span className="qb-title">{quest.title}</span>
          <span className="qb-count">
            {p.step + 1} of {quest.steps.length}
          </span>
          <button type="button" className="qb-tuck" aria-label="Open the quest card" title={seen.current.noRoom ? 'There is not much room, so the card will sit over the page for a moment.' : 'Bring the card back'} onClick={open}>
            <Icon name="chevron-up" size={14} />
          </button>
        </header>
      </section>
    );
  }
  const last = p.step === quest.steps.length - 1;
  // The Great work card: what you just did, and a Next button to carry on. The next step waits behind it. A step
  // without words of its own still gets a card, counting off where you are.
  const card = praise;
  const didWords = praise?.did ?? `That's step ${p.step} of ${quest.steps.length} done.`;
  return (
    <section ref={ref} className={cls} style={style} role="region" aria-label={`Quest: ${quest.title}`} data-quest="bar" data-card="card">
      <header className="qb-head" onPointerDown={grab} onKeyDown={nudge} onDoubleClick={unpinCard} tabIndex={0} aria-label="Quest card. Arrow keys move it, Home puts it back." title="Drag to move this. Double-click to put it back where it likes.">
        <span className="qb-icon">
          <Icon name={quest.icon} size={16} />
        </span>
        <span className="qb-title">{quest.title}</span>
        <span className="qb-count">
          Step {p.step + 1} of {quest.steps.length}
        </span>
        <button type="button" className="qb-tuck" aria-label="Tuck the card away for a moment" title="Tuck the card away for a moment, and bring it back with one press" onClick={() => (seen.current.noRoom ? peekCard(false) : tuckCard(true))}>
          <Icon name="chevron-down" size={14} />
        </button>
        <button type="button" className="qb-x" aria-label="Put this quest down for now" title="Put this quest down for now. You can pick it up again from the Quests panel." onClick={putDownQuest}>
          <Icon name="close" size={14} />
        </button>
      </header>
      {card ? (
        <div className="qb-card" key={card.key}>
          <QuillSays anim={script} size={96} className="qb-quill">
            <p className="qb-say" aria-live="polite">
              <b className="qb-great">{quillOn ? card.text : 'Great work!'}</b> {didWords}
            </p>
          </QuillSays>
          <footer className="qb-foot">
            <span className="qb-dots" role="img" aria-label={`${p.step} of ${quest.steps.length} steps done`}>
              {quest.steps.map((s, i) => (
                <i key={s.id} className={i < p.step ? 'is-done' : i === p.step ? 'is-now' : ''} />
              ))}
            </span>
            <span className="qb-grow" />
            <button type="button" className="qb-btn qb-go" onClick={clearPraise} autoFocus>
              Next
            </button>
          </footer>
        </div>
      ) : (
      <>
      <QuillSays anim={script} size={96} className="qb-quill">
        <p className="qb-say" aria-live="polite">
          {step.say}
        </p>
      </QuillSays>
      {step.why && <p className="qb-why">{step.why}</p>}
      {p.hint && step.hint && (
        <p className="qb-hint" role="note">
          <Icon name="info" size={14} /> {step.hint}
        </p>
      )}
      <footer className="qb-foot">
        <span className="qb-dots" role="img" aria-label={`${p.step} of ${quest.steps.length} steps done`}>
          {quest.steps.map((s, i) => (
            <i key={s.id} className={i < p.step ? 'is-done' : i === p.step ? 'is-now' : ''} />
          ))}
        </span>
        <span className="qb-grow" />
        {p.step > 0 && (
          <button type="button" className="qb-btn qb-quiet" onClick={() => engine.back()} title="Go back a step and try it again">
            Back
          </button>
        )}
        {step.help && (
          <button type="button" className="qb-btn qb-quiet" onClick={() => openHelp(step.help)}>
            Tell me more
          </button>
        )}
        <button type="button" className="qb-btn qb-quiet" onClick={() => (step.done ? engine.skip() : engine.next())} title={last ? 'Leave the quest here' : 'Skip this step'}>
          {last ? 'Not now' : 'Skip'}
        </button>
        {step.show && (
          <button type="button" className="qb-btn qb-go" onClick={() => void engine.showMe()} title="I will do this step for you">
            <Icon name="show-me" size={14} /> Show me
          </button>
        )}
      </footer>
      </>
      )}
    </section>
  );
}
