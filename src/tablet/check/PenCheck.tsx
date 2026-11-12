// Quill's pen check: a dialog that asks for one thing at a time (hover, press, lean, twist, flip, the buttons, a fast
// scribble, express keys), ticks each off as it sees it, then saves a report file for whoever is fixing pen support.
// The notebook is recorder.ts, the flow is state.ts, and this is only what is on screen.
import { useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { QuillSays, type QuillAnim } from '../../ui/mascot';
import { line, lines } from '../../ui/mascot/lines';
import { Modal } from '../../ui/Modal';
import { toast } from '../../ui/toast';
import { overlays } from '../../ui/overlays';
import { getPen } from '../settings';
import { CHECK_STEPS, CheckRecorder, type CheckStepId, type PenSample } from './recorder';
import { checkMemory, closePenCheck, gatherEnv, reduceCheck, saveReport, setCheckMemory, startFlow } from './state';
import '../tablet.css';

const STEP_TITLE: Record<CheckStepId, string> = {
  hover: 'Hover',
  pressure: 'Press',
  tilt: 'Lean',
  twist: 'Twist',
  eraser: 'Eraser end',
  barrel1: 'Button nearest the tip',
  barrel2: 'Other button',
  scribble: 'Fast scribble',
  keys: 'Express keys and ring',
};

/** Quill's words for each step. */
function stepSays(id: CheckStepId): string {
  switch (id) {
    case 'hover':
      return line('pen.check.step.hover');
    case 'pressure':
      return line('pen.check.step.pressure');
    case 'tilt':
      return line('pen.check.step.tilt');
    case 'twist':
      return line('pen.check.step.twist');
    case 'eraser':
      return line('pen.check.step.eraser');
    case 'barrel1':
      return line('pen.check.step.barrel1');
    case 'barrel2':
      return line('pen.check.step.barrel2');
    case 'scribble':
      return line('pen.check.step.scribble');
    case 'keys':
      return line('pen.check.step.keys');
  }
}

/** The parts of a pointer event the notebook reads. */
export function sampleOf(e: PointerEvent): PenSample {
  const x = e as PointerEvent & { altitudeAngle?: number; azimuthAngle?: number; tangentialPressure?: number };
  return {
    type: e.type,
    pointerType: e.pointerType,
    pointerId: e.pointerId,
    pressure: e.pressure,
    button: e.button,
    buttons: e.buttons,
    tiltX: e.tiltX,
    tiltY: e.tiltY,
    twist: e.twist,
    altitudeAngle: x.altitudeAngle,
    azimuthAngle: x.azimuthAngle,
    tangentialPressure: x.tangentialPressure,
    width: e.width,
    height: e.height,
    timeStamp: e.timeStamp,
    clientX: e.clientX,
    clientY: e.clientY,
  };
}

const pick = (xs: string[], n: number) => xs[n % xs.length];

export function PenCheck() {
  const mode = overlays.use((o) => o.penCheck);
  if (!mode) return null;
  return <Check start={mode} />;
}

function Check({ start }: { start: 'offer' | 'run' }) {
  const [flow, dispatch] = useReducer(reduceCheck, start, (m) => startFlow(m));
  const rec = useRef<CheckRecorder>(null as unknown as CheckRecorder);
  // Which step is on, kept in step with the notebook right away: events can come faster than React redraws.
  const stepRef = useRef(start === 'run' ? 0 : -1);
  if (!rec.current) {
    rec.current = new CheckRecorder(getPen().pen);
    if (start === 'run') rec.current.start(CHECK_STEPS[0]);
  }
  const finished = useRef(false);
  const [says, setSays] = useState(() => (start === 'offer' ? line('pen.check.offer') : `${line('pen.check.hello')} ${stepSays('hover')}`));
  const [mood, setMood] = useState<QuillAnim>('talk');
  const [live, setLive] = useState('');
  const cheers = useMemo(() => lines('pen.check.got'), []);
  const cheerN = useRef(0);
  const padRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const stepStarted = useRef(0);
  const nopenSaid = useRef(false);

  const stepId = flow.phase === 'run' ? CHECK_STEPS[flow.step] : null;

  // A new step: Quill points at the pad, and the clock for the "I can't hear a pen" hint starts over.
  useEffect(() => {
    if (!stepId) return;
    stepStarted.current = performance.now();
    nopenSaid.current = false;
    setMood('point');
  }, [stepId]);

  // Express keys and a touch ring talk to the page as keys and scrolls.
  useEffect(() => {
    if (stepId !== 'keys') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') return;
      rec.current.key(e.key, e.code);
      afterEvent();
    };
    const onWheel = () => {
      rec.current.wheel();
      afterEvent();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: true });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', onWheel, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  // Only mouse or finger events for a while: say so.
  useEffect(() => {
    if (!stepId) return;
    const t = setInterval(() => {
      const s = rec.current.now();
      if (!nopenSaid.current && s && !rec.current.sawPen() && s.other > 3 && performance.now() - stepStarted.current > 8000) {
        nopenSaid.current = true;
        setSays(line('pen.check.nopen'));
        setMood('oops');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [stepId]);

  function afterEvent(): void {
    const i = stepRef.current;
    const id = CHECK_STEPS[i];
    if (!id || !rec.current.currentDone()) return;
    rec.current.finish(id, 'done');
    dispatch({ type: 'stepDone', id });
    stepRef.current = i + 1;
    const next = CHECK_STEPS[i + 1];
    if (next) rec.current.start(next);
    cheerN.current++;
    setSays(`${pick(cheers, cheerN.current)} ${next ? stepSays(next) : line('pen.check.save')}`);
    setMood('cheer');
  }

  const draw = (e: PointerEvent, drawing: boolean) => {
    const c = padRef.current;
    if (!c || e.pointerType !== 'pen') return;
    const r = c.getBoundingClientRect();
    const k = r.width ? c.width / r.width : 1;
    const x = (e.clientX - r.left) * k;
    const y = (e.clientY - r.top) * k;
    const g = c.getContext('2d');
    if (g && drawing) {
      g.lineCap = 'round';
      g.strokeStyle = getComputedStyle(c).getPropertyValue('--accent') || '#9b7bff';
      g.globalCompositeOperation = (e.buttons & 32) !== 0 || e.button === 5 ? 'destination-out' : 'source-over';
      g.lineWidth = (2 + 14 * e.pressure) * k;
      g.beginPath();
      const from = last.current ?? { x, y };
      g.moveTo(from.x, from.y);
      g.lineTo(x + 0.01, y);
      g.stroke();
    }
    last.current = drawing ? { x, y } : null;
  };

  const feed = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const n = e.nativeEvent;
    if (n.type === 'pointerdown') {
      last.current = null;
      try {
        e.currentTarget.setPointerCapture(n.pointerId);
      } catch {
        // not an active pointer
      }
    }
    const list = n.type === 'pointermove' && typeof n.getCoalescedEvents === 'function' ? n.getCoalescedEvents() : [];
    const asked = n.type === 'pointermove' && typeof n.getPredictedEvents === 'function';
    const pred = asked ? n.getPredictedEvents() : [];
    rec.current.push(sampleOf(n), { coalesced: list.length || 1, coalescedTimes: list.length ? list.map((c) => c.timeStamp) : [n.timeStamp], predicted: pred.length, predictedAsked: asked });
    const touching = n.type !== 'pointerup' && (n.buttons & 1) !== 0;
    for (const c of list.length ? list : [n]) draw(c, touching);
    if (n.pointerType === 'pen') setLive(`Pen, pressure ${Math.round(n.pressure * 100)}%, lean ${Math.round(n.tiltX)} and ${Math.round(n.tiltY)} degrees${n.twist ? `, twist ${Math.round(n.twist)} degrees` : ''}`);
    else setLive(n.pointerType === 'touch' ? 'A finger, not a pen' : 'A mouse, not a pen');
    afterEvent();
  };

  const skip = () => {
    const i = stepRef.current;
    const id = CHECK_STEPS[i];
    if (!id) return;
    rec.current.finish(id, 'skipped');
    dispatch({ type: 'skip', id });
    stepRef.current = i + 1;
    const next = CHECK_STEPS[i + 1];
    if (next) rec.current.start(next);
    setSays(next ? `${line('pen.check.skipped')} ${stepSays(next)}` : line('pen.check.save'));
    setMood('think');
  };

  const close = () => {
    if (!finished.current && flow.phase !== 'offer') toast(line('pen.check.later'));
    closePenCheck();
  };

  const save = async () => {
    const env = await gatherEnv();
    const report = rec.current.report(env);
    const r = await saveReport(report);
    if (r === 'saved') {
      finished.current = true;
      setCheckMemory({ done: true });
      dispatch({ type: 'saved' });
      setSays(line('pen.check.saved'));
      setMood('cheer');
    } else {
      dispatch({ type: 'saveFailed', why: r });
      setSays(r === 'cancelled' ? line('pen.check.cancelled') : line('pen.check.failed'));
      setMood(r === 'cancelled' ? 'idle' : 'oops');
    }
  };

  const status = (id: CheckStepId, i: number) => (flow.done.includes(id) ? 'Done' : flow.skipped.includes(id) ? 'Skipped' : flow.phase === 'run' && i === flow.step ? 'Now' : '');

  return (
    <Modal title="Pen check with Quill" size="lg" className="tb-check" onClose={close} initialFocus="[data-autofocus]">
      <div className="tb-check-body">
        <QuillSays anim={mood} then="idle" size={96} bubbleClassName="tb-check-bubble">
          <p aria-live="polite" data-testid="quill-says">
            {says}
          </p>
        </QuillSays>
        {flow.phase === 'offer' && (
          <div className="tb-check-buttons">
            <button
              type="button"
              className="tb-clear"
              data-autofocus
              onClick={() => {
                dispatch({ type: 'accept' });
                stepRef.current = 0;
                rec.current.start(CHECK_STEPS[0]);
                setSays(`${line('pen.check.hello')} ${stepSays('hover')}`);
              }}
            >
              Let's go
            </button>
            <button type="button" className="tb-clear" onClick={close}>
              {'Not now'}
            </button>
            <button
              type="button"
              className="tb-clear"
              onClick={() => {
                setCheckMemory({ declined: true });
                toast(line('pen.check.never'));
                closePenCheck();
              }}
            >
              Don't ask again
            </button>
          </div>
        )}
        {flow.phase !== 'offer' && (
          <>
            <ol className="tb-check-steps" aria-label="Steps">
              {CHECK_STEPS.map((id, i) => (
                <li key={id} data-state={flow.done.includes(id) ? 'done' : flow.skipped.includes(id) ? 'skipped' : flow.phase === 'run' && i === flow.step ? 'now' : 'todo'} aria-current={flow.phase === 'run' && i === flow.step ? 'step' : undefined}>
                  <span>{STEP_TITLE[id]}</span>
                  <span className="tb-check-status">{status(id, i)}</span>
                </li>
              ))}
            </ol>
            <canvas
              ref={padRef}
              width={720}
              height={260}
              className="tb-pad tb-check-pad"
              role="img"
              aria-label="Pen check pad. Use your pen on this grey area."
              data-testid="check-pad"
              onPointerDown={feed}
              onPointerMove={feed}
              onPointerUp={feed}
              onPointerCancel={feed}
              onContextMenu={(e) => e.preventDefault()}
            />
            <div className="tb-read" data-testid="check-live">
              {live || 'Waiting for your pen.'}
            </div>
          </>
        )}
        {flow.phase === 'run' && (
          <div className="tb-check-buttons">
            <button type="button" className="tb-clear" data-autofocus onClick={skip}>
              Skip this one
            </button>
            <button type="button" className="tb-clear" onClick={close}>
              Stop for now
            </button>
          </div>
        )}
        {flow.phase === 'save' && (
          <div className="tb-check-buttons">
            <button type="button" className="tb-clear" data-autofocus onClick={save}>
              Save the report
            </button>
            <button type="button" className="tb-clear" onClick={close}>
              Not yet
            </button>
          </div>
        )}
        {flow.phase === 'saved' && (
          <div className="tb-check-buttons">
            <button type="button" className="tb-clear" data-autofocus onClick={closePenCheck}>
              Done
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Whether a finished report has been saved before (for Preferences, Diagnostics). */
export const useCheckDone = (): boolean => checkMemory.use((m) => m.done);
