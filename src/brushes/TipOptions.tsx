// The tip picker in the brush options: Plain, Chalk, Charcoal, Watercolour or Stamp, with the few sliders each one has.
import { ActionButton, Choice, Slider, Tip } from '../canvas/controls';
import { useStore } from '../core/store';
import type { StampAngle } from '../core/format';
import { resolveTip, STAMPS, TIPS } from '../geometry/tip';
import { makeBrushFromSelection, patchTip, setStampShape, setTipKind } from './tips';
import './brushes.css';

const pct = (v: number) => `${Math.round(v * 100)}%`;

const ANGLES: { value: StampAngle; label: string; title: string }[] = [
  { value: 'follow', label: 'Along the line', title: 'Each stamp turns to face the way the line is going' },
  { value: 'upright', label: 'Upright', title: 'Every stamp stays the way up it was made' },
  { value: 'random', label: 'Any way', title: 'Each stamp turns a different way' },
];

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
        </>
      )}
      {kind && <Tip>{kind === 'stamp' ? 'Stamps stay shapes you can export anywhere. Pointy start and end shrink the stamps at the ends.' : `${kind === 'watercolour' ? 'Watercolour' : kind === 'chalk' ? 'Chalk' : 'Charcoal'} is drawn from lots of small vector shapes, so it stays sharp at any size. Saving as SVG, Lottie or PDF makes a bigger file.`}</Tip>}
      <ActionButton onClick={() => void makeBrushFromSelection()} title="Turn what you have selected into a brush. On a drawing layer it becomes a stamp; on a pixel layer, a small picture brush.">
        Brush from selection
      </ActionButton>
    </div>
  );
}
