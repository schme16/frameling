// "Make a timelapse video": how long, what kind of file, then the same export progress as any other. Reads the pictures
// kept by the recorder; never touches the drawing.
import { useEffect, useRef, useState } from 'react';
import { Modal, mountModal } from '../io/mount';
import { describeError } from '../export/exporter';
import { clearPictures, findKept, isRecording, recorder, startRecording } from './recorder';
import { exportTimelapse } from './export';
import { DEFAULT_LENGTH, FORMATS, LENGTHS, fpsFor, speedUp, timing, words, type TimelapseFormat } from './plan';
import './timelapse.css';

function Dialog({ close }: { close: () => void }) {
  const state = recorder.use((s) => s);
  const [format, setFormat] = useState<TimelapseFormat>('mp4');
  const [length, setLength] = useState(DEFAULT_LENGTH);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // The pictures on disk can be from an earlier run of the app, so look for them when the dialog opens.
  useEffect(() => {
    void findKept().then((f) => {
      if (f && !isRecording()) recorder.set((s) => ({ ...s, count: f.pictures.length, firstAt: f.pictures[0]?.at ?? null, lastAt: f.pictures[f.pictures.length - 1]?.at ?? null, bytes: f.pictures.reduce((n, k) => n + k.bytes, 0) }));
      setReady(true);
    });
  }, []);

  const n = state.count;
  const seconds = LENGTHS.find((l) => l.id === length)?.seconds ?? null;
  const t = timing(n, seconds, fpsFor(format));
  const drewFor = state.firstAt !== null && state.lastAt !== null ? (state.lastAt - state.firstAt) / 1000 : 0;
  const faster = speedUp(drewFor, t.seconds);

  const make = async () => {
    setProblem(null);
    const ac = new AbortController();
    abort.current = ac;
    setBusy({ done: 0, total: 1, label: 'Starting' });
    try {
      const out = await exportTimelapse({ format, seconds, signal: ac.signal, onProgress: setBusy });
      if (out === 'done') return close();
      setBusy(null);
    } catch (e) {
      setBusy(null);
      setProblem(describeError(e));
    }
  };

  if (ready && n === 0) {
    return (
      <Modal title="Make a timelapse video" onClose={close}>
        <div className="io-body tl-body">
          <p>There is nothing recorded yet. Start recording, draw for a while, and the pictures are kept here until you make the video.</p>
          <p className="io-muted">A red badge shows in the corner the whole time it records.</p>
        </div>
        <div className="io-foot">
          <button type="button" className="io-btn" onClick={close}>Not now</button>
          <button
            type="button"
            className="io-btn io-primary"
            data-autofocus=""
            onClick={() => {
              close();
              void startRecording();
            }}
          >
            Start recording
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Make a timelapse video" onClose={close} canClose={!busy}>
      <div className="io-body tl-body">
        <p className="tl-sum">
          {n} {n === 1 ? 'picture' : 'pictures'} {drewFor >= 1 ? `from about ${words(drewFor)} of drawing` : 'so far'}
          {isRecording() ? ', and it is still recording.' : '.'}
        </p>
        <fieldset className="tl-group" disabled={!!busy}>
          <legend>How long should the video be?</legend>
          {LENGTHS.map((l) => (
            <label key={l.id} className="tl-opt">
              <input type="radio" name="tl-length" checked={length === l.id} onChange={() => setLength(l.id)} />
              <span>{l.label}</span>
            </label>
          ))}
          <p className="io-muted tl-note" data-testid="tl-result">
            {t.indices.length ? `Comes out ${words(t.seconds)} long` : ''}
            {t.indices.length && drewFor >= 1 ? `, ${faster >= 2 ? `about ${Math.round(faster)} times faster than you drew it (the time-lapse speed-up)` : 'about as fast as you drew it'}.` : '.'}
          </p>
        </fieldset>
        <fieldset className="tl-group" disabled={!!busy}>
          <legend>What kind of file?</legend>
          {FORMATS.map((f) => (
            <label key={f.id} className="tl-opt tl-fmt">
              <input type="radio" name="tl-format" checked={format === f.id} onChange={() => setFormat(f.id)} />
              <span>
                {f.label}
                <small className="io-muted">{f.detail}</small>
              </span>
            </label>
          ))}
        </fieldset>
        {busy && (
          <div className="tl-progress" role="status">
            <div className="tl-bar"><i style={{ width: `${Math.min(100, Math.round((busy.done / Math.max(1, busy.total)) * 100))}%` }} /></div>
            <span>{busy.label}</span>
          </div>
        )}
        {problem && <p className="tl-problem" role="alert">{problem}</p>}
      </div>
      <div className="io-foot">
        {!busy && (
          <button
            type="button"
            className="io-btn tl-clear"
            onClick={() => {
              void clearPictures().then(close);
            }}
          >
            Throw the pictures away
          </button>
        )}
        <span className="tl-spacer" />
        {busy ? (
          <button type="button" className="io-btn" onClick={() => abort.current?.abort()}>Cancel</button>
        ) : (
          <>
            <button type="button" className="io-btn" onClick={close}>Close</button>
            <button type="button" className="io-btn io-primary" data-autofocus="" onClick={() => void make()}>Make the video</button>
          </>
        )}
      </div>
    </Modal>
  );
}

export function openTimelapseDialog(): void {
  mountModal((close) => <Dialog close={close} />);
}
