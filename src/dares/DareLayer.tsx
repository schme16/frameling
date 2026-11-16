// What a dare puts on the screen: the challenge banner, the countdown, and a small chip for each dare that is going,
// with a button to put it back. Everything here is words and shapes laid over the window. It never touches the drawing.
import { useEffect, useState } from 'react';
import { stopDares } from './registry';
import { dareScreen, type Held } from './fx';
import './dares.css';

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

const heldOf = (held: Held[], id: string): Held | undefined => held.find((h) => h.id === id);

export function DareLayer() {
  const screen = dareScreen.use((s) => s);
  // A pen modifier has its own chip (src/penmods), so it does not count here.
  const active = screen.held.some((h) => h.resource !== 'pen');
  const now = useNow(active);
  if (!active && !screen.banner && !screen.countdown) return null;
  const banner = heldOf(screen.held, 'dare.challenge');
  const count = heldOf(screen.held, 'dare.countdown');
  const chips = screen.held.filter((h) => h.resource === 'view' || h.resource === 'colour');
  return (
    <div className="dr-layer" data-testid="dares.layer">
      {screen.banner && (
        <div className="dr-banner" role="status" data-testid="dares.banner">
          <span className="dr-tag">Challenge</span>
          <span className="dr-text">{screen.banner.text}</span>
          {banner && <span className="dr-bar" style={{ transform: `scaleX(${Math.max(0, Math.min(1, (banner.endsAt - now) / (banner.endsAt - banner.startedAt)))})` }} />}
        </div>
      )}
      {screen.countdown && (
        <div className={`dr-count${screen.countdown.over ? ' is-over' : ''}`} role="timer" data-testid="dares.countdown">
          <span className="dr-count-n">{screen.countdown.over ? 'Time!' : count ? secondsLeft(count.endsAt, now) : ''}</span>
          <span className="dr-count-t">{screen.countdown.text}</span>
        </div>
      )}
      {chips.length > 0 && (
        <div className="dr-chips">
          {chips.map((h) => (
            <div className="dr-chip" key={h.resource} data-testid="dares.chip">
              <span className="dr-chip-dot" aria-hidden="true" />
              <span>{h.label}</span>
              <span className="dr-chip-time">{secondsLeft(h.endsAt, now)}s</span>
              <button type="button" className="dr-chip-stop" data-testid="dares.putback" onClick={() => stopDares()}>
                Put it back
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
