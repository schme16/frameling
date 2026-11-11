// "Play all in order": the artboards one after another, like shots in a film, in a window of their own. Each shot
// plays at its own size, fitted into the window, for its own length. Nothing in the document changes.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Doc, Id } from '../core/format';
import { store } from '../core/store';
import { renderFrame } from '../core/render';
import { Modal, mountModal } from '../io/mount';
import { leaveTileEdit } from '../tiles/tileEdit';
import { artboardDoc, artboardsOf, shotAt } from './model';

export interface Reel {
  shots: { id: Id; name: string; doc: Doc }[];
  /** First frame of each shot in the whole reel. */
  starts: number[];
  length: number;
  fps: number;
}

/** The shots in list order (or just `ids`), with where each starts. */
export function buildReel(root: Doc, ids?: Id[]): Reel {
  const list = artboardsOf(root).filter((a) => !ids || ids.includes(a.id));
  const shots = list.map((a) => ({ id: a.id, name: a.name, doc: artboardDoc(root, a.id) }));
  const starts: number[] = [];
  let at = 0;
  for (const s of shots) {
    starts.push(at);
    at += s.doc.length;
  }
  return { shots, starts, length: Math.max(1, at), fps: root.fps };
}

/** The shot and its own frame at a frame of the reel. */
export function reelAt(r: Reel, frame: number): { shot: number; frame: number } {
  return shotAt(r.starts, frame);
}

function ShotsPlayer({ close }: { close: () => void }) {
  const reel = useMemo(() => buildReel(store().rootDoc()), []);
  const ref = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const clock = useRef({ t0: 0, from: 0 });

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    clock.current = { t0: performance.now(), from: frame >= reel.length - 1 ? 0 : frame };
    const tick = (t: number) => {
      const i = clock.current.from + Math.floor(((t - clock.current.t0) * reel.fps) / 1000);
      if (i >= reel.length && !loop) {
        setFrame(reel.length - 1);
        setPlaying(false);
        return;
      }
      setFrame(i % reel.length);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, loop]);

  const at = reelAt(reel, frame);
  const shot = reel.shots[at.shot];
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !shot) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth * dpr;
    const H = cv.clientHeight * dpr;
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const g = cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const d = shot.doc;
    const k = Math.min(W / d.width, H / d.height);
    const ox = (W - d.width * k) / 2;
    const oy = (H - d.height * k) / 2;
    g.setTransform(k, 0, 0, k, ox, oy);
    g.imageSmoothingEnabled = !d.layers.some((l) => l.kind === 'pixel');
    g.fillStyle = d.background ?? '#ffffff';
    g.fillRect(0, 0, d.width, d.height);
    renderFrame(g, d, at.frame, { background: false, layerFilter: (l) => !l.reference });
  });

  if (!shot) return null;
  return (
    <Modal title="Play all artboards in order" onClose={close} wide className="ab-player">
      <div className="ab-player-body">
        <canvas ref={ref} className="ab-player-canvas" aria-label={`${shot.name}, frame ${at.frame + 1}`} />
        <div className="ab-player-strip" role="group" aria-label="Shots">
          {reel.shots.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`ab-shot${i === at.shot ? ' ab-shot-on' : ''}`}
              style={{ flexGrow: s.doc.length }}
              title={`${s.name}: ${s.doc.length} frame${s.doc.length === 1 ? '' : 's'}`}
              onClick={() => {
                setFrame(reel.starts[i]);
                clock.current = { t0: performance.now(), from: reel.starts[i] };
              }}
            >
              <span>{s.name}</span>
            </button>
          ))}
        </div>
        <div className="io-foot ab-player-foot">
          <span className="io-muted">
            {shot.name}, frame {at.frame + 1} of {shot.doc.length}
          </span>
          <label className="ex-check">
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
            <span>Loop</span>
          </label>
          <button type="button" className="io-btn io-primary" data-autofocus onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function openShotsPlayer(): void {
  leaveTileEdit();
  store().setUi({ playing: false });
  mountModal((close) => <ShotsPlayer close={close} />);
}
