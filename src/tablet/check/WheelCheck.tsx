// Preferences > Diagnostics: what your mouse wheel actually reports, and what the canvas would do with it.
//
// A wheel event says how far it turned (deltaY) and in what units (deltaMode: 0 pixels, 1 lines, 2 pages), and
// browsers disagree wildly. Some screens multiply it by the screen scaling, some wheels send many small events
// instead of one big one. The canvas turns all of that into one number (how much the zoom changes), so this shows the
// reading and that number side by side, and nothing has to be guessed at.
import { useRef, useState } from 'react';
import { wheelZoomFactor } from '../../canvas/view';

interface Reading {
  deltaY: number;
  deltaMode: number;
  dpr: number;
  /** Events seen in the last half second: a high-resolution wheel sends a burst where an ordinary one sends one. */
  burst: number;
}

const MODE_WORDS = ['pixels', 'lines', 'pages'];

/** How the canvas reads it: the same call the canvas makes, so this can never drift from the real thing. */
function says(r: Reading): string {
  const f = wheelZoomFactor(-Math.abs(r.deltaY), r.deltaMode, 'normal');
  const pct = Math.round((f - 1) * 100);
  const coarse = wheelZoomFactor(-Math.abs(r.deltaY), r.deltaMode, 'coarse');
  return `+${pct}% a notch (+${Math.round((coarse - 1) * 100)}% with Ctrl held)`;
}

export function WheelCheck() {
  const [seen, setSeen] = useState<Reading | null>(null);
  const recent = useRef<number[]>([]);
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const now = performance.now();
    recent.current = [...recent.current.filter((t) => now - t < 500), now];
    setSeen({ deltaY: e.deltaY, deltaMode: e.deltaMode, dpr: window.devicePixelRatio, burst: recent.current.length });
  };
  return (
    <>
      <p className="ui-pref-intro">Zoom feeling too fast or too slow? Scroll over the box and it shows what your mouse told Frameling, and what the canvas does with it.</p>
      <div className="tb-wheel-check" data-testid="wheel-check" onWheel={onWheel} role="group" aria-label="Scroll here to check your mouse wheel">
        {seen ? (
          <dl className="tb-wheel-read">
            <dt>One notch says</dt>
            <dd data-testid="wheel-delta">
              {seen.deltaY.toFixed(1)} {MODE_WORDS[seen.deltaMode] ?? `mode ${seen.deltaMode}`}
            </dd>
            <dt>Your screen scaling</dt>
            <dd data-testid="wheel-dpr">{seen.dpr}</dd>
            <dt>Events in half a second</dt>
            <dd data-testid="wheel-burst">{seen.burst}</dd>
            <dt>So the canvas zooms</dt>
            <dd data-testid="wheel-zoom">{says(seen)}</dd>
          </dl>
        ) : (
          <p className="tb-wheel-ask">Scroll here</p>
        )}
      </div>
      <p className="tb-note">
        A plain mouse usually says 100 pixels a notch and one event at a time. Many small events in a burst means a high-resolution wheel, which Frameling may be
        mistaking for a trackpad pinch. A screen scaling above 1 can multiply what the mouse says.
      </p>
    </>
  );
}
