// The tip picker in the brush options: Plain, Chalk, Charcoal, Watercolour or Stamp, with the few sliders each one has.
import { ActionButton, Choice, Slider, Tip, Toggle } from '../canvas/controls';
import { useStore } from '../core/store';
import type { StampAngle } from '../core/format';
import { resolveTip, STAMPS, TIPS } from '../geometry/tip';
import { clearEdgedPiece, EDGED_SLOTS, edgedHas, makeAlongBrush, setEdgedPiece } from './own';
import { makeBrushFromSelection, patchTip, setStampShape, setTipKind } from './tips';
import './brushes.css';

const OWN_TIPS = {
  nib: 'The nib is worked out as one solid shape, so it stays sharp at any size and exports anywhere.',
  along: 'Your drawing is bent along the line and painted in your colour. It exports as plain shapes.',
  edged: 'Each part is scaled to the brush size. Corners are found where the line turns about a right angle. It exports as plain shapes.',
  bristle: 'Each bristle is a thin line, so it stays sharp at any size and exports as plain lines.',
} as const;

const pct = (v: number) => `${Math.round(v * 100)}%`;

const ANGLES: { value: StampAngle; label: string; title: string }[] = [
  { value: 'follow', label: 'Along the line', title: 'Each stamp turns to face the way the line is going' },
  { value: 'upright', label: 'Upright', title: 'Every stamp stays the way up it was made' },
  { value: 'random', label: 'Any way', title: 'Each stamp turns a different way' },
];

const NIB_ANGLES: { value: 'upright' | 'follow'; label: string; title: string }[] = [
  { value: 'upright', label: 'Fixed', title: 'The pen is held at one angle, whichever way the line goes (calligraphy)' },
  { value: 'follow', label: 'With the line', title: 'The pen turns with the line, at this angle to it' },
];

const FITS: { value: 'stretch' | 'repeat'; label: string; title: string }[] = [
  { value: 'stretch', label: 'Stretch', title: 'One copy, stretched down the whole line' },
  { value: 'repeat', label: 'Repeat', title: 'Whole copies end to end' },
];

/** The five parts of an edged brush: each has a button that takes it from the selection, and a way to take it out again. */
function EdgedParts({ has }: { has: Record<(typeof EDGED_SLOTS)[number]['id'], boolean> }) {
  return (
    <div className="tp-parts" role="group" aria-label="Edged brush parts">
      {EDGED_SLOTS.map((p) => (
        <div key={p.id} className="tp-part" data-set={has[p.id]}>
          <span className="tp-part-name" title={p.hint}>
            {p.label}
          </span>
          <ActionButton onClick={() => void setEdgedPiece(p.id)} title={`${p.hint} Select a drawing, then press this to use it.`}>
            {has[p.id] ? 'Replace' : 'Use selection'}
          </ActionButton>
          {p.id !== 'sides' && has[p.id] && (
            <ActionButton onClick={() => clearEdgedPiece(p.id)} title="Take this part out. The sides are used there instead.">
              Remove
            </ActionButton>
          )}
        </div>
      ))}
    </div>
  );
}

export function TipOptions() {
  const tip = useStore((s) => s.ui.brush.tip);
  const t = tip ? resolveTip(tip) : null;
  const kind = tip?.kind ?? null;
  const stamps = t?.custom.length ? [...STAMPS, { id: 'custom' as const, label: 'Yours', angle: 'upright' as const }] : STAMPS;
  return (
    <div className="tp-row" data-testid="brush-tips">
      <div className="tp-label">Tip</div>
      <div className="tp-chips" role="group" aria-label="Brush tip">
        <button type="button" className="bp-chip" data-on={!kind} aria-pressed={!kind} title="A smooth, solid line" onClick={() => setTipKind(null)}>
          <span className="bp-chip-name">Plain</span>
        </button>
        {TIPS.map((x) => (
          <button key={x.id} type="button" className="bp-chip" data-on={kind === x.id} aria-pressed={kind === x.id} title={x.hint} onClick={() => setTipKind(x.id)}>
            <span className="bp-chip-name">{x.label}</span>
          </button>
        ))}
      </div>
      {t && (kind === 'chalk' || kind === 'charcoal') && (
        <>
          <Slider label="Grain" value={Math.round(t.amount * 100)} min={5} max={100} format={(v) => `${v}%`} onChange={(v) => patchTip({ amount: v / 100 })} hint="How much of the line is dusty grain, with the paper showing through." />
          <Slider label="Grain size" value={Math.round(t.grain * 10)} min={5} max={30} format={(v) => (v === 10 ? 'Usual' : `${(v / 10).toFixed(1)}x`)} onChange={(v) => patchTip({ grain: v / 10 })} hint="Finer for soft dust, coarser for rough paper." />
        </>
      )}
      {t && kind === 'watercolour' && <Slider label="Edge" value={Math.round(t.amount * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => patchTip({ amount: v / 100 })} hint="How dark and bold the edge of the wash is, where the paint gathers." />}
      {t && kind === 'stamp' && (
        <>
          <div className="tp-chips" role="group" aria-label="Stamp shape">
            {stamps.map((s) => (
              <button key={s.id} type="button" className="bp-chip" data-on={t.shape === s.id} aria-pressed={t.shape === s.id} onClick={() => setStampShape(s.id)}>
                <span className="bp-chip-name">{s.label}</span>
              </button>
            ))}
          </div>
          <Slider label="Spacing" value={Math.round(t.spacing * 100)} min={20} max={400} step={5} format={(v) => `${v}%`} onChange={(v) => patchTip({ spacing: v / 100 })} hint="How far apart the stamps are, as a share of the brush size." />
          <Slider label="Size variety" value={Math.round(t.jitter * 100)} min={0} max={100} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => patchTip({ jitter: v / 100 })} hint="Each stamp a little bigger or smaller than the last." />
          <Slider label="Wander" value={Math.round(t.scatter * 100)} min={0} max={200} step={5} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => patchTip({ scatter: v / 100 })} hint="How far stamps drift off the line, to either side." />
          <Choice label="Turn" value={t.angle} options={ANGLES} onChange={(v) => patchTip({ angle: v })} />
          <Slider label="Spin" value={Math.round(t.turn * 100)} min={0} max={100} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => patchTip({ turn: v / 100 })} hint="Each stamp also turns a random amount, up to any way round at 100%." />
          <Slider label="Gap variety" value={Math.round(t.gapVary * 100)} min={0} max={100} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => patchTip({ gapVary: v / 100 })} hint="The gaps between stamps vary, so they bunch and spread." />
          <Toggle label="Pressure sizes them" checked={!t.fixedSize} onChange={(v) => patchTip({ fixedSize: !v })} hint="A harder press makes bigger stamps. Off keeps every stamp the same size." />
        </>
      )}
      {t && kind === 'nib' && (
        <>
          <Slider label="Roundness" value={Math.round(t.roundness * 100)} min={5} max={100} step={5} format={(v) => (v >= 100 ? 'Round' : `${v}%`)} onChange={(v) => patchTip({ roundness: v / 100 })} hint="Low is a flat blade, thick one way and thin the other. 100% is a round pen." />
          <Slider label="Angle" value={t.nibAngle} min={-90} max={90} format={(v) => `${v}\u00b0`} onChange={(v) => patchTip({ nibAngle: v })} hint="Which way the flat of the pen is tilted." />
          <Choice label="Angle stays" value={t.angle === 'follow' ? 'follow' : 'upright'} options={NIB_ANGLES} onChange={(v) => patchTip({ angle: v })} />
        </>
      )}
      {t && kind === 'bristle' && (
        <>
          <Slider label="Bristles" value={t.count} min={3} max={60} format={(v) => `${v}`} onChange={(v) => patchTip({ count: v })} hint="How many thin lines the brush is made of." />
          <Slider label="Stiffness" value={Math.round(t.stiffness * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => patchTip({ stiffness: v / 100 })} hint="Stiff bristles stay in line. Floppy ones wander." />
          <Slider label="Dry gaps" value={Math.round(t.amount * 100)} min={0} max={100} format={(v) => (v ? `${v}%` : 'Off')} onChange={(v) => patchTip({ amount: v / 100 })} hint="How often a bristle runs out of paint, like a dry brush." />
        </>
      )}
      {t && kind === 'along' && (
        <>
          <Choice label="On a long line" value={t.fit} options={FITS} onChange={(v) => patchTip({ fit: v })} />
          <ActionButton onClick={() => void makeAlongBrush()} title="Use what you have selected as the drawing that goes along the line.">
            Use the selection as the drawing
          </ActionButton>
        </>
      )}
      {t && kind === 'edged' && <EdgedParts has={edgedHas(tip)} />}
      {kind && <Tip>{kind === 'nib' || kind === 'along' || kind === 'edged' || kind === 'bristle' ? OWN_TIPS[kind] : kind === 'stamp' ? 'Stamps stay shapes you can export anywhere. Pointy start and end shrink the stamps at the ends.' : `${kind === 'watercolour' ? 'Watercolour' : kind === 'chalk' ? 'Chalk' : 'Charcoal'} is drawn from lots of small vector shapes, so it stays sharp at any size. Saving as SVG, Lottie or PDF makes a bigger file.`}</Tip>}
      <ActionButton onClick={() => void makeBrushFromSelection()} title="Turn what you have selected into a brush. On a drawing layer it becomes a stamp; on a pixel layer, a small picture brush.">
        Brush from selection
      </ActionButton>
    </div>
  );
}
