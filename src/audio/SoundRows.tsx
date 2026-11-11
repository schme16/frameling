import { memo, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { AudioClip } from '../core/format';
import { store, useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { ContextMenu, InlineName, type MenuItem } from '../timeline/Menu';
import { runCmd } from '../timeline/cmd';
import { goTo } from '../timeline/playback';
import './audio.css';
import { clipFrames } from './clips';
import { decodeClip, onDecoded, readyBuffer } from './decode';
import { moveClip, removeClip, renameClip, setMuted, setVolume } from './ops';
import { columnPeaks, displayGain, peaksFor } from './peaks';
import { pickSound, soundUi } from './state';

/** Height of one sound row, on the layer side and on the grid side (they must match). */
export const SOUND_H = 36;

/** The soft colour of a sound: a different hue from the drawings, so a glance tells them apart. */
const WAVE = 'var(--grape)';

/** Redraws when any sound finishes decoding. */
function useDecoded(): number {
  const [n, setN] = useState(0);
  useEffect(() => onDecoded(() => setN((x) => x + 1)), []);
  return n;
}

/** The waveform, drawn only for the columns on screen. */
function Wave({ clip, cw, fps, x0, width, from, to, version }: { clip: AudioClip; cw: number; fps: number; x0: number; width: number; from: number; to: number; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const buf = readyBuffer(clip);
  // The part of the clip that is on screen, in pixels from the clip's own left edge.
  const left = Math.max(0, from * cw - x0);
  const right = Math.min(width, (to + 1) * cw - x0);
  const w = Math.max(0, Math.floor(right - left));
  useEffect(() => {
    const c = ref.current;
    if (!c || !buf || w < 1) return;
    const dpr = window.devicePixelRatio || 1;
    const h = SOUND_H - 8;
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil(h * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    const peaks = peaksFor(buf);
    const gain = displayGain(peaks);
    const cols = columnPeaks(peaks, left / (cw * fps), 1 / (cw * fps), w);
    g.fillStyle = getComputedStyle(c).color;
    const mid = h / 2;
    for (let x = 0; x < w; x++) {
      const bar = Math.max(1, Math.min(1, cols[x] * gain) * (h - 4));
      g.fillRect(x, mid - bar / 2, 1, bar);
    }
  }, [buf, w, left, cw, fps, version]);
  if (!buf || w < 1) return null;
  return <canvas ref={ref} className="au-wave" style={{ left, width: w, height: SOUND_H - 8 }} aria-hidden="true" />;
}

const ClipBar = memo(function ClipBar({ clip, cw, fps, from, to, picked, version }: { clip: AudioClip; cw: number; fps: number; from: number; to: number; picked: boolean; version: number }) {
  const [drag, setDrag] = useState<{ x: number; start: number; moved: boolean } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const start = drag?.moved ? drag.start : clip.start;
  const frames = clip.duration ? clip.duration * fps : clipFrames(clip, fps);
  const x0 = start * cw;
  const width = Math.max(4, frames * cw);

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    pickSound(clip.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, start: clip.start, moved: false });
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 3) return;
    setDrag({ ...drag, moved: true, start: clip.start + Math.round(dx / cw) });
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (drag?.moved && drag.start !== clip.start) moveClip(clip.id, drag.start);
    setDrag(null);
  };

  const items = (): MenuItem[] => {
    const at = store().get().ui.frame;
    return [
      { heading: `Sound: ${clip.name}` },
      { label: clip.muted ? 'Turn the sound back on' : 'Mute', onClick: () => setMuted(clip.id, !clip.muted) },
      { label: 'Start at the playhead', onClick: () => moveClip(clip.id, at) },
      { label: 'Start at the first frame', disabled: clip.start === 0, onClick: () => moveClip(clip.id, 0) },
      { separator: true },
      { label: 'Lip sync with this sound...', onClick: () => (pickSound(clip.id), runCmd('lipsync.auto')) },
      { separator: true },
      { label: 'Remove sound', danger: true, onClick: () => removeClip(clip.id) },
    ];
  };

  return (
    <div
      className={`au-clip${picked ? ' is-picked' : ''}${clip.muted ? ' is-muted' : ''}${drag?.moved ? ' is-dragging' : ''}`}
      data-sound={clip.id}
      style={{ left: x0, width }}
      title={`${clip.name}: drag to line it up with your drawings. Starts on frame ${start + 1}.`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        pickSound(clip.id);
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <Wave clip={clip} cw={cw} fps={fps} x0={x0} width={width} from={from} to={to} version={version} />
      {!readyBuffer(clip) ? <span className="au-loading">Getting the sound ready...</span> : null}
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={items()} onClose={() => setMenu(null)} /> : null}
    </div>
  );
});

function Cursor({ cw }: { cw: number }) {
  const frame = useStore((s) => s.ui.frame);
  return <div className="tl-playhead is-rows" style={{ width: cw, transform: `translateX(${frame * cw}px)` }} aria-hidden="true" />;
}

/** The sound rows in the scrolling grid, under the layers. Draws nothing when the animation has no sound. */
export function SoundMain({ cw, from, to }: { cw: number; from: number; to: number }) {
  const audio = useStore((s) => s.doc.audio);
  const fps = useStore((s) => s.doc.fps);
  const inSymbol = useStore((s) => !!s.doc.editing?.length);
  const picked = soundUi.use((s) => s.picked);
  const version = useDecoded();
  const scrubbing = useRef(false);
  useEffect(() => {
    for (const c of audio ?? []) void decodeClip(c);
  }, [audio]);
  if (!audio?.length || inSymbol) return null;
  const frameAt = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(store().get().doc.length - 1, Math.floor((e.clientX - r.left) / cw)));
  };
  return (
    <div
      className="au-rows"
      style={{ height: audio.length * SOUND_H }}
      onPointerDown={(e) => {
        // Empty space in a sound row works like the layers: it moves the playhead.
        if (e.button !== 0 || (e.target as HTMLElement).closest('.au-clip')) return;
        scrubbing.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        goTo(frameAt(e));
      }}
      onPointerMove={(e) => {
        if (scrubbing.current && frameAt(e) !== store().get().ui.frame) goTo(frameAt(e));
      }}
      onPointerUp={(e) => {
        scrubbing.current = false;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    >
      {audio.map((c, i) => (
        <div key={c.id} className="au-row" style={{ top: i * SOUND_H, height: SOUND_H }}>
          <ClipBar clip={c} cw={cw} fps={fps} from={from} to={to} picked={picked === c.id} version={version} />
        </div>
      ))}
      <Cursor cw={cw} />
    </div>
  );
}

/** One sound's controls on the layer side: name, mute, volume, remove. */
const SideRow = memo(function SideRow({ clip, picked }: { clip: AudioClip; picked: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const vol = Math.round((clip.volume ?? 1) * 100);
  return (
    <div className={`au-side-row${picked ? ' is-picked' : ''}${clip.muted ? ' is-muted' : ''}`} style={{ height: SOUND_H }} onClick={() => pickSound(clip.id)} role="listitem" aria-label={`Sound: ${clip.name}`}>
      <span className="au-kind" aria-hidden="true">
        <Icon name="sound" size={14} />
      </span>
      {renaming ? (
        <InlineName
          label="Sound name"
          value={clip.name}
          onDone={(v) => {
            setRenaming(false);
            if (v !== null) renameClip(clip.id, v);
          }}
        />
      ) : (
        <span className="au-name" title={`${clip.name}. Double-click to rename.`} onDoubleClick={() => setRenaming(true)}>
          {clip.name}
        </span>
      )}
      <input className="au-vol" type="range" min={0} max={100} value={vol} disabled={!!clip.muted} title={`Volume: ${vol}%`} aria-label={`Volume of ${clip.name}`} onClick={(e) => e.stopPropagation()} onChange={(e) => setVolume(clip.id, Number(e.target.value) / 100)} />
      <button type="button" className="tl-icon-btn" title={clip.muted ? 'Turn the sound back on' : 'Mute this sound'} aria-label={clip.muted ? 'Unmute sound' : 'Mute sound'} aria-pressed={!!clip.muted} onClick={(e) => (e.stopPropagation(), setMuted(clip.id, !clip.muted))}>
        <Icon name={clip.muted ? 'sound-off' : 'sound'} size={15} />
      </button>
      <button type="button" className="tl-icon-btn" title="Remove this sound from the animation" aria-label="Remove sound" onClick={(e) => (e.stopPropagation(), removeClip(clip.id))}>
        <Icon name="trash" size={15} />
      </button>
    </div>
  );
});

/** The sound rows on the layer side, lined up with `SoundMain`. */
export function SoundSide() {
  const audio = useStore((s) => s.doc.audio);
  const inSymbol = useStore((s) => !!s.doc.editing?.length);
  const picked = soundUi.use((s) => s.picked);
  if (!audio?.length || inSymbol) return null;
  return (
    <div className="au-side" role="list" aria-label="Sounds">
      {audio.map((c) => (
        <SideRow key={c.id} clip={c} picked={picked === c.id} />
      ))}
    </div>
  );
}
