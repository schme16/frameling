import { useState, type ReactNode } from 'react';
import { celAt, findLayer } from '../core/doc';
import { store, useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { runCmd, tip } from './cmd';
import { seconds } from './geometry';
import { Floating } from './Menu';
import * as ops from './ops';
import { inOutRange, playRange } from './playback';
import { clearInOut } from './range';
import { clearLightTable, lightTableLabel } from '../canvas/lightTable';
import { MAX_CW, MIN_CW, setTl, tl, useTl } from './state';
import { SoundButton } from '../audio/SoundButton';

function Btn({ id, icon, text, title, pressed, disabled, onClick, className = '' }: { id?: string; icon?: string; text?: ReactNode; title: string; pressed?: boolean; disabled?: boolean; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={`tl-btn${pressed ? ' is-on' : ''} ${className}`}
      title={id ? tip(id, title) : title}
      // Speech users say what they see, so the visible words have to be in the name.
      aria-label={typeof text === 'string' && !title.toLowerCase().includes(text.toLowerCase()) ? `${text}: ${title}` : title}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick ?? (() => id && runCmd(id))}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {text !== undefined ? <span className="tl-btn-text">{text}</span> : null}
    </button>
  );
}

function Counter() {
  const frame = useStore((s) => s.ui.frame);
  const length = useStore((s) => s.doc.length);
  const fps = useStore((s) => s.doc.fps);
  return (
    <span className="tl-counter" title="The frame you are on, out of all the frames. Frames are counted from 1, like flipbook pages." aria-live="off">
      <span className="tl-counter-frame">Frame <strong>{frame + 1}</strong> / {length}</span>
      <span className="tl-counter-time">{seconds(frame, fps)}s of {seconds(length, fps)}s</span>
    </span>
  );
}

function FpsField() {
  const fps = useStore((s) => s.doc.fps);
  const [text, setText] = useState<string | null>(null);
  const commit = (v: string) => {
    setText(null);
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) ops.setFps(n);
  };
  return (
    <label className="tl-fps" title="How many frames play each second (fps). 12 is a classic hand-drawn pace, 24 is smooth film.">
      <input
        type="text"
        inputMode="numeric"
        aria-label="Frames per second"
        value={text ?? String(fps)}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setText(null);
            e.currentTarget.blur();
          }
        }}
      />
      <span>fps</span>
    </label>
  );
}

function HoldButtons() {
  const length = useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return (l && celAt(l, s.ui.frame)?.length) ?? 0;
  });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const words = ['', 'on ones', 'on twos', 'on threes', 'on fours'];
  return (
    <span className="tl-group tl-hold" role="group" aria-label="How long to hold this drawing">
      {/* Wide timelines show the four buttons; narrower ones fold them into one button with a menu (CSS decides). */}
      <span className="tl-hold-full">
        <span className="tl-group-label" title="How many frames this drawing stays on screen before the next one (exposure).">Hold for</span>
        {[1, 2, 3, 4].map((n) => (
          <Btn key={n} id={`timeline.hold${n}`} text={n} title={`Hold this drawing for ${n} frame${n === 1 ? '' : 's'} (${words[n]})`} pressed={length === n} className="tl-btn-num" />
        ))}
      </span>
      <button
        type="button"
        className="tl-btn tl-hold-menu"
        title="How many frames this drawing stays on screen before the next one (exposure)"
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos(pos ? null : { x: r.left, y: r.bottom + 4 });
        }}
      >
        <span className="tl-btn-text">
          Hold<span className="tl-long"> for</span> <strong>{length || '-'}</strong>
        </span>
        <Icon name="chevron-down" size={14} />
      </button>
      {pos ? (
        <Floating x={pos.x} y={pos.y} onClose={() => setPos(null)} className="tl-pop tl-hold-pop">
          <div className="tl-pop-title">Hold for</div>
          <div role="menu" aria-label="Hold for">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                role="menuitemradio"
                aria-checked={length === n}
                className={`tl-hold-item${length === n ? ' is-on' : ''}`}
                onClick={() => {
                  setPos(null);
                  runCmd(`timeline.hold${n}`);
                }}
              >
                <strong>{n}</strong> frame{n === 1 ? '' : 's'} <span>{words[n]}</span>
              </button>
            ))}
          </div>
        </Floating>
      ) : null}
    </span>
  );
}

function OnionControls() {
  const onion = useStore((s) => s.ui.onion);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const set = (p: Partial<typeof onion>) => store().setUi((ui) => ({ onion: { ...ui.onion, ...p } }));
  const step = (key: 'before' | 'after', by: number) => set({ [key]: Math.max(0, Math.min(8, onion[key] + by)) });
  return (
    <span className="tl-group tl-onion">
      <Btn id="timeline.toggleOnion" icon="onion" title="See the frames around this one (onion skin)" pressed={onion.enabled} />
      <button
        type="button"
        className="tl-btn tl-btn-mini"
        title="Onion skin settings"
        aria-label="Onion skin settings"
        aria-haspopup="dialog"
        aria-expanded={!!pos}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos(pos ? null : { x: r.left, y: r.bottom + 4 });
        }}
      >
        <Icon name="chevron-down" size={14} />
      </button>
      {pos ? (
        <Floating x={pos.x} y={pos.y} onClose={() => setPos(null)} className="tl-pop">
          <div className="tl-pop-title">Onion skin</div>
          <p className="tl-pop-note">Faint ghosts of the frames around this one, to help you line up your next drawing.</p>
          <div className="tl-pop-row">
            <span>Frames before</span>
            <span className="tl-stepper">
              <button type="button" className="tl-btn tl-btn-mini" aria-label="Fewer frames before" onClick={() => step('before', -1)}><Icon name="minus" size={12} /></button>
              <output>{onion.before}</output>
              <button type="button" className="tl-btn tl-btn-mini" aria-label="More frames before" onClick={() => step('before', 1)}><Icon name="plus" size={12} /></button>
            </span>
            <input type="color" aria-label="Colour of frames before" value={onion.beforeColor.slice(0, 7)} onChange={(e) => set({ beforeColor: e.target.value })} />
          </div>
          <div className="tl-pop-row">
            <span>Frames after</span>
            <span className="tl-stepper">
              <button type="button" className="tl-btn tl-btn-mini" aria-label="Fewer frames after" onClick={() => step('after', -1)}><Icon name="minus" size={12} /></button>
              <output>{onion.after}</output>
              <button type="button" className="tl-btn tl-btn-mini" aria-label="More frames after" onClick={() => step('after', 1)}><Icon name="plus" size={12} /></button>
            </span>
            <input type="color" aria-label="Colour of frames after" value={onion.afterColor.slice(0, 7)} onChange={(e) => set({ afterColor: e.target.value })} />
          </div>
          <label className="tl-pop-row">
            <span>Strength</span>
            <input type="range" min={5} max={100} value={Math.round(onion.opacity * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} />
            <output>{Math.round(onion.opacity * 100)}%</output>
          </label>
          <label className="tl-pop-check">
            <input type="checkbox" checked={onion.tint} onChange={(e) => set({ tint: e.target.checked })} />
            <span>Tint the ghosts (so before and after look different)</span>
          </label>
          <label className="tl-pop-check">
            <input type="checkbox" checked={!!onion.keysOnly} onChange={(e) => set({ keysOnly: e.target.checked })} />
            <span>Only show keys (skip held frames)</span>
          </label>
        </Floating>
      ) : null}
    </span>
  );
}

function PlayRange() {
  const clip = useStore((s) => {
    const id = tl().clipId;
    return id ? s.doc.clips.find((c) => c.id === id) : undefined;
  });
  const io = useStore((s) => s.doc.inOut);
  useTl((t) => t.clipId);
  if (!clip && io) {
    const r = inOutRange(store().get().doc);
    if (!r) return null;
    return (
      <span className="tl-range" title="Only the play range plays. Drag its ends on the ruler, or Shift and drag along the ruler to mark a new one.">
        <Icon name="range" size={14} />
        <span>Frames {r.start + 1} to {r.end + 1}</span>
        <button type="button" className="tl-btn tl-btn-mini" aria-label="Play everything again" onClick={() => clearInOut()}><Icon name="close" size={12} /></button>
      </span>
    );
  }
  if (!clip) return null;
  const r = playRange(store().get().doc, clip.id);
  return (
    <span className="tl-range" title="Only this clip plays. Click it again in the clips row to play everything.">
      <Icon name="clip" size={14} />
      <span>{clip.name} (frames {r.start + 1} to {r.end + 1})</span>
      <button type="button" className="tl-btn tl-btn-mini" aria-label="Play everything again" onClick={() => setTl({ clipId: null })}><Icon name="close" size={12} /></button>
    </span>
  );
}

function LightTableChip() {
  const lt = useStore((s) => s.ui.lightTable);
  const doc = useStore((s) => s.doc);
  if (!lt) return null;
  return (
    <span className="tl-range tl-lighttable" title="Shown faintly on every frame, to trace over (light table). Click to go to it.">
      <button type="button" className="tl-btn tl-btn-mini" aria-label={`Go to frame ${lt.frame + 1}`} onClick={() => store().setUi({ frame: lt.frame })}>
        <Icon name="image" size={14} />
        <span>Light table: {lightTableLabel(doc, lt)}</span>
      </button>
      <input
        type="range"
        min={10}
        max={70}
        value={Math.round(lt.opacity * 100)}
        aria-label="Light table strength"
        title="How strongly it shows"
        onChange={(e) => store().setUi((ui) => (ui.lightTable ? { lightTable: { ...ui.lightTable, opacity: Number(e.target.value) / 100 } } : {}))}
      />
      <button type="button" className="tl-btn tl-btn-mini" aria-label="Clear the light table" onClick={() => clearLightTable()}><Icon name="close" size={12} /></button>
    </span>
  );
}

export function Header() {
  const playing = useStore((s) => s.ui.playing);
  const loop = useStore((s) => s.ui.loopPlayback);
  const pingPong = useStore((s) => !!s.ui.pingPong);
  const cw = useTl((t) => t.cw);
  return (
    <div className="tl-header" role="toolbar" aria-label="Timeline controls">
      <span className="tl-group" role="group" aria-label="Playback">
        <Btn id="timeline.firstFrame" icon="first" title="Go to the first frame" />
        <Btn id="timeline.prevFrame" icon="prev" title="Back one frame" />
        <button type="button" className={`tl-btn tl-play${playing ? ' is-on' : ''}`} title={tip('timeline.play', playing ? 'Pause' : 'Play your animation')} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} onClick={() => runCmd('timeline.play')}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <Btn id="timeline.nextFrame" icon="next" title="Forward one frame" />
        <Btn id="timeline.lastFrame" icon="last" title="Go to the last frame" />
        <Btn id="timeline.toggleLoop" icon="loop" title="Loop: start again at the end" pressed={loop} />
        <Btn id="timeline.togglePingPong" icon="pingpong" title="Play back and forth (ping-pong)" pressed={pingPong} />
      </span>
      <Counter />
      <FpsField />
      <PlayRange />
      <LightTableChip />
      <span className="tl-sep" aria-hidden="true" />
      <span className="tl-group" role="group" aria-label="Drawings and frames">
        <Btn id="timeline.newKey" icon="key" text={<>New<span className="tl-long"> drawing</span></>} title="Start a new blank drawing on this frame (new key)" />
        <Btn id="timeline.duplicateKey" icon="duplicate" text="Copy" title="Copy this drawing to the next frame (duplicate key)" />
        <Btn id="timeline.insertFrame" icon="plus" text="Frame" title="Add a frame: hold this drawing one frame longer" className="tl-btn-frame" />
        <Btn id="timeline.removeFrame" icon="minus" text="Frame" title="Remove a frame" className="tl-btn-frame" />
      </span>
      <HoldButtons />
      <SoundButton />
      <span className="tl-sep" aria-hidden="true" />
      <OnionControls />
      <span className="tl-grow" />
      <label className="tl-zoom" title="Zoom the timeline (or hold Ctrl and scroll)">
        <Icon name="zoom" size={14} />
        <input type="range" aria-label="Timeline zoom" min={MIN_CW} max={MAX_CW} value={cw} onChange={(e) => setTl({ cw: Number(e.target.value) })} />
      </label>
    </div>
  );
}
