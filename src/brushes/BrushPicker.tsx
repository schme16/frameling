// The brush picker: one button in the Brush options that drops a panel with the live controls, a search box, groups and
// every brush as a row with a stroke across it. The rules for what it lists are in library.ts, what it remembers is in
// picker.ts. Keyboard: arrows move the highlight, Enter picks, typing goes to the search box, Escape closes. The panel
// itself (BrushPickerPanel.tsx) is its own download, fetched on first open and in idle time after start-up.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../core/store';
import { lazyComponent, lazyModule } from '../core/lazy';
import { groupOf, SMALL_LIBRARY } from './library';
import { pickerRequests, takePickerRequest, usePicker } from './picker';
import { brushesOnSide, brushesVersion, stateFor, useBrushPresets } from './presets';
import { currentSpec } from '../dab/live';
import { tipRows, customOf, tipIdOf, type PickerSide } from './tipList';
import { tipName } from '../geometry/tip';
import { PixelStroke } from './PixelSample';
import { Stroke } from './Stroke';
import './picker.css';

const Panel = lazyComponent(lazyModule(() => import('./BrushPickerPanel').then((m) => m.Panel), { warm: true }));

export function BrushPicker({ side = 'vector' }: { side?: PickerSide }) {
  const live = useStore((st) => st.ui.brush);
  useStore((st) => st.ui.tool);
  useBrushPresets(brushesVersion);
  const tips = side === 'tip';
  const custom = customOf(live.tip);
  const tipList = useMemo(() => (tips ? tipRows(live, custom) : []), [tips, live, custom]);
  const all = tips ? tipList : brushesOnSide(side);
  const { activeId, changed } = tips ? { activeId: tipIdOf(live.tip), changed: false } : stateFor(side);
  const spec = side === 'pixel' ? (currentSpec() ?? all.find((p) => p.id === activeId)?.pixel ?? null) : null;
  const active = all.find((p) => p.id === activeId);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const big = all.length > SMALL_LIBRARY;
  const asks = usePicker(pickerRequests);

  // A command asked for the picker (Ctrl+K, a menu).
  useEffect(() => {
    if (!tips && takePickerRequest()) setOpen(true);
  }, [asks, tips]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    // Focus goes back to the button unless it went somewhere on purpose.
    if (refocus)
      requestAnimationFrame(() => {
        const now = document.activeElement;
        if (!now || now === document.body) btn.current?.focus();
      });
  }, []);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="pk-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={tips ? 'Pick a pen tip by what it draws' : side === 'pixel' ? 'Pick a pixel brush by what it draws' : 'Pick a brush by what it draws'}
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        <span className="pk-btn-sample">
          {spec ? <PixelStroke spec={spec} h={30} /> : <Stroke brush={live} h={30} />}
        </span>
        <span className="pk-btn-text">
          <span className="pk-btn-name">
            {tips ? tipName(live.tip) : active ? active.name : side === 'pixel' ? 'Custom pixel brush' : 'Custom brush'}
            {active && changed && <i className="bp-changed" aria-label="changed" />}
          </span>
          <span className="pk-btn-sub">{`${active && big && !tips ? `${groupOf(active)} · ` : ''}${all.length} ${tips ? 'tips' : 'brushes'}`}</span>
        </span>
        <span className="pk-caret" aria-hidden="true">
          <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </button>
      {open && btn.current && <Panel anchor={btn.current} side={side} onClose={close} onPicked={() => close(true)} />}
    </>
  );
}
