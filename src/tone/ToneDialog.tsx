// Curves and Levels: one dialog with two tabs. A small live copy of the picture shows the change as you drag (a selection keeps
// the change inside it when you press Apply). Apply is one undo step.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { mountModal, Modal } from '../io/mount';
import { hint } from '../canvas/controller';
import { gridPixels } from '../core/pixelBounds';
import { store } from '../core/store';
import { activeDrawing, activeGrid, activeLayer, EDIT_HINTS } from '../tools/edit';
import { docPalette, paletteAlpha, paletteRgb, reduceToPalette } from '../pixel/palette';
import { editPixels } from '../pixel/commands';
import { pixelSelection } from '../select/pixel-state';
import {
  addPoint, applyLuts, autoPoints, CHANNELS, curveLut, CURVE_PRESETS, evalCurve, gammaFromHandle, gammaHandleAt, histograms, isNeutralTone, MAX_POINTS, movePoint, neutralLevels, neutralTone, pointNear, removePoint,
  straightCurve, toneLuts, whatChanged, withBlack, withGamma, withWhite, type Channel, type Curve, type Histograms, type Tone,
} from './maths';
import { contentBox, cropTo, shrinkToFit, type Small } from './preview';
import './tone.css';

export type ToneTab = 'levels' | 'curves';

const CHANNEL_WORDS: Record<Channel, { label: string; hint: string }> = {
  all: { label: 'All colours', hint: 'Changes red, green and blue together: brighter, darker or more contrast.' },
  r: { label: 'Red', hint: 'Changes the red alone. Pull it down to take a red cast off the picture.' },
  g: { label: 'Green', hint: 'Changes the green alone. Pull it down to take a green cast off the picture.' },
  b: { label: 'Blue', hint: 'Changes the blue alone. Pull it down to take a blue cast off the picture.' },
};

/** The part of the histogram worth drawing: tall spikes at the very ends are cut short so the rest can be seen. */
export function histogramHeights(hist: ArrayLike<number>): number[] {
  const sorted = Array.from({ length: 256 }, (_, i) => hist[i]).sort((a, b) => a - b);
  const cap = Math.max(1, sorted[Math.floor(255 * 0.99)]);
  return Array.from({ length: 256 }, (_, i) => Math.min(1, hist[i] / cap));
}

function Histogram({ hist, height, top = 0 }: { hist: ArrayLike<number>; height: number; top?: number }) {
  const d = useMemo(() => {
    const hs = histogramHeights(hist);
    let path = '';
    for (let i = 0; i < 256; i++) if (hs[i] > 0.004) path += `M${i},${top + height}V${(top + height - hs[i] * height).toFixed(1)}h1V${top + height}z`;
    return path;
  }, [hist, height, top]);
  return <path className="tn-hist" d={d} />;
}

/** Keeps the pointer's moves coming to the graph while it is dragged outside it. Quietly does without when the pointer cannot be captured (a pointer made up by a script). */
function capture(el: Element | null, id: number): void {
  try {
    el?.setPointerCapture(id);
  } catch {
    // Nothing to capture: the moves still reach the graph while the pointer is over it.
  }
}
function release(el: Element | null, id: number): void {
  try {
    el?.releasePointerCapture(id);
  } catch {
    // It was never captured.
  }
}

/** A pointer's place on a 256 by 256 graph, 0 to 255 each way, y going up. */
function graphPoint(e: { clientX: number; clientY: number }, svg: SVGSVGElement, vbW: number, vbH: number, top = 0, h = 256): { x: number; y: number } {
  const r = svg.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * vbW;
  const y = ((e.clientY - r.top) / r.height) * vbH;
  return { x: Math.max(0, Math.min(255, x)), y: Math.max(0, Math.min(255, 255 - ((y - top) / h) * 255)) };
}

function CurveGraph({ curve, hist, channel, onChange }: { curve: Curve; hist: ArrayLike<number>; channel: Channel; onChange: (c: Curve) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const held = useRef(-1);
  const [heldNow, setHeldNow] = useState(-1);
  const lut = useMemo(() => curveLut(curve), [curve]);
  const line = useMemo(() => {
    let p = '';
    for (let x = 0; x < 256; x++) p += `${x === 0 ? 'M' : 'L'}${x},${255 - evalCurve(curve, x)}`;
    return p;
  }, [curve]);
  void lut;

  const down = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !svg.current) return;
    const p = graphPoint(e, svg.current, 256, 256);
    // Grab a point if the click is on one; otherwise put a new one right where the click is, and carry on dragging it.
    let i = pointNear(curve, p.x, p.y, 11);
    if (i < 0) {
      const r = addPoint(curve, p.x, p.y);
      if (r.index < 0) return hint(`A curve holds up to ${MAX_POINTS} points. Double-click one to take it away.`);
      i = r.index;
      onChange(r.curve);
    }
    held.current = i;
    setHeldNow(i);
    capture(svg.current, e.pointerId);
    e.preventDefault();
  };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    if (held.current < 0 || !svg.current) return;
    const p = graphPoint(e, svg.current, 256, 256);
    onChange(movePoint(curve, held.current, p.x, p.y));
  };
  const up = (e: RPointerEvent<SVGSVGElement>) => {
    if (held.current < 0) return;
    held.current = -1;
    setHeldNow(-1);
    release(svg.current, e.pointerId);
  };
  const key = (i: number) => (e: KeyboardEvent<SVGCircleElement>) => {
    const step = e.shiftKey ? 8 : 1;
    const p = curve[i];
    let next: Curve | null = null;
    if (e.key === 'ArrowLeft') next = movePoint(curve, i, p.x - step, p.y);
    else if (e.key === 'ArrowRight') next = movePoint(curve, i, p.x + step, p.y);
    else if (e.key === 'ArrowUp') next = movePoint(curve, i, p.x, p.y + step);
    else if (e.key === 'ArrowDown') next = movePoint(curve, i, p.x, p.y - step);
    else if (e.key === 'Delete' || e.key === 'Backspace') next = removePoint(curve, i);
    if (next) {
      e.preventDefault();
      onChange(next);
    }
  };

  return (
    <svg ref={svg} className="tn-graph" data-channel={channel} data-testid="tone-curve" viewBox="-8 -8 272 272" role="group" aria-label="The curve: brightness going in along the bottom, brightness coming out up the side. Click to add a point, drag a point to bend it, double-click a point to take it away." onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <Histogram hist={hist} height={256} />
      <path className="tn-grid" d="M64,0V256M128,0V256M192,0V256M0,64H256M0,128H256M0,192H256" />
      <path className="tn-ref" d="M0,256L256,0" />
      <path className="tn-line" d={line} />
      {curve.map((p, i) => (
        <circle
          key={i}
          className="tn-pt"
          data-held={heldNow === i}
          cx={p.x}
          cy={255 - p.y}
          r={5.5}
          tabIndex={0}
          role="slider"
          aria-label={`Curve point ${i + 1} of ${curve.length}`}
          aria-valuemin={0}
          aria-valuemax={255}
          aria-valuenow={p.y}
          aria-valuetext={`In ${p.x}, out ${p.y}`}
          onKeyDown={key(i)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onChange(removePoint(curve, i));
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onChange(removePoint(curve, i));
          }}
        />
      ))}
    </svg>
  );
}

type Handle = 'black' | 'gamma' | 'white';

function LevelsGraph({ levels, hist, channel, onChange }: { levels: Tone['levels'][Channel]; hist: ArrayLike<number>; channel: Channel; onChange: (l: Tone['levels'][Channel]) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const held = useRef<Handle | null>(null);
  const H = 130;
  const move = (e: { clientX: number; clientY: number }) => {
    if (!held.current || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(255, ((e.clientX - r.left) / r.width) * 272 - 8));
    if (held.current === 'black') onChange(withBlack(levels, Math.round(x)));
    else if (held.current === 'white') onChange(withWhite(levels, Math.round(x)));
    else onChange(withGamma(levels, gammaFromHandle(levels, x)));
  };
  const grab = (h: Handle) => (e: RPointerEvent<SVGElement>) => {
    held.current = h;
    capture(svg.current, e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };
  const key = (h: Handle) => (e: KeyboardEvent<SVGElement>) => {
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    if (h === 'black') onChange(withBlack(levels, levels.black + dir * step));
    else if (h === 'white') onChange(withWhite(levels, levels.white + dir * step));
    else onChange(withGamma(levels, levels.gamma + dir * 0.05 * step));
  };
  const tri = (x: number, fill: string, h: Handle, label: string, now: number) => (
    <path
      className="tn-handle"
      d={`M${x},${H + 2}l7,13h-14z`}
      style={{ fill }}
      tabIndex={0}
      role="slider"
      aria-label={label}
      aria-valuenow={now}
      aria-valuemin={0}
      aria-valuemax={h === 'gamma' ? 9.99 : 255}
      onPointerDown={grab(h)}
      onKeyDown={key(h)}
    />
  );
  return (
    <svg
      ref={svg}
      className="tn-graph"
      data-channel={channel}
      data-testid="tone-levels"
      viewBox={`-8 -8 272 ${H + 32}`}
      role="group"
      aria-label="Where the picture's tones sit. Drag the black handle to the darkest part, the white one to the lightest, and the grey one to brighten or darken the middle."
      style={{ cursor: 'default' }}
      onPointerMove={move}
      onPointerUp={() => (held.current = null)}
      onPointerCancel={() => (held.current = null)}
    >
      <Histogram hist={hist} height={H} />
      <rect x={0} y={0} width={256} height={H} className="tn-grid" />
      {tri(levels.black, '#1b1b1f', 'black', 'Darkest: anything this dark becomes black', levels.black)}
      {tri(gammaHandleAt(levels), '#9a9aa2', 'gamma', 'Midtones: brighten or darken the middle', levels.gamma)}
      {tri(levels.white, '#fbfbfd', 'white', 'Lightest: anything this light becomes white', levels.white)}
    </svg>
  );
}

function Preview({ small, luts, original }: { small: Small; luts: ReturnType<typeof toneLuts>; original: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = small.width;
    c.height = small.height;
    const g = c.getContext('2d');
    if (!g) return;
    const px = original ? small.pixels : applyLuts(small.pixels, luts);
    g.putImageData(new ImageData(new Uint8ClampedArray(px), small.width, small.height), 0, 0);
  }, [small, luts, original]);
  return <canvas ref={ref} className="tn-preview" role="img" aria-label={original ? 'The picture as it is now' : 'The picture with the change'} data-testid="tone-preview" />;
}

function Num({ label, value, min, max, step, onChange, hint: tip }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; hint: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="tn-field" title={tip}>
      <span>{label}</span>
      <input
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        onBlur={() => setText(String(value))}
        aria-label={label}
      />
    </label>
  );
}

/** What the dialog works on: the picture, a small copy of it to preview, and how many pixels there are of each brightness. */
export interface ToneInput {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export function ToneDialog({ img, tab: first, close, apply }: { img: ToneInput; tab: ToneTab; close: () => void; apply: (tone: Tone) => void }) {
  const [tab, setTab] = useState<ToneTab>(first);
  const [channel, setChannel] = useState<Channel>('all');
  const [tone, setTone] = useState<Tone>(neutralTone);
  const [original, setOriginal] = useState(false);
  const hists: Histograms = useMemo(() => {
    const sel = pixelSelection();
    const keep = sel && sel.width === img.width && sel.height === img.height ? sel.bits : null;
    return histograms(img.pixels, keep);
  }, [img]);
  const small = useMemo(() => {
    const box = contentBox(img);
    return shrinkToFit(box ? cropTo(img, box) : img, 320);
  }, [img]);
  const luts = useMemo(() => toneLuts(tone), [tone]);
  const neutral = isNeutralTone(tone);
  const levels = tone.levels[channel];
  const curve = tone.curves[channel];
  const setLevels = (l: Tone['levels'][Channel]) => setTone((t) => ({ ...t, levels: { ...t.levels, [channel]: l } }));
  const setCurve = (c: Curve) => setTone((t) => ({ ...t, curves: { ...t.curves, [channel]: c } }));
  const autoFrom = () => {
    const p = autoPoints(hists[channel]);
    if (!p) return hint('There is nothing to stretch here: the picture has one tone, or nothing painted.');
    setLevels({ ...neutralLevels(), black: p.black, white: Math.max(p.white, p.black + 2) });
  };

  return (
    <Modal title="Curves and Levels" onClose={close} wide>
      <div className="io-body">
        <div className="tn-body">
          <div className="tn-side">
            <Preview small={small} luts={luts} original={original} />
            <button type="button" className="io-btn tn-compare" aria-pressed={original} onClick={() => setOriginal((v) => !v)} title="Switch between the picture with your change and the picture as it is now">
              {original ? 'Showing the original. Click for your change' : 'Compare with the original'}
            </button>
            <p className="tn-note">A small copy of the picture shows the change as you go. A selection keeps the change inside it, and the whole thing is one undo.</p>
          </div>
          <div className="tn-tools">
            <div className="tn-tabs" role="tablist" aria-label="Levels or Curves">
              {(['levels', 'curves'] as const).map((t) => (
                <button key={t} type="button" role="tab" className="tn-tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`tone-tab-${t}`}>
                  {t === 'levels' ? 'Levels' : 'Curves'}
                </button>
              ))}
            </div>
            <div className="tn-channels" role="radiogroup" aria-label="Which colours">
              {CHANNELS.map((c) => (
                <button key={c} type="button" role="radio" className="tn-chan" data-channel={c} aria-checked={channel === c} title={CHANNEL_WORDS[c].hint} onClick={() => setChannel(c)}>
                  {c !== 'all' && <i />}
                  {CHANNEL_WORDS[c].label}
                </button>
              ))}
            </div>
            {tab === 'levels' ? (
              <>
                <LevelsGraph levels={levels} hist={hists[channel]} channel={channel} onChange={setLevels} />
                <div className="tn-fields">
                  <Num label="Darkest" value={levels.black} min={0} max={253} step={1} onChange={(v) => setLevels(withBlack(levels, v))} hint="Anything this dark or darker becomes black. Raise it to deepen the shadows." />
                  <Num label="Midtones" value={levels.gamma} min={0.1} max={9.99} step={0.05} onChange={(v) => setLevels(withGamma(levels, v))} hint="1 leaves the middle alone. Above 1 brightens it, below 1 darkens it." />
                  <Num label="Lightest" value={levels.white} min={2} max={255} step={1} onChange={(v) => setLevels(withWhite(levels, v))} hint="Anything this light or lighter becomes white. Lower it to brighten the highlights." />
                </div>
                <div className="tn-quick">
                  <button type="button" onClick={autoFrom} title="Stretch the picture to use the whole range from black to white, ignoring a few stray pixels at each end">
                    Stretch to fit (auto)
                  </button>
                  <button type="button" onClick={() => setLevels(neutralLevels())}>Reset these</button>
                </div>
                <p className="tn-note">The grey shape is how many pixels there are of each brightness, dark on the left to light on the right. A flat, washed out picture sits in the middle: drag the black and white handles in to where the shape starts and ends.</p>
              </>
            ) : (
              <>
                <CurveGraph curve={curve} hist={hists[channel]} channel={channel} onChange={setCurve} />
                <div className="tn-quick">
                  {CURVE_PRESETS.map((p) => (
                    <button key={p.id} type="button" title={p.hint} onClick={() => setCurve(p.curve)}>
                      {p.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setCurve(straightCurve())} title="Put this curve back to a straight line, which changes nothing">
                    Straight
                  </button>
                </div>
                <p className="tn-note">Brightness going in runs along the bottom, coming out runs up the side. Click the line to add a point and drag it: pulling up lightens that part, pushing down darkens it. Double-click a point to take it away.</p>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" onClick={() => setTone(neutralTone())} disabled={neutral}>
          Start again
        </button>
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" disabled={neutral} onClick={() => apply(tone)} data-testid="tone-apply">
          Apply
        </button>
      </div>
    </Modal>
  );
}

/** The name of the undo step: what was actually changed. */
export const toneLabel = (t: Tone): string => {
  const c = whatChanged(t);
  return c.levels && c.curves ? 'Levels and curves' : c.curves ? 'Curves' : 'Levels';
};

/** What Apply does to the active drawing: the tables on every pixel (or just the selected ones), kept to the palette on a locked layer. One undo step. */
export function applyTone(tone: Tone): boolean {
  const { layer } = activeLayer();
  const pal = layer && layer.kind === 'pixel' && layer.paletteLock ? docPalette(store().get().doc) : null;
  const luts = toneLuts(tone);
  return editPixels(toneLabel(tone), (img) => {
    const out = applyLuts(img.pixels, luts);
    return pal ? reduceToPalette(out, paletteRgb(pal.colors), paletteAlpha(pal.colors)).pixels : out;
  });
}

/** The reason Curves and Levels cannot be used right now, in words, or null when they can. Cheap: it only looks at whether there is a drawing. */
export function toneProblem(): string | null {
  const { layer, problem } = activeLayer();
  if (problem) return EDIT_HINTS[problem];
  if (!layer || layer.kind !== 'pixel') return 'Curves and Levels change the pixels of a pixel layer. Pick one in the Layers panel, or add one.';
  const d = activeDrawing();
  const g = activeGrid();
  if (!d || d.kind !== 'pixel' || !g || d.width === 0 || d.height === 0) return 'There is nothing drawn on this frame yet.';
  return null;
}

export function openToneDialog(tab: ToneTab = 'curves'): void {
  const problem = toneProblem();
  if (problem) return hint(problem);
  const d = activeDrawing()!;
  const g = activeGrid()!;
  const img: ToneInput = { width: g.width, height: g.height, pixels: gridPixels(d as never, g.width, g.height) };
  mountModal((close) => (
    <ToneDialog
      img={img}
      tab={tab}
      close={close}
      apply={(tone) => {
        if (applyTone(tone)) close();
      }}
    />
  ));
}
