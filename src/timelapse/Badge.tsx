// The badge that is on screen the whole time a timelapse records (and while it is paused). It is a button: pressing it
// stops the timelapse. It sits in the corner, outside the drawing, so it never lands in a picture.
import { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { pauseRecording, recorder, stopRecording } from './recorder';
import { clock } from './plan';
import './timelapse.css';

function Badge() {
  const s = recorder.use((x) => x);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (s.status === 'off') return null;
  const paused = s.status === 'paused';
  return (
    <div className={`tl-badge${paused ? ' is-paused' : ''}`} role="status" data-testid="timelapse-badge" aria-label={paused ? 'Timelapse paused' : 'Recording a timelapse'}>
      <span className="tl-dot" aria-hidden="true" />
      <span>{paused ? 'Timelapse paused' : 'Recording a timelapse'}</span>
      <small>
        {clock(((s.startedAt ? now - s.startedAt : 0)) / 1000)} · {s.count} {s.count === 1 ? 'picture' : 'pictures'}
      </small>
      <button type="button" onClick={pauseRecording} title={paused ? 'Carry on recording' : 'Stop taking pictures for a bit'}>
        {paused ? 'Carry on' : 'Pause'}
      </button>
      <button type="button" onClick={() => void stopRecording()} title="Stop recording. The pictures are kept so you can make the video.">
        Stop
      </button>
    </div>
  );
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

let watching = false;

function sync(): void {
  const on = recorder.get().status !== 'off';
  if (on && !host) {
    host = document.createElement('div');
    host.dataset.timelapse = 'badge';
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(<Badge />);
  } else if (!on && host) {
    root?.unmount();
    host.remove();
    host = null;
    root = null;
  }
}

/** Shows the badge while recording and takes it away after. Loaded when the first recording starts. */
export function watchBadge(): void {
  if (!watching) {
    watching = true;
    recorder.subscribe(sync);
  }
  sync();
}
