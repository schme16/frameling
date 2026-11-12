import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { celAt, findLayer } from '../core/doc';
import { store, useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { keyHint, runCmd, tip } from './cmd';
import { seconds } from './geometry';
import { ContextMenu, Floating, type MenuItem } from './Menu';
import { getCommand } from '../core/registry';
import * as ops from './ops';
import { inOutRange, playRange } from './playback';
import { clearInOut } from './range';
import { clearLightTable, lightTableLabel } from '../canvas/lightTable';
import { MAX_CW, MIN_CW, setTl, tl, useTl } from './state';
import { SoundButton } from '../audio/SoundButton';
import { usePrefs } from '../ui/prefs';
import { moreRequest } from './headerMenu';
import { FOLD_STEPS, chooseFold, foldedAt, foldSlack, switchLabel, type FoldStep } from './headerFold';

function Btn({ id, icon, text, title, pressed, disabled, onClick, className = '', step }: { id?: string; icon?: string; text?: ReactNode; title: string; pressed?: boolean; disabled?: boolean; onClick?: () => void; className?: string; step?: FoldStep }) {
  return (
    <button
      type="button"
      className={`tl-btn${pressed ? ' is-on' : ''} ${className}`}
      title={id ? tip(id, title) : title}
      // Speech users say what they see, so the visible words have to be in the name.
      aria-label={typeof text === 'string' && !title.toLowerCase().includes(text.toLowerCase()) ? `${text}: ${title}` : title}
      aria-pressed={pressed}
      data-step={step}
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

/** The onion skin settings box. It sits at a point on screen, and is opened from its header button or, when that is folded, from the "more" menu. */
function OnionPopup({ pos, onClose }: { pos: { x: number; y: number }; onClose: () => void }) {
  const onion = useStore((s) => s.ui.onion);
  const set = (p: Partial<typeof onion>) => store().setUi((ui) => ({ onion: { ...ui.onion, ...p } }));
  const step = (key: 'before' | 'after', by: number) => set({ [key]: Math.max(0, Math.min(8, onion[key] + by)) });
  return (
    <Floating x={pos.x} y={pos.y} onClose={onClose} className="tl-pop">
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
  );
}

function OnionControls() {
  const onion = useStore((s) => s.ui.onion);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
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
      {pos ? <OnionPopup pos={pos} onClose={() => setPos(null)} /> : null}
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
        <span className="tl-chip-long">Frames {r.start + 1} to {r.end + 1}</span>
        <span className="tl-chip-short">{r.start + 1}-{r.end + 1}</span>
        <button type="button" className="tl-btn tl-btn-mini" aria-label="Play everything again" onClick={() => clearInOut()}><Icon name="close" size={12} /></button>
      </span>
    );
  }
  if (!clip) return null;
  const r = playRange(store().get().doc, clip.id);
  return (
    <span className="tl-range" title="Only this clip plays. Click it again in the clips row to play everything.">
      <Icon name="clip" size={14} />
      <span className="tl-chip-long">{clip.name} (frames {r.start + 1} to {r.end + 1})</span>
      <span className="tl-chip-short">{clip.name}</span>
      <button type="button" className="tl-btn tl-btn-mini" aria-label="Play everything again" onClick={() => setTl({ clipId: null })}><Icon name="close" size={12} /></button>
    </span>
  );
}

function LightTableChip() {
  const lt = useStore((s) => s.ui.lightTable);
  const doc = useStore((s) => s.doc);
  if (!lt) return null;
  return (
    <span className="tl-range tl-lighttable" aria-label={`Light table: ${lightTableLabel(doc, lt)}`} title="Shown faintly on every frame, to trace over (light table). Click to go to it.">
      <button type="button" className="tl-btn tl-btn-mini" aria-label={`Go to frame ${lt.frame + 1}`} onClick={() => store().setUi({ frame: lt.frame })}>
        <Icon name="image" size={14} />
        <span className="tl-chip-long">Light table: {lightTableLabel(doc, lt)}</span>
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

// What each folded step puts in the "more" menu. Hold is a choice of one (not a switch), the others toggle or act.
const STEP_COMMANDS: Record<FoldStep, string[]> = {
  pingpong: ['timeline.togglePingPong'],
  sound: ['audio.import'],
  clean: ['view.cleanTimeline'],
  fit: ['timeline.zoomFit'],
  edit: ['timeline.newKey', 'timeline.duplicateKey', 'timeline.insertFrame', 'timeline.removeFrame'],
  hold: ['timeline.hold1', 'timeline.hold2', 'timeline.hold3', 'timeline.hold4'],
  onion: ['timeline.toggleOnion'],
  zoom: [],
};

/** The commands in the "more" menu for the steps folded at this level, and which of them are switches that are on. */
function overflowCommands(folded: FoldStep[]) {
  return folded
    .flatMap((st) => STEP_COMMANDS[st].map((id) => ({ id, step: st })))
    .map((o) => ({ ...o, cmd: getCommand(o.id) }))
    .filter((o): o is typeof o & { cmd: NonNullable<typeof o.cmd> } => !!o.cmd);
}

function OverflowMenu({ folded }: { folded: FoldStep[] }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // The onion settings box, when the person picks it from the menu (its own button is folded): it opens under the "more" button.
  const [onionPos, setOnionPos] = useState<{ x: number; y: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = overflowCommands(folded);
  const below = () => {
    const r = btn.current?.getBoundingClientRect();
    return r ? { x: r.left, y: r.bottom + 4 } : null;
  };
  // Which folded switches are on: the string only changes when one flips, so the header doesn't redraw on every edit.
  usePrefs((p) => p.cleanTimeline);
  const states = useStore((s) => list.map((o) => (o.cmd.checked?.(s) ? '1' : '0')).join(''));
  const on = list.filter((o, i) => o.step !== 'hold' && states[i] === '1').length;
  // Something outside (a quest) asked for the menu, to show a button that is folded into it.
  const asked = moreRequest.use((r) => r);
  useEffect(() => {
    if (!asked) return;
    moreRequest.set(false);
    const at = below();
    if (at && folded.length) setPos(at);
  }, [asked, folded.length]);
  const items: MenuItem[] = [];
  list.forEach((o) => {
    // Hold is a choice of one: a named group of its four, found like the folded hold buttons.
    if (o.id === 'timeline.hold1') items.push({ heading: 'Hold for', aria: 'How long to hold this drawing' });
    items.push({ label: o.cmd.label, aria: o.cmd.label, hint: keyHint(o.id), checked: o.cmd.checked ? o.cmd.checked(store().get()) : undefined, onClick: () => runCmd(o.id) });
    if (o.id === 'timeline.toggleOnion') items.push({ label: 'Onion skin settings...', aria: 'Onion skin settings', onClick: () => setOnionPos(below()) });
  });
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="tl-btn tl-overflow"
        title="More timeline buttons"
        aria-label={switchLabel(on)}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={() => setPos(pos ? null : below())}
      >
        <span aria-hidden="true">{'⋯'}</span>
        {on ? <i className="tl-overflow-dot" aria-hidden="true" /> : null}
      </button>
      {pos ? <ContextMenu x={pos.x} y={pos.y} items={items} onClose={() => setPos(null)} className="tl-more-menu" /> : null}
      {onionPos ? <OnionPopup pos={onionPos} onClose={() => setOnionPos(null)} /> : null}
    </>
  );
}

/** The width the header's visible items need on one row: padding, every shown item at its natural width, and the gaps. */
function neededWidth(h: HTMLElement): number {
  const cs = getComputedStyle(h);
  let n = 0;
  let sum = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  for (const c of Array.from(h.children)) {
    if (getComputedStyle(c).display === 'none') continue;
    n++;
    if (!c.classList.contains('tl-grow')) sum += c.getBoundingClientRect().width;
  }
  return sum + (parseFloat(cs.columnGap) || 0) * Math.max(0, n - 1);
}

const setFolded = (h: HTMLElement, level: number) => h.setAttribute('data-folded', foldedAt(level).join(' '));

/**
 * Folds the header's buttons into the "more" menu only as far as the real width needs (the rarest first), and unfolds
 * them only once there is a little spare room, so a chip appearing or the width hovering at a boundary doesn't flicker.
 */
function useFolding(ref: { current: HTMLElement | null }): number {
  const [level, setLevel] = useState(0);
  useLayoutEffect(() => {
    const h = ref.current;
    if (!h) return;
    let cur = 0;
    const fit = (probeDown: boolean) => {
      const next = chooseFold(cur, FOLD_STEPS.length, (l) => (setFolded(h, l), neededWidth(h)), h.clientWidth, foldSlack, probeDown);
      setFolded(h, next);
      if (next !== cur) {
        cur = next;
        setLevel(next);
      }
    };
    fit(true);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => fit(true));
    ro?.observe(h);
    // Chips and buttons coming and going can free or need room; a changing number (the frame counter) can only need it.
    const mo = new MutationObserver((rs) => fit(rs.some((r) => r.type === 'childList')));
    mo.observe(h, { childList: true, subtree: true, characterData: true });
    void document.fonts?.ready.then(() => fit(true));
    return () => {
      ro?.disconnect();
      mo.disconnect();
    };
  }, [ref]);
  return level;
}

export function Header() {
  const playing = useStore((s) => s.ui.playing);
  const loop = useStore((s) => s.ui.loopPlayback);
  const pingPong = useStore((s) => !!s.ui.pingPong);
  const cw = useTl((t) => t.cw);
  const clean = usePrefs((p) => p.cleanTimeline);
  const ref = useRef<HTMLDivElement>(null);
  const level = useFolding(ref);
  return (
    <div ref={ref} className="tl-header" role="toolbar" aria-label="Timeline controls">
      <span className="tl-group" role="group" aria-label="Playback">
        <Btn id="timeline.firstFrame" icon="first" title="Go to the first frame" />
        <Btn id="timeline.prevFrame" icon="prev" title="Back one frame" />
        <button type="button" className={`tl-btn tl-play${playing ? ' is-on' : ''}`} title={tip('timeline.play', playing ? 'Pause' : 'Play your animation')} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} onClick={() => runCmd('timeline.play')}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <Btn id="timeline.nextFrame" icon="next" title="Forward one frame" />
        <Btn id="timeline.lastFrame" icon="last" title="Go to the last frame" />
        <Btn id="timeline.toggleLoop" icon="loop" title="Loop: start again at the end" pressed={loop} />
        <Btn id="timeline.togglePingPong" icon="pingpong" title="Play back and forth (ping-pong)" pressed={pingPong} step="pingpong" />
      </span>
      <Counter />
      <FpsField />
      <PlayRange />
      <LightTableChip />
      <span className="tl-sep" data-sep="1" aria-hidden="true" />
      <span className="tl-group" role="group" aria-label="Drawings and frames" data-step="edit">
        <Btn id="timeline.newKey" icon="key" text={<>New<span className="tl-long"> drawing</span></>} title="Start a new blank drawing on this frame (new key)" />
        <Btn id="timeline.duplicateKey" icon="duplicate" text="Copy" title="Copy this drawing to the next frame (duplicate key)" />
        <Btn id="timeline.insertFrame" icon="plus" text="Frame" title="Add a frame: hold this drawing one frame longer" className="tl-btn-frame" />
        <Btn id="timeline.removeFrame" icon="minus" text="Frame" title="Remove a frame" className="tl-btn-frame" />
      </span>
      <span data-step="hold">
        <HoldButtons />
      </span>
      <span data-step="sound">
        <SoundButton />
      </span>
      <span className="tl-sep" data-sep="2" aria-hidden="true" />
      <span data-step="onion">
        <OnionControls />
      </span>
      <span className="tl-grow" />
      <OverflowMenu folded={foldedAt(level)} />
      <Btn id="view.cleanTimeline" icon="sliders" title="Clean timeline: plain blocks, no property rows" pressed={clean} className="tl-btn-mini tl-look-toggle" step="clean" />
      <label className="tl-zoom" title="Zoom the timeline (or hold Ctrl and scroll)">
        <button type="button" className="tl-btn tl-btn-mini" data-step="fit" title={tip('timeline.zoomFit', 'Fit the whole animation in view')} aria-label="Fit the whole animation in view" onClick={() => runCmd('timeline.zoomFit')}>
          <Icon name="zoom" size={14} />
        </button>
        <input type="range" data-step="zoom" aria-label="Timeline zoom" min={MIN_CW} max={MAX_CW} value={cw} onChange={(e) => setTl({ cw: Number(e.target.value) })} />
      </label>
    </div>
  );
}
