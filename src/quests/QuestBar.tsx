import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../ui/icons';
import { QuillSays } from '../ui/mascot';
import { stepScript } from '../ui/mascot/scripts';
import { openHelp } from '../ui/overlays';
import { engine, putDownQuest } from './runtime';
import { feedback } from './feedback';
import { getQuest, questProgress } from './registry';
import { resolveTarget } from './target';

/** The small guide bar, bottom-left above the status bar: what to do now, how far along, Skip and Show me. */
export function QuestBar() {
  const p = questProgress.use((x) => x);
  const praise = feedback.use((f) => f.praise);
  const quest = p.active ? getQuest(p.active) : undefined;
  const step = quest?.steps[p.step];
  const ref = useRef<HTMLElement>(null);
  const [side, setSide] = useState<'left' | 'right'>('left');

  // Quill presents the step: a cheer when the last one was just done, talk, point at the ring, then idle.
  const [cheerKey, setCheerKey] = useState(0);
  useEffect(() => {
    if (praise) setCheerKey(praise.key);
  }, [praise?.key]);
  const script = useMemo(
    () => (step ? stepScript(step.say, { cheer: !!praise, pointing: !!resolveTarget(step.target), hint: p.hint && !!step.hint }) : []),
    [quest?.id, step?.id, cheerKey, p.hint],
  );

  // If the thing being pointed at sits where the bar is, hop to the other corner.
  useEffect(() => {
    if (!step) return;
    const look = () => {
      const bar = ref.current?.getBoundingClientRect();
      const el = resolveTarget(step.target);
      if (!bar || !el) return;
      const t = el.getBoundingClientRect();
      const hit = t.left < bar.right && t.right > bar.left && t.top < bar.bottom && t.bottom > bar.top;
      if (hit) setSide((s) => (s === 'left' ? 'right' : 'left'));
    };
    look();
    const every = setInterval(look, 600);
    return () => clearInterval(every);
  }, [quest?.id, step?.id]);

  if (!quest || !step) return null;
  const last = p.step === quest.steps.length - 1;
  return (
    <section ref={ref} className={`qb qb-${side}`} role="region" aria-label={`Quest: ${quest.title}`} data-quest="bar">
      {praise && (
        <span className="qb-praise" key={praise.key} role="status">
          <Icon name="check" size={14} /> {praise.text}
        </span>
      )}
      <header className="qb-head">
        <span className="qb-icon">
          <Icon name={quest.icon} size={16} />
        </span>
        <span className="qb-title">{quest.title}</span>
        <span className="qb-count">
          Step {p.step + 1} of {quest.steps.length}
        </span>
        <button type="button" className="qb-x" aria-label="Put this quest down for now" title="Put this quest down for now. You can pick it up again from the Quests panel." onClick={putDownQuest}>
          <Icon name="close" size={14} />
        </button>
      </header>
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
            <Icon name="sparkle" size={14} /> Show me
          </button>
        )}
      </footer>
    </section>
  );
}
