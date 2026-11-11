// Grid and perspective settings: which grid, its size in your units, the isometric slope, snapping, and the
// perspective guides. Changes show straight away; there's nothing to apply.
import { useState } from 'react';
import { mountModal, Modal } from '../io/mount';
import { store, useStore } from '../core/store';
import { docDpi, pxTo, roundIn, toPx, unitInfo } from '../core/units';
import { usePrefs } from '../ui/prefs';
import { setPerspective } from './gridView';
import { setViewSettings, useViewSettings } from './viewSettings';
import './settings.css';

const nudge = () => store().setUi({});

function Seg<T extends string | number>({ label, value, options, onPick }: { label: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="ui-segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={`ui-seg${value === v ? ' is-chosen' : ''}`} onClick={() => onPick(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function GridSettings({ close }: { close: () => void }) {
  const grid = useViewSettings((v) => v.grid);
  const size = useViewSettings((v) => v.gridSize);
  const iso = useViewSettings((v) => v.isoStyle);
  const snap = useViewSettings((v) => v.snap);
  const showP = useViewSettings((v) => v.perspective);
  const points = useStore((s) => s.doc.perspective?.points.length ?? 0);
  const dpi = useStore((s) => docDpi(s.doc));
  const unit = usePrefs((p) => p.units);
  const shown = String(roundIn(pxTo(size, unit, dpi), unit));
  const [text, setText] = useState<string | null>(null);
  const set = (patch: Parameters<typeof setViewSettings>[0]) => {
    setViewSettings(patch);
    nudge();
  };
  return (
    <Modal title="Grid and perspective" onClose={close} className="gs-modal">
      <div className="io-body gs-body">
        <div className="gs-row">
          <span className="gs-label">Grid</span>
          <Seg label="Grid" value={grid} options={[['off', 'None'], ['square', 'Squares'], ['iso', 'Isometric']]} onPick={(v) => set({ grid: v })} />
        </div>
        <label className="gs-row">
          <span className="gs-label">Size</span>
          <span className="ds-len">
            <input
              type="number"
              min={0}
              step={unit === 'px' ? 1 : 'any'}
              value={text ?? shown}
              aria-label={`Grid size in ${unitInfo(unit).label.toLowerCase()}`}
              onFocus={() => setText(shown)}
              onBlur={() => setText(null)}
              onChange={(e) => {
                setText(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== '' && Number.isFinite(n) && n > 0) set({ gridSize: Math.max(1, Math.min(4096, toPx(n, unit, dpi))) });
              }}
            />
            <i>{unit}</i>
          </span>
          <span className="io-muted">{grid === 'iso' ? 'The width of one diamond.' : 'The width of one square.'}</span>
        </label>
        {grid === 'iso' && (
          <div className="gs-row">
            <span className="gs-label">Slope</span>
            <Seg label="Isometric slope" value={iso} options={[['2:1', '2:1 (pixel art)'], ['30', '30 degrees (true isometric)']]} onPick={(v) => set({ isoStyle: v })} />
          </div>
        )}
        <label className="ui-check gs-row">
          <input type="checkbox" checked={snap} onChange={(e) => set({ snap: e.target.checked })} />
          <span>Snap to the grid, guides and page (the same switch as View, Snap)</span>
        </label>
        <hr className="gs-rule" />
        <div className="gs-row">
          <span className="gs-label">Perspective</span>
          <Seg label="Perspective guides" value={points} options={[[0, 'None'], [1, 'One point'], [2, 'Two point']]} onPick={(v) => setPerspective(v as 0 | 1 | 2)} />
        </div>
        {points > 0 && (
          <label className="ui-check gs-row">
            <input type="checkbox" checked={showP} onChange={(e) => set({ perspective: e.target.checked })} />
            <span>Show the perspective guides</span>
          </label>
        )}
        <p className="io-muted">
          {points > 0
            ? 'Drag the round handles on the canvas to move the vanishing points. Two points keep the horizon level; hold Shift to tilt it. Lock guides (View menu) stops them moving.'
            : 'Perspective guides are lines that meet at a vanishing point, to help draw things that get smaller into the distance.'}
        </p>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn io-primary" onClick={close}>
          Done
        </button>
      </div>
    </Modal>
  );
}

export function openGridSettings(): void {
  mountModal((close) => <GridSettings close={close} />);
}
