import { useEffect } from 'react';
import { Icon } from '../ui/icons';
import { dismissCelebration, feedback } from './feedback';
import { Medal } from './Medal';
import { allQuests, isUnlocked, questProgress, startQuest } from './registry';

// Confetti bits: where each flies to, how far it spins and its colour. Fixed, so the same quest always looks the same.
const COLOURS = ['var(--sunny)', 'var(--rose)', 'var(--grape)', 'var(--sky)', 'var(--mint)'];
const BITS = Array.from({ length: 30 }, (_, i) => {
  const a = (i / 30) * Math.PI * 2 + (i % 3) * 0.2;
  const r = 110 + ((i * 37) % 90);
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r * 0.75 - 30), rot: ((i * 53) % 360) - 180, colour: COLOURS[i % 5], delay: (i % 7) * 20, round: i % 4 === 0 };
});

/** The badge card at the end of a quest. Confetti unless motion is turned down. Never blocks anything. */
export function Celebration() {
  const c = feedback.use((f) => f.celebration);
  const progress = questProgress.use((x) => x);
  useEffect(() => {
    if (!c) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && dismissCelebration();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [c]);
  if (!c) return null;
  const next = allQuests().find((q) => q.id !== c.quest.id && !progress.completed.includes(q.id) && isUnlocked(q, progress));
  return (
    <div className={`qc${c.still ? ' qc-still' : ''}`} role="status" key={c.key}>
      {!c.still && (
        <div className="qc-confetti" aria-hidden="true">
          {BITS.map((b, i) => (
            <i key={i} className={b.round ? 'is-round' : ''} style={{ ['--dx' as string]: `${b.dx}px`, ['--dy' as string]: `${b.dy}px`, ['--rot' as string]: `${b.rot}deg`, background: b.colour, animationDelay: `${b.delay}ms` }} />
          ))}
        </div>
      )}
      {c.badge && <Medal badge={c.badge} size={56} />}
      <div className="qc-text">
        <strong>{c.badge ? `You earned ${c.badge.name}` : 'Quest finished'}</strong>
        <span>{c.quest.finish ?? `You finished ${c.quest.title}.`}</span>
        {next && (
          <button type="button" className="qb-btn qb-go" onClick={() => startQuest(next.id)}>
            Next: {next.title}
          </button>
        )}
      </div>
      <button type="button" className="qb-x" aria-label="Close" title="Close (Esc)" onClick={dismissCelebration}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
