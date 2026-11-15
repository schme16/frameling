// The chip that says a pen modifier is on, what it is doing to the pen, and how long is left, with a button that ends it at
// once. It sits where nobody can miss it, so nobody ever wonders why their pen feels wrong. It never touches the drawing.
import { useEffect, useState } from 'react';
import { dareScreen } from '../dares/fx';
import { Icon } from '../ui/icons';
import { penModById } from './catalogue';
import { stopPenMods } from './registry';
import './penmods.css';

/** Seconds left, rounded up, never below zero. */
export const secondsLeft = (endsAt: number, now: number): number => Math.max(0, Math.ceil((endsAt - now) / 1000));

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function PenModChip() {
  const held = dareScreen.use((s) => s.held.find((h) => h.resource === 'pen') ?? null);
  const now = useNow(!!held);
  if (!held) return null;
  const def = penModById(held.id);
  const left = Math.max(0, Math.min(1, (held.endsAt - now) / (held.endsAt - held.startedAt)));
  return (
    <div className="pm-chip" role="status" data-testid="penmods.chip">
      <Icon name="brush" size={16} />
      <div className="pm-text">
        <strong>{held.label}</strong>
        <span>{def?.feel ?? 'Your pen feels different.'}</span>
      </div>
      <span className="pm-time" data-testid="penmods.time">
        {secondsLeft(held.endsAt, now)}s
      </span>
      <button type="button" className="pm-stop" data-testid="penmods.putback" onClick={() => stopPenMods()}>
        Put it back
      </button>
      <span className="pm-bar" style={{ transform: `scaleX(${left})` }} aria-hidden="true" />
    </div>
  );
}
