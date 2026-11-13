// Preferences, Pen and tablet: try the pen, shape the pressure curve, say what the barrel buttons and the eraser end do,
// choose what fingers do, and see what each tool does with pressure, tilt and the stabilizer.
import { useEffect, useRef, useState } from 'react';
import { Row, Segmented, Switch } from '../ui/PrefsModal';
import { BARREL_ACTIONS, barrelBits, firstBarrelBit, penPress, type BarrelAction } from './buttons';
import { penTools } from './tool';
import { CurveEditor } from './CurveEditor';
import { CURVE_PRESETS, PRESET_ORDER, presetOf, type CurvePreset } from './curve';
import { penFields } from './input';
import { PEN_TOOLS, penStore, resetPen, setPenDevice, setToolPen, setTouch, type OneFinger, type PenTool } from './settings';
import { altitudeOf, azimuthOf } from './tilt';
import './tablet.css';

const TOOL_LABEL: Record<PenTool, string> = { brush: 'Brush (pixel layers)', pencil: 'Pencil', eraser: 'Eraser', spray: 'Spray', shade: 'Shade', dither: 'Dither' };
/** Which columns make sense for which tool. */
const HAS: Record<PenTool, { size: boolean; opacity: boolean; flow: boolean }> = {
  brush: { size: true, opacity: false, flow: false },
  pencil: { size: true, opacity: true, flow: false },
  eraser: { size: true, opacity: false, flow: false },
  spray: { size: true, opacity: false, flow: true },
  shade: { size: true, opacity: false, flow: false },
  dither: { size: true, opacity: false, flow: false },
};

interface Reading {
  type: string;
  raw: number;
  out: number;
  tiltX?: number;
  tiltY?: number;
  twist?: number;
  parts: string;
}

/** A pad to scribble on: draws with the pen's curved pressure and says what the browser is being told. */
function TestPad({ onRaw }: { onRaw: (raw: number | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [read, setRead] = useState<Reading | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
  }, []);

  const sample = (e: PointerEvent | React.PointerEvent, draw: boolean) => {
    const c = ref.current;
    if (!c) return;
    const pen = penStore.get().pen;
    const f = penFields(e as PointerEvent, pen);
    const pe = e as PointerEvent & { persistentDeviceId?: number };
    penTools.observe(pe);
    const guessed = penTools.isEraser(pe);
    const press = penPress(pe, { eraser: guessed });
    const raw = barrelBits(pe);
    const first = firstBarrelBit();
    const bit = (n: number) => (raw & n ? ` (raw bit ${n})` : '');
    const parts = [press.eraser ? (guessed ? 'eraser end (from the second device)' : 'eraser end') : '', press.barrel1 ? `barrel button 1${bit(first)}` : '', press.barrel2 ? `barrel button 2${bit(6 - first)}` : ''].filter(Boolean).join(', ');
    setRead({ type: e.pointerType, raw: e.pressure, out: f.pressure, tiltX: f.tiltX, tiltY: f.tiltY, twist: f.twist, parts });
    onRaw(e.pointerType === 'pen' ? e.pressure : null);
    if (!draw) return;
    const rect = c.getBoundingClientRect();
    const k = c.width / rect.width;
    const x = (e.clientX - rect.left) * k;
    const y = (e.clientY - rect.top) * k;
    const g = c.getContext('2d');
    if (!g) return;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.globalCompositeOperation = press.eraser ? 'destination-out' : 'source-over';
    g.strokeStyle = getComputedStyle(c).getPropertyValue('--accent') || '#9b7bff';
    g.lineWidth = (2 + 16 * f.pressure) * k;
    g.beginPath();
    const from = last.current ?? { x, y };
    g.moveTo(from.x, from.y);
    g.lineTo(x + 0.01, y);
    g.stroke();
    last.current = { x, y };
  };

  const clear = () => {
    const c = ref.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
  };

  return (
    <div className="tb-pad-wrap">
      <canvas
        ref={ref}
        className="tb-pad"
        role="img"
        aria-label="Test pad. Draw here with your pen to see what it reports."
        onPointerDown={(e) => {
          last.current = null;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // not an active pointer
          }
          sample(e, true);
        }}
        onPointerMove={(e) => {
          const list = typeof e.nativeEvent.getCoalescedEvents === 'function' && e.buttons ? e.nativeEvent.getCoalescedEvents() : [];
          for (const ce of list.length ? list : [e.nativeEvent]) sample(ce, e.buttons !== 0);
        }}
        onPointerUp={() => (last.current = null)}
        onPointerLeave={() => onRaw(null)}
      />
      <div className="tb-pad-bar">
        <button type="button" className="tb-clear" onClick={clear}>
          Clear the pad
        </button>
        <div className="tb-read" data-testid="pen-readout">
          {read ? (
            <>
              <span>
                Using <b>{read.type === 'pen' ? 'a pen' : read.type === 'touch' ? 'a finger' : 'a mouse'}</b>
              </span>
              {read.type === 'pen' && (
                <>
                  <span>
                    Pressure <b>{Math.round(read.raw * 100)}%</b>, after the curve <b>{Math.round(read.out * 100)}%</b>
                  </span>
                  {read.tiltX !== undefined && read.tiltY !== undefined && (
                    <span>
                      Lean <b>{Math.round(90 - (altitudeOf(read.tiltX, read.tiltY) * 180) / Math.PI)} degrees</b> towards <b>{Math.round(((azimuthOf(read.tiltX, read.tiltY) * 180) / Math.PI + 360) % 360)} degrees</b>
                    </span>
                  )}
                  {read.twist ? (
                    <span>
                      Twist <b>{Math.round(read.twist)} degrees</b>
                    </span>
                  ) : null}
                  {read.parts && <span>Down: {read.parts}</span>}
                </>
              )}
            </>
          ) : (
            <span>Draw on the pad with your pen. Frameling says here what it hears.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionSelect({ label, value, onChange }: { label: string; value: BarrelAction; onChange: (v: BarrelAction) => void }) {
  return (
    <select className="ui-keyset" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as BarrelAction)}>
      {BARREL_ACTIONS.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
        </option>
      ))}
    </select>
  );
}

export function PenPage() {
  const pen = penStore.use((s) => s.pen);
  const touch = penStore.use((s) => s.touch);
  const tools = penStore.use((s) => s.tools);
  const [live, setLive] = useState<number | null>(null);
  const preset = presetOf(pen.curve);
  return (
    <div className="tb-page">
      <h3>Pen and tablet</h3>
      <p className="ui-pref-intro">
        Drawing tablets and pens (Wacom, Huion and the rest) work as they come. Here you can feel out the pressure, say what the pen's buttons do, and steady your line. There is no list of pens to pick from: Frameling keeps one set of
        settings for any pen, and one for the mouse and your fingers.
      </p>

      <h4>Try your pen</h4>
      <TestPad onRaw={setLive} />
      <p className="tb-note">
        If it says you are using a mouse while you draw with a tablet pen, the tablet driver is not talking to Frameling the way it needs to. On Windows, open the Wacom or Huion driver and turn on Windows Ink. Help has the steps.
      </p>

      <h4>Pen pressure</h4>
      <div className="tb-curve-row">
        <CurveEditor curve={pen.curve} min={pen.min} max={pen.max} live={live} onChange={(curve) => setPenDevice({ curve })} />
        <div className="tb-curve-side">
          <Row label="Feel" hint="Soft counts a light touch for a lot. Firm needs a harder press. Drag the dots on the graph to make your own.">
            <Segmented<CurvePreset | 'custom'>
              label="Pressure feel"
              value={preset}
              options={[...PRESET_ORDER.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })), ...(preset === 'custom' ? [{ id: 'custom' as const, label: 'Custom' }] : [])]}
              onChange={(v) => v !== 'custom' && setPenDevice({ curve: CURVE_PRESETS[v] })}
            />
          </Row>
          <Row label="Lightest press that counts" hint="Pressure below this is ignored. Raise it if your pen leaves faint marks when it just hovers.">
            <input type="range" min={0} max={50} value={Math.round(pen.min * 100)} aria-label="Lightest press that counts" onChange={(e) => setPenDevice({ min: Number(e.target.value) / 100 })} />
            <span>{Math.round(pen.min * 100)}%</span>
          </Row>
          <Row label="Press that counts as full" hint="Lower it if you can never reach the thickest line.">
            <input type="range" min={50} max={100} value={Math.round(pen.max * 100)} aria-label="Press that counts as full" onChange={(e) => setPenDevice({ max: Number(e.target.value) / 100 })} />
            <span>{Math.round(pen.max * 100)}%</span>
          </Row>
          <Row label="How much leaning counts" hint="For tools with Leaning switched on: how much bigger a mark gets as you lay the pen over.">
            <input type="range" min={0} max={100} value={pen.tiltAmount} aria-label="How much leaning counts" onChange={(e) => setPenDevice({ tiltAmount: Number(e.target.value) })} />
            <span>{pen.tiltAmount}%</span>
          </Row>
        </div>
      </div>

      <h4>Pen buttons</h4>
      <Row label="Eraser end of the pen" hint="Flip the pen over and it erases while it is down, then goes back to the tool you had.">
        <Switch on={pen.eraserEnd} onChange={(v) => setPenDevice({ eraserEnd: v })} label="Eraser end of the pen" />
      </Row>
      <Row label="Button nearest the tip" hint="While you hold it. Wacom and Huion drivers call this the right click.">
        <ActionSelect label="Button nearest the tip" value={pen.barrel1} onChange={(v) => setPenDevice({ barrel1: v })} />
      </Row>
      <Row label="Other button" hint="The second button on the barrel, the middle click. Many pens have only one.">
        <ActionSelect label="Other button" value={pen.barrel2} onChange={(v) => setPenDevice({ barrel2: v })} />
      </Row>
      <Row label="Swap my two pen buttons" hint="Turn this on if the button nearest the tip does what the other one should. Tablets don't all number them the same way.">
        <Switch on={pen.swapButtons} onChange={(v) => setPenDevice({ swapButtons: v })} label="Swap my two pen buttons" />
      </Row>

      <h4>Fingers and palms</h4>
      <Row label="Ignore touch while a pen is near" hint="Resting your hand on the screen will not draw while your pen is close.">
        <Switch on={touch.palmRejection} onChange={(v) => setTouch({ palmRejection: v })} label="Ignore touch while a pen is near" />
      </Row>
      <Row label="Two fingers move the page" hint="Drag with two fingers to pan, pinch to zoom.">
        <Switch on={touch.twoFingers} onChange={(v) => setTouch({ twoFingers: v })} label="Two fingers move the page" />
      </Row>
      <Row label="One finger">
        <Segmented<OneFinger>
          label="One finger"
          value={touch.oneFinger}
          options={[
            { id: 'draw', label: 'Draws' },
            { id: 'pan', label: 'Moves the page' },
            { id: 'off', label: 'Does nothing' },
          ]}
          onChange={(v) => setTouch({ oneFinger: v })}
        />
      </Row>

      <h4>What each tool does with the pen</h4>
      <p className="tb-note">
        The vector Brush has its own thickness switch in its options. Everything else is here, and in each tool's options. The stabilizer steadies a mouse too.
      </p>
      <table className="tb-tools">
        <thead>
          <tr>
            <th scope="col">Tool</th>
            <th scope="col">Size</th>
            <th scope="col">Strength</th>
            <th scope="col">Amount</th>
            <th scope="col">Leaning</th>
            <th scope="col">Stabilizer</th>
          </tr>
        </thead>
        <tbody>
          {PEN_TOOLS.map((id) => {
            const t = tools[id];
            const has = HAS[id];
            const box = (on: boolean, can: boolean, key: 'size' | 'opacity' | 'flow' | 'tilt', what: string) =>
              can ? <input type="checkbox" checked={on} aria-label={`${TOOL_LABEL[id]}: ${what}`} onChange={(e) => setToolPen(id, { [key]: e.target.checked })} /> : <span aria-hidden="true">-</span>;
            return (
              <tr key={id}>
                <th scope="row">{TOOL_LABEL[id]}</th>
                <td>{box(t.size, has.size, 'size', 'pressure changes size')}</td>
                <td>{box(t.opacity, has.opacity, 'opacity', 'pressure changes strength')}</td>
                <td>{box(t.flow, has.flow, 'flow', 'pressure changes how much')}</td>
                <td>{box(t.tilt, true, 'tilt', 'leaning changes size')}</td>
                <td>
                  <input type="range" min={0} max={100} value={t.stabilizer} aria-label={`${TOOL_LABEL[id]}: stabilizer`} onChange={(e) => setToolPen(id, { stabilizer: Number(e.target.value) })} /> {t.stabilizer ? `${t.stabilizer}%` : 'Off'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="ui-pref-foot">
        <button type="button" className="tb-clear" onClick={resetPen}>
          Put the pen settings back
        </button>
      </div>
    </div>
  );
}
