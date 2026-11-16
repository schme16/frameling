// Preferences > Diagnostics: what your mouse wheel actually reports, and what the canvas would do with it.
//
// A wheel event says how far it turned (deltaY) and in what units (deltaMode: 0 pixels, 1 lines, 2 pages), and
// browsers disagree wildly. Some screens multiply it by the screen scaling, some wheels call a notch 45 where most say
// 100, some send many small events instead of one big one. The canvas turns all of that into one number (how much the
// zoom changes), so this shows the reading and that number side by side, and nothing has to be guessed at. The last
// few events are kept, so a high-resolution wheel shows up as a run of small ones. Ctrl, Alt and Shift never change
// what the mouse says; they change how far the canvas zooms for it, so each event is shown with the step it really got.
import { useRef, useState } from 'react';
import '../../canvas/choices';
import { currentChoice } from '../../core/choices';
import type { WheelCtrl, WheelMode } from '../../canvas/choices';
import { wheelIntent, zoomStep, type ZoomStep } from '../../canvas/input';
import { isUnusualNotch, sharedNotch, DEFAULT_NOTCH } from '../../canvas/wheelNotch';
import { WheelStream, ZOOM_SPEED_SCALE, type WheelKind, type ZoomSpeed } from '../../canvas/wheelStream';
import { wheelZoomFactor } from '../../canvas/view';

interface Reading {
  deltaY: number;
  deltaMode: number;
  dpr: number;
  ctrl: boolean;
  /** Whether the canvas zooms for it, or slides the page (the wheel set to scroll, no Ctrl). */
  zooms: boolean;
  /** The step size the canvas gave it: Ctrl, Alt and Shift change this, never what the mouse says. */
  step: ZoomStep;
  /** How many pixels this wheel says for one notch, as learned. */
  notch: number;
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
  if (!r.zooms) return 'nothing, it slides the page (hold Ctrl to zoom)';
  const speed = ZOOM_SPEED_SCALE[currentChoice<ZoomSpeed>('canvas.zoomSpeed')];
  const mode = currentChoice<WheelMode>('canvas.wheel');
  const ctrlChoice = currentChoice<WheelCtrl>('canvas.wheelCtrl');
  const hand = { deltaX: 0, deltaY: 0, deltaMode: 0, altKey: false, shiftKey: false, metaKey: false };
  // One whole notch of this wheel, plain and with Ctrl held.
  const notch = (ctrlKey: boolean) => wheelZoomFactor(-r.notch, 0, zoomStep({ ...hand, ctrlKey }, mode, ctrlChoice), r.kind, 1, speed, r.notch);
  return r.kind === 'pinch' ? `${percent(r.factor)} for this pinch event` : `${percent(notch(false))} a notch (${percent(notch(true))} with Ctrl held)`;
}

/** What Ctrl did, in words: it never changes what the mouse says. */
function ctrlWords(r: Reading): string {
  if (!r.ctrl) return 'No';
  return r.step === 'coarse' ? 'Yes: the mouse says the same, but Frameling takes a bigger step' : 'Yes: the mouse says the same, and Frameling zooms the same';
}

export function WheelCheck() {
  const [seen, setSeen] = useState<Reading[]>([]);
  const stream = useRef(new WheelStream(sharedNotch()));
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dpr = window.devicePixelRatio;
    const speed = ZOOM_SPEED_SCALE[currentChoice<ZoomSpeed>('canvas.zoomSpeed')];
    // The step comes from the same call the canvas makes, so Ctrl and Alt count here just as they do there.
    const intent = wheelIntent(e, currentChoice<WheelMode>('canvas.wheel'), currentChoice<WheelCtrl>('canvas.wheelCtrl'));
    const step: ZoomStep = intent.kind === 'zoom' ? intent.step : 'normal';
    const read = stream.current.read(e, performance.now(), { step, dpr, speed });
    const r: Reading = {
      deltaY: e.deltaY, deltaMode: e.deltaMode, dpr, ctrl: e.ctrlKey || e.metaKey, zooms: intent.kind === 'zoom', step,
      notch: read.notch, kind: read.kind, factor: read.factor, burst: read.burst,
    };
    setSeen((old) => [r, ...old].slice(0, KEEP));
  };
  const last = seen[0];
  return (
    <>
      <p className="ui-pref-intro">Zoom feeling too fast or too slow? Scroll over the box and it shows what your mouse told Frameling, and what the canvas does with it.</p>
      <div className="tb-wheel-check" data-testid="wheel-check" onWheel={onWheel} role="group" aria-label="Scroll here to check your mouse wheel">
        {last ? (
          <dl className="tb-wheel-read">
            <dt>Your last scroll says</dt>
            <dd data-testid="wheel-delta">
              {last.deltaY.toFixed(1)} {MODE_WORDS[last.deltaMode] ?? `mode ${last.deltaMode}`}
            </dd>
            <dt>Ctrl held</dt>
            <dd data-testid="wheel-ctrl">{ctrlWords(last)}</dd>
            <dt>Your screen scaling</dt>
            <dd data-testid="wheel-dpr">{last.dpr}</dd>
            <dt>Frameling takes a notch to be</dt>
            <dd data-testid="wheel-notch">{last.notch} pixels{isUnusualNotch(last.notch) ? ` (the usual is ${DEFAULT_NOTCH})` : ''}</dd>
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
      {last && isUnusualNotch(last.notch) && (
        <p className="tb-note" data-testid="wheel-unusual">
          Your wheel is not the usual kind. Most say {DEFAULT_NOTCH} pixels a notch and yours says {last.notch}, so Frameling counts {last.notch} as one notch and
          zooms the same quarter for it as for any other mouse.
        </p>
      )}
      {seen.length > 1 && (
        <table className="tb-wheel-history" data-testid="wheel-history">
          <thead>
            <tr>
              <th>Says</th>
              <th>Step</th>
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
                <td>{r.zooms ? r.step : 'slides'}</td>
                <td>{r.dpr}</td>
                <td>{r.kind === 'pinch' ? 'pinch' : 'wheel'}</td>
                <td>{r.zooms ? percent(r.factor) : 'none'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="tb-note">
        A plain mouse usually says 100 pixels a notch and one event at a time. Frameling watches your wheel and works out what one notch says on it, so a
        notch zooms about a quarter whichever mouse you have. Many small events in a burst means a high-resolution wheel, and those add up by how far the
        wheel turned in all. A screen scaling above 1 can multiply what the mouse says; Frameling divides it back out. Ctrl never changes what the mouse says,
        only the size of the step (see <b>Ctrl with the wheel</b>). If it still feels too fast or too slow, change <b>Wheel zoom speed</b> in Preferences
        &gt; Behaviour.
      </p>
    </>
  );
}
