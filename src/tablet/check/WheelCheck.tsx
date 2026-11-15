// Preferences > Diagnostics: what your mouse wheel actually reports, and what the canvas would do with it.
//
// A wheel event says how far it turned (deltaY) and in what units (deltaMode: 0 pixels, 1 lines, 2 pages), and
// browsers disagree wildly. Some screens multiply it by the screen scaling, some wheels send many small events
// instead of one big one. The canvas turns all of that into one number (how much the zoom changes), so this shows the
// reading and that number side by side, and nothing has to be guessed at. The last few events are kept, so a
// high-resolution wheel shows up as a run of small ones.
import { useRef, useState } from 'react';
import '../../canvas/choices';
import { currentChoice } from '../../core/choices';
import type { WheelCtrl } from '../../canvas/choices';
import { WheelStream, ZOOM_SPEED_SCALE, type WheelKind, type ZoomSpeed } from '../../canvas/wheelStream';
import { wheelZoomFactor } from '../../canvas/view';

interface Reading {
  deltaY: number;
  deltaMode: number;
  dpr: number;
  ctrl: boolean;
  /** What the canvas counted it as, from the run of events it was part of. */
  kind: WheelKind;
  /** How much the canvas would zoom for it. */
  factor: number;
  /** Events seen in the last quarter second: a high-resolution wheel sends a burst where an ordinary one sends one. */
  burst: number;
}

const MODE_WORDS = ['pixels', 'lines', 'pages'];
/** How many events the readout keeps. */
export const KEEP = 6;

const percent = (f: number): string => `${f >= 1 ? '+' : '-'}${Math.round(Math.abs(f - 1) * 100)}%`;

/** How the canvas reads it: the same calls the canvas makes, so this can never drift from the real thing. */
function says(r: Reading): string {
  const speed = ZOOM_SPEED_SCALE[currentChoice<ZoomSpeed>('canvas.zoomSpeed')];
  const step = (ctrl: boolean) => (ctrl && currentChoice<WheelCtrl>('canvas.wheelCtrl') === 'bigger' ? 'coarse' : 'normal');
  const plain = wheelZoomFactor(-Math.abs(r.deltaY), r.deltaMode, step(false), r.kind, r.dpr, speed);
  const ctrl = wheelZoomFactor(-Math.abs(r.deltaY), r.deltaMode, step(true), r.kind, r.dpr, speed);
  return r.kind === 'pinch' ? `${percent(plain)} for this pinch event` : `${percent(plain)} a notch (${percent(ctrl)} with Ctrl held)`;
}

export function WheelCheck() {
  const [seen, setSeen] = useState<Reading[]>([]);
  const stream = useRef(new WheelStream());
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dpr = window.devicePixelRatio;
    const speed = ZOOM_SPEED_SCALE[currentChoice<ZoomSpeed>('canvas.zoomSpeed')];
    const read = stream.current.read(e, performance.now(), { dpr, speed });
    const r: Reading = { deltaY: e.deltaY, deltaMode: e.deltaMode, dpr, ctrl: e.ctrlKey || e.metaKey, kind: read.kind, factor: read.factor, burst: read.burst };
    setSeen((old) => [r, ...old].slice(0, KEEP));
  };
  const last = seen[0];
  return (
    <>
      <p className="ui-pref-intro">Zoom feeling too fast or too slow? Scroll over the box and it shows what your mouse told Frameling, and what the canvas does with it.</p>
      <div className="tb-wheel-check" data-testid="wheel-check" onWheel={onWheel} role="group" aria-label="Scroll here to check your mouse wheel">
        {last ? (
          <dl className="tb-wheel-read">
            <dt>One notch says</dt>
            <dd data-testid="wheel-delta">
              {last.deltaY.toFixed(1)} {MODE_WORDS[last.deltaMode] ?? `mode ${last.deltaMode}`}
            </dd>
            <dt>Your screen scaling</dt>
            <dd data-testid="wheel-dpr">{last.dpr}</dd>
            <dt>Events in a quarter second</dt>
            <dd data-testid="wheel-burst">{last.burst}</dd>
            <dt>Frameling counts it as</dt>
            <dd data-testid="wheel-kind">{last.kind === 'pinch' ? 'a trackpad pinch' : 'a mouse wheel'}</dd>
            <dt>So the canvas zooms</dt>
            <dd data-testid="wheel-zoom">{says(last)}</dd>
          </dl>
        ) : (
          <p className="tb-wheel-ask">Scroll here</p>
        )}
      </div>
      {seen.length > 1 && (
        <table className="tb-wheel-history" data-testid="wheel-history">
          <thead>
            <tr>
              <th>Says</th>
              <th>Scaling</th>
              <th>Counted as</th>
              <th>Zoom</th>
            </tr>
          </thead>
          <tbody>
            {seen.map((r, i) => (
              <tr key={seen.length - i}>
                <td>
                  {r.deltaY.toFixed(1)} {MODE_WORDS[r.deltaMode] ?? `mode ${r.deltaMode}`}
                  {r.ctrl ? ' (Ctrl)' : ''}
                </td>
                <td>{r.dpr}</td>
                <td>{r.kind === 'pinch' ? 'pinch' : 'wheel'}</td>
                <td>{percent(r.factor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="tb-note">
        A plain mouse usually says 100 pixels a notch and one event at a time. Many small events in a burst means a high-resolution wheel, and Frameling
        zooms those by how far the wheel turned in all, the same as one notch. A screen scaling above 1 can multiply what the mouse says; Frameling divides it
        back out. If it still feels too fast or too slow, change <b>Wheel zoom speed</b> in Preferences &gt; Behaviour.
      </p>
    </>
  );
}
