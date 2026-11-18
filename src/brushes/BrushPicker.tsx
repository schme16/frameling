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
import { pixelHalf } from './model';
import { currentSpec } from '../dab/live';
import { customOf, fixedActiveId, fixedRows, FIXED_WORDS, isFixedSide, type PickerSide } from './tipList';
import { tipName } from '../geometry/tip';
import { PixelStroke } from './PixelSample';
import { Stroke } from './Stroke';
import { StickPicture, TipPicture } from './pictures';
import { activeStick } from './stickList';
import { pixelNameOf } from './pixelTipList';
import { usePixelLive } from './usePixelLive';
import './picker.css';

const Panel = lazyComponent(lazyModule(() => import('./BrushPickerPanel').then((m) => m.Panel), { warm: true }));

/** `disabled` is the reason the picker is greyed out, for a stick while Catch on paper is off. */
export function BrushPicker({ side = 'vector', disabled }: { side?: PickerSide; disabled?: string }) {
  const live = useStore((st) => st.ui.brush);
  useStore((st) => st.ui.tool);
  useBrushPresets(brushesVersion);
  const tips = isFixedSide(side);
  const words = side === 'stick' ? FIXED_WORDS.stick : FIXED_WORDS.tip;
  const custom = customOf(live.tip);
  // On a pixel brush tool the Tip and Stick pickers list what the pixel engine has.
  const pixelLive = usePixelLive();
  const pixel = tips ? pixelLive : null;
  const tipList = useMemo(() => (tips ? fixedRows(side, live, custom, pixel) : []), [tips, side, live, custom, pixel]);
  const all = tips ? tipList : brushesOnSide(side);
  const { activeId, changed } = tips ? { activeId: fixedActiveId(side, live, pixel), changed: false } : stateFor(side);
  const active = all.find((p) => p.id === activeId);
  const spec = side === 'pixel' ? (currentSpec() ?? (active ? pixelHalf(active) : null)) : pixel ? (active?.pixel ?? null) : null;
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const big = all.length > SMALL_LIBRARY;
  // The row says where the brush lives, not how long the list is (the open list has the counts).
  const sub = disabled ? 'Needs Catch on paper' : active && big && !tips ? groupOf(active) : '';
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
        disabled={!!disabled}
        title={disabled ?? (tips ? words.button : side === 'pixel' ? 'Pick a pixel brush by what it draws' : 'Pick a brush by what it draws')}
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        <span className="pk-btn-sample">
          {spec ? <PixelStroke spec={spec} h={30} /> : side === 'stick' ? <StickPicture dry={activeStick(live.tip)} h={30} /> : side === 'tip' ? <TipPicture tip={live.tip} h={30} /> : <Stroke brush={live} h={30} />}
        </span>
        <span className="pk-btn-text">
          <span className="pk-btn-name">
            <span className="pk-btn-name-text">{pixel && (side === 'tip' || side === 'stick') ? pixelNameOf(side, pixel) : side === 'stick' ? active?.name : tips ? tipName(live.tip) : active ? active.name : side === 'pixel' ? 'Custom pixel brush' : 'Custom brush'}</span>
            {active && changed && <i className="bp-changed" aria-label="changed" />}
          </span>
          {sub && <span className="pk-btn-sub">{sub}</span>}
        </span>
        <span className="pk-caret" aria-hidden="true">
          <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </button>
      {open && !disabled && btn.current && <Panel anchor={btn.current} side={side} onClose={close} onPicked={() => close(true)} />}
    </>
  );
}
