// "Open a video to trace over": says what the video holds and what the choices make (how many pictures, how big, what was
// left out) before anything happens, with a scrub bar to see the picture at each end of the stretch.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../io/mount';
import '../../pixel/import/import.css';
import '../import.css';
import './video.css';
import { DEFAULT_SIDE, estimateBytes, foundSummary, frameCount, frameSize, mb, secondsText, tidyRequest, type VideoAs, type VideoFacts, type VideoRequest } from './plan';
import type { OpenVideo } from './read';

const SIDES = [160, 240, 320, 480, 720, 1280, 1920];
const PIXEL_SIDE = 320;

const num = (v: string, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export interface VideoWork {
  (req: VideoRequest, progress: (done: number, total: number) => void, signal: AbortSignal): Promise<boolean>;
}

export function VideoDialog({ video, docFps, into, work, close }: { video: OpenVideo; docFps: number; into: boolean; work: VideoWork; close: () => void }) {
  const facts: VideoFacts = video.facts;
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(Math.round(facts.duration * 100) / 100);
  const [rate, setRate] = useState(Math.min(24, Math.max(1, Math.round(docFps))));
  const own = Math.max(facts.width, facts.height);
  const [side, setSide] = useState(Math.min(DEFAULT_SIDE, own));
  const [as, setAs] = useState<VideoAs>('reference');
  const [touchedSide, setTouchedSide] = useState(false);
  const [at, setAt] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const req = useMemo(() => tidyRequest({ start, end, rate, side, as }, facts.duration), [start, end, rate, side, as, facts.duration]);
  const info = useMemo(() => foundSummary(facts, req), [facts, req]);
  const count = frameCount(req.start, req.end, req.rate);
  const size = frameSize(facts.width, facts.height, req.side);
  const bytes = estimateBytes(count, size.width, size.height, as);
  const busy = !!progress;

  // The picture at the scrub position.
  const shown = useRef<HTMLCanvasElement>(null);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const w = Math.min(400, facts.width);
      const h = Math.max(1, Math.round((w * facts.height) / facts.width));
      try {
        for await (const f of video.frames([Math.min(Math.max(0, at), Math.max(0, facts.duration - 0.01))], w, h)) {
          const c = shown.current;
          if (mine !== seq.current || !c) break;
          c.width = w;
          c.height = h;
          c.getContext('2d')?.drawImage(f.canvas as CanvasImageSource, 0, 0);
        }
      } catch {
        // A picture that can't be shown just stays as it was.
      }
    }, 120);
    return () => clearTimeout(t);
  }, [at, video, facts.width, facts.height, facts.duration]);

  const pickAs = (a: VideoAs) => {
    setAs(a);
    // Pixel frames start smaller, unless a size was already chosen by hand.
    if (!touchedSide) setSide(Math.min(a === 'pixel' ? PIXEL_SIDE : DEFAULT_SIDE, own));
  };

  const go = async () => {
    const ctl = new AbortController();
    abort.current = ctl;
    setProgress({ done: 0, total: count });
    const ok = await work(req, (done, total) => setProgress({ done, total }), ctl.signal).catch(() => false);
    abort.current = null;
    if (ok) close();
    else setProgress(null);
  };
  const stop = () => {
    if (abort.current) abort.current.abort();
    else close();
  };

  const problem = !(req.end > req.start) ? 'Pick a stretch that has some video in it.' : '';
  const sideChoices = [...new Set([...SIDES.filter((x) => x < own), own, side])].sort((a, b) => a - b);

  return (
    <Modal title="Open a video to trace over" onClose={stop} wide className="im-modal">
      <div className="im-body">
        <div className="im-preview">
          <div className="im-stage-wrap">
            <div className="im-stage" style={{ width: 400, maxWidth: '100%' }}>
              <canvas ref={shown} role="img" aria-label="The picture at this moment in the video" style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
          </div>
          <div className="im-gifbar">
            <input type="range" min={0} max={Math.max(0.01, facts.duration)} step={0.01} value={at} aria-label="Moment in the video" disabled={busy} onChange={(e) => setAt(num(e.target.value, 0))} data-testid="video.scrub" />
            <span className="im-hint">{secondsText(at)}</span>
          </div>
          <div className="im-row">
            <button type="button" className="io-btn" disabled={busy} onClick={() => setStart(Math.round(at * 100) / 100)} data-testid="video.setStart">
              Start here
            </button>
            <button type="button" className="io-btn" disabled={busy} onClick={() => setEnd(Math.round(at * 100) / 100)} data-testid="video.setEnd">
              End here
            </button>
          </div>
        </div>
        <div className="im-controls">
          <p className="im-file">
            <b>{facts.name}</b>
          </p>
          <p data-testid="video.found">{info.found}</p>
          {info.left.length > 0 && (
            <div data-testid="video.left">
              <p className="im-hint">
                <b>Left out:</b>
              </p>
              <ul className="im-hint imp-list">
                {info.left.map((l) => (
                  <li key={l}>{l.replace(/\[([^\]]+)\]\(help:[a-z-]+\)/g, '$1')}</li>
                ))}
              </ul>
            </div>
          )}
          {info.notes.length > 0 && (
            <ul className="im-hint imp-list" data-testid="video.notes">
              {info.notes.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}

          <fieldset className="im-set">
            <legend>Which part</legend>
            <div className="im-row">
              <label className="im-field">
                <span className="cv-field-label">From (seconds)</span>
                <input type="number" min={0} max={facts.duration} step={0.1} value={start} disabled={busy} data-testid="video.from" onChange={(e) => setStart(num(e.target.value, start))} />
              </label>
              <label className="im-field">
                <span className="cv-field-label">To (seconds)</span>
                <input type="number" min={0} max={facts.duration} step={0.1} value={end} disabled={busy} data-testid="video.to" onChange={(e) => setEnd(num(e.target.value, end))} />
              </label>
            </div>
          </fieldset>

          <fieldset className="im-set">
            <legend>How many pictures</legend>
            <div className="im-row">
              <label className="im-field">
                <span className="cv-field-label">Pictures a second</span>
                <input type="number" min={1} max={120} value={rate} disabled={busy} data-testid="video.rate" onChange={(e) => setRate(num(e.target.value, rate))} />
                <small className="im-hint">{rate === docFps ? `Matches your ${docFps}.` : `Your animation plays at ${docFps}.`}</small>
              </label>
              <label className="im-field">
                <span className="cv-field-label">Size (longest side)</span>
                <select value={side} disabled={busy} data-testid="video.side" onChange={(e) => (setTouchedSide(true), setSide(num(e.target.value, side)))}>
                  {sideChoices.map((s) => (
                    <option key={s} value={s}>
                      {s === own ? `Own size, ${s} pixels` : `${s} pixels`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="im-set">
            <legend>They come in as</legend>
            <div className="im-ways vd-ways" role="radiogroup" aria-label="How they come in">
              <button type="button" role="radio" aria-checked={as === 'reference'} className={`im-way${as === 'reference' ? ' on' : ''}`} disabled={busy} onClick={() => pickAs('reference')} data-testid="video.asReference">
                <b>A reference layer</b>
                <span>Smooth pictures behind your drawing. Never exported.</span>
              </button>
              <button type="button" role="radio" aria-checked={as === 'pixel'} className={`im-way${as === 'pixel' ? ' on' : ''}`} disabled={busy} onClick={() => pickAs('pixel')} data-testid="video.asPixel">
                <b>Pixel frames</b>
                <span>{into ? 'Frames on a new pixel layer you can paint on.' : 'Frames of a new pixel drawing you can paint on.'}</span>
              </button>
            </div>
          </fieldset>
        </div>
      </div>
      <div className="io-foot">
        <span className="im-summary" aria-live="polite" data-testid="video.summary">
          {progress ? `Reading picture ${Math.min(progress.done + 1, progress.total)} of ${progress.total}...` : problem || `${count} ${count === 1 ? 'picture' : 'pictures'}, about ${mb(bytes)}.`}
        </span>
        <button type="button" className="io-btn" data-testid="video.cancel" onClick={stop}>
          {busy ? 'Stop' : 'Cancel'}
        </button>
        <button type="button" className="io-btn io-primary" data-testid="video.go" onClick={() => void go()} disabled={!!problem || busy} data-autofocus>
          Bring them in
        </button>
      </div>
    </Modal>
  );
}
