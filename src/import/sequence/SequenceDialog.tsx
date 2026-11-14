// "Bring in a sequence of pictures": says what it found (how many, which names, what size, what it left out and why)
// before anything is brought in, and lets you watch it, pick the speed and the order.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../io/mount';
import '../../pixel/import/import.css';
import '../import.css';
import { foundSummary, gapsIn, picturesOf, type SequencePlan } from './plan';
import type { Decoded, DecodedPicture, SequenceTiming } from './read';

export interface SequenceRequest {
  pictures: DecodedPicture[];
  timing: SequenceTiming;
}

const num = (v: string, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

function Preview({ pic }: { pic: DecodedPicture | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !pic) return;
    c.width = pic.width;
    c.height = pic.height;
    c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pic.pixels), pic.width, pic.height), 0, 0);
  }, [pic]);
  if (!pic) return <div className="im-stage-wrap" />;
  const fit = Math.min(400 / pic.width, 330 / pic.height);
  const z = fit >= 1 ? Math.floor(fit * 4) / 4 : fit;
  return (
    <div className="im-stage-wrap">
      <div className="im-stage" style={{ width: Math.round(pic.width * z), height: Math.round(pic.height * z) }}>
        <canvas ref={ref} role="img" aria-label="The picture on show" style={{ width: Math.round(pic.width * z), height: Math.round(pic.height * z) }} />
      </div>
    </div>
  );
}

export function SequenceDialog({ name, plan, decoded, into, docFps, finish, close }: {
  name: string;
  plan: SequencePlan;
  decoded: Decoded;
  /** Adding to the open drawing: it plays at the drawing's rate. */
  into: boolean;
  docFps: number;
  finish: (r: SequenceRequest) => void;
  close: () => void;
}) {
  const [runKey, setRunKey] = useState<string | 'all'>('all');
  const [fps, setFps] = useState(12);
  const [hold, setHold] = useState(1);
  const [reverse, setReverse] = useState(false);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  const picked = useMemo(() => picturesOf(plan, runKey), [plan, runKey]);
  const byPath = useMemo(() => new Map(decoded.pictures.map((p) => [p.path, p])), [decoded]);
  const pictures = useMemo(() => picked.map((p) => byPath.get(p)).filter((p): p is DecodedPicture => !!p), [picked, byPath]);
  const unreadable = useMemo(() => decoded.unreadable.filter((u) => picked.includes(u.path)), [decoded, picked]);
  const shownPlan = useMemo(() => ({ ...plan, gaps: runKey === 'all' ? plan.gaps : gapsIn(picked) }), [plan, runKey, picked]);
  const facts = useMemo(() => foundSummary(shownPlan, { picked, unreadable, sizes: pictures }), [shownPlan, picked, unreadable, pictures]);
  const rate = into ? docFps : fps;
  const shown = pictures[Math.min(frame, pictures.length - 1)];

  useEffect(() => {
    if (!playing || pictures.length < 2) return;
    const t = setTimeout(() => setFrame((f) => (f + 1) % pictures.length), (1000 * hold) / rate);
    return () => clearTimeout(t);
  }, [playing, frame, pictures.length, hold, rate]);

  const frames = pictures.length * hold;
  const seconds = frames / rate;
  const left = [...facts.left, ...(decoded.stoppedEarly ? [`${decoded.stoppedEarly} more pictures weren't read, to keep memory in check.`] : [])];
  const problem = pictures.length ? '' : 'There is no picture here that Frameling can read.';

  const go = () => {
    if (problem) return;
    finish({ pictures, timing: { fps: rate, hold, reverse } });
    close();
  };

  return (
    <Modal title={into ? 'Add pictures as frames' : 'Bring in pictures as frames'} onClose={close} wide className="im-modal">
      <div className="im-body">
        <div className="im-preview">
          <Preview pic={shown} />
          <div className="im-gifbar">
            <button type="button" className="io-btn" onClick={() => setPlaying((p) => !p)} aria-pressed={playing} disabled={pictures.length < 2}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <input type="range" min={0} max={Math.max(0, pictures.length - 1)} value={Math.min(frame, Math.max(0, pictures.length - 1))} aria-label="Picture" onChange={(e) => (setPlaying(false), setFrame(Number(e.target.value)))} className="cv-slider" disabled={pictures.length < 2} />
            <span className="im-hint">
              {pictures.length ? `${Math.min(frame, pictures.length - 1) + 1} of ${pictures.length}` : ''}
            </span>
          </div>
          {shown && <p className="im-hint">{shown.path.slice(shown.path.lastIndexOf('/') + 1)}</p>}
        </div>
        <div className="im-controls">
          <p className="im-file">
            <b>{name}</b>
          </p>
          <p data-testid="sequence.found">{facts.found}</p>
          {left.length > 0 && (
            <div data-testid="sequence.left">
              <p className="im-hint">
                <b>Left out:</b>
              </p>
              <ul className="im-hint imp-list">
                {left.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
          {facts.notes.length > 0 && (
            <ul className="im-hint imp-list" data-testid="sequence.notes">
              {facts.notes.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}

          {plan.runs.length > 1 && (
            <fieldset className="im-set">
              <legend>The folder holds {plan.runs.length} sets of names</legend>
              <div className="im-ways" role="radiogroup" aria-label="Which pictures">
                <button type="button" role="radio" aria-checked={runKey === 'all'} className={`im-way${runKey === 'all' ? ' on' : ''}`} onClick={() => (setRunKey('all'), setFrame(0))}>
                  <b>All of them</b>
                  <span>{plan.pictures.length} in name order</span>
                </button>
                {plan.runs.slice(0, 6).map((r) => (
                  <button key={r.key} type="button" role="radio" aria-checked={runKey === r.key} className={`im-way${runKey === r.key ? ' on' : ''}`} onClick={() => (setRunKey(r.key), setFrame(0))}>
                    <b>{r.label}</b>
                    <span>{r.paths.length}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="im-set">
            <legend>How it plays</legend>
            <div className="im-row">
              <label className="im-field">
                <span className="cv-field-label">Frames per second</span>
                <input type="number" min={1} max={120} value={rate} disabled={into} data-testid="sequence.fps" onChange={(e) => setFps(num(e.target.value, 1, 120, fps))} />
                {into && <small className="im-hint">This drawing plays at {docFps}.</small>}
              </label>
              <label className="im-field">
                <span className="cv-field-label">Hold each picture for</span>
                <input type="number" min={1} max={24} value={hold} data-testid="sequence.hold" onChange={(e) => setHold(num(e.target.value, 1, 24, hold))} />
                <small className="im-hint">{hold === 1 ? 'frame (on ones)' : hold === 2 ? 'frames (on twos)' : 'frames'}</small>
              </label>
            </div>
            <label className="im-check">
              <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />
              <span>Play it backwards</span>
            </label>
          </fieldset>
        </div>
      </div>
      <div className="io-foot">
        <span className="im-summary" aria-live="polite">
          {problem || `${frames} ${frames === 1 ? 'frame' : 'frames'}, ${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} seconds.`}
        </span>
        <button type="button" className="io-btn" data-testid="sequence.cancel" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" data-testid="sequence.go" onClick={go} disabled={!!problem} data-autofocus>
          {into ? 'Add them' : 'Bring them in'}
        </button>
      </div>
    </Modal>
  );
}
