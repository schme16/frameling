// The snapping choices: a master switch and, for each kind of work, a tick for each thing to snap to. The same panel
// sits in a popover on the status bar's Snap button and on the Preferences page. Changes take effect straight away.
import { Explainer } from '../ui/explain/ExplainIcon';
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { usePopover } from '../ui/popover';
import { describeSnap, SNAP_DISTANCE, snapColourVar, snapNoteParts, SNAP_TARGETS, type SnapContext, type SnapTargetInfo } from './snapModel';
import { closeSnapOptions, currentSnapContext, resetSnapPicks, setSnapAllLayers, setSnapDistance, setSnapOn, setSnapPick, snapPopover, toggleSnapOptions } from './snapOps';
import { snappedKinds, snapVersion, subscribeSnap } from './snap';
import { useViewSettings } from './viewSettings';

function Tick({ label, on, disabled, onChange, tip }: { label: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void; tip?: string }) {
  return (
    <input type="checkbox" className="sn-tick" checked={on} disabled={disabled} aria-label={label} data-tip={disabled ? tip : undefined} onChange={(e) => onChange(e.target.checked)} />
  );
}

function Dot({ kind }: { kind: SnapTargetInfo['id'] }) {
  return <span className="sn-dot" aria-hidden="true" style={{ '--snap-colour': `var(${snapColourVar(kind)})` } as React.CSSProperties} />;
}

function Name({ t }: { t: SnapTargetInfo }) {
  return (
    <span className="sn-name" data-tip={t.label} data-tip-desc={t.tip}>
      <Dot kind={t.id} /> {t.label}
      {t.term && <i> {t.term}</i>}
    </span>
  );
}

/** The master switch, the ticks, and the reset. */
export function SnapPanel({ wide = false }: { wide?: boolean }) {
  const on = useViewSettings((v) => v.snap);
  const picks = useViewSettings((v) => v.snapPicks);
  const distance = useViewSettings((v) => v.snapDistance);
  const allLayers = useViewSettings((v) => v.snapAllLayers);
  const here = useStore(() => currentSnapContext());
  const cellsOn = !!picks.pixel.cells;
  const layerRows = SNAP_TARGETS.filter((t) => t.contexts.includes('vector') || t.contexts.includes('pixel'));
  const col = (c: SnapContext) => (here === c ? ' is-here' : '');
  return (
    <div className={`sn-panel${wide ? ' is-wide' : ''}${on ? '' : ' is-off'}`}>
      <label className="sn-master">
        <button type="button" role="switch" aria-checked={on} aria-label="Snapping" className={`ui-switch${on ? ' is-on' : ''}`} onClick={() => setSnapOn(!on)}>
          <span className="ui-switch-knob" />
        </button>
        <span>
          <strong>Snapping {on ? 'is on' : 'is off'}</strong>
          <small>Hold Ctrl while dragging to skip it for a moment.</small>
        </span>
      </label>
      <div className="sn-grid" role="group" aria-label="What to snap to">
        <span />
        <b className={`sn-head${col('vector')}`}>Vector layers</b>
        <b className={`sn-head${col('pixel')}`}>Pixel layers</b>
        {layerRows.map((t) => (
          <Fragment key={t.id}>
            <Name t={t} />
            {(['vector', 'pixel'] as const).map((c) => {
              const applies = t.contexts.includes(c);
              // Pixel cells wins on a pixel layer, so the ticks it overrides wait until it is unticked.
              const blocked = c === 'pixel' && cellsOn && ['page', 'centre', 'guides', 'grid'].includes(t.id);
              return (
                <span key={c} className={`sn-cell${col(c)}`}>
                  {applies ? (
                    <Tick label={`${t.label}, ${c === 'vector' ? 'vector layers' : 'pixel layers'}`} on={!!picks[c][t.id]} disabled={blocked} tip="Untick Pixel cells to snap pixel layers to this" onChange={(v) => setSnapPick(c, t.id, v)} />
                  ) : (
                    <span className="sn-na" aria-hidden="true">
                      -
                    </span>
                  )}
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>
      <label className="sn-row sn-all-layers" data-tip="All layers, not just this one" data-tip-desc="Other shapes and equal gaps look at every visible layer. Untick it to look at the open layer only.">
        <Tick label="All layers, not just this one" on={allLayers} onChange={setSnapAllLayers} />
        <span className="sn-name">All layers, not just this one</span>
      </label>
      <div className="sn-distance" data-tip="Snap distance" data-tip-desc="How close, in screen pixels, something has to come before it snaps.">
        <span className="sn-name">Snap distance</span>
        <input type="range" className="cv-slider" min={SNAP_DISTANCE.min} max={SNAP_DISTANCE.max} step={1} value={distance} aria-label="Snap distance in pixels" aria-valuetext={`${distance} pixels`} onChange={(e) => setSnapDistance(Number(e.target.value))} />
        <span className="sn-distance-value">{distance} px</span>
      </div>
      <div className="sn-extra">
        {SNAP_TARGETS.filter((t) => t.contexts.includes('artboard')).map((t) => (
          <label key={t.id} className="sn-row">
            <Tick label={`${t.label}`} on={!!picks.artboard[t.id]} onChange={(v) => setSnapPick('artboard', t.id, v)} />
            <Name t={t} />
          </label>
        ))}
      </div>
      <Explainer className="sn-note">Angle steps work with Shift, so the switch and Ctrl don&apos;t stop them. Perspective lines and the grid only snap while they show.</Explainer>
      <button type="button" className="ui-btn ui-btn-small ui-btn-quiet sn-reset" onClick={resetSnapPicks}>
        Back to the usual choices
      </button>
    </div>
  );
}

/** The status bar's Snap button, and the popover it opens. */
export function SnapButton() {
  const on = useViewSettings((v) => v.snap);
  const open = snapPopover.use((s) => s.open);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`ui-status-item ui-status-btn sn-button${on ? '' : ' is-off'}`}
        data-snap-button=""
        data-tip="Snapping"
        data-tip-desc="Pick what things snap to: the page, guides, the grid, other shapes, perspective lines, pixels."
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggleSnapOptions}
      >
        <Icon name="magnet" size={14} />
        {on ? 'Snap on' : 'Snap off'}
      </button>
      {open && <SnapPopover anchor={ref} />}
    </>
  );
}

function SnapPopover({ anchor }: { anchor: React.RefObject<HTMLButtonElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rect] = useState(() => anchor.current?.getBoundingClientRect() ?? null);
  usePopover(ref, closeSnapOptions);
  useEffect(() => {
    // A press anywhere else closes it (the button itself toggles it).
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.current?.contains(t)) closeSnapOptions();
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [anchor]);
  const style: React.CSSProperties = rect ? { bottom: window.innerHeight - rect.top + 8, left: Math.max(8, Math.min(rect.left, window.innerWidth - 380)) } : { bottom: 40, left: 8 };
  return createPortal(
    <div ref={ref} className="sn-pop" role="dialog" aria-label="Snapping" style={style}>
      <SnapPanel />
    </div>,
    document.body,
  );
}

/** "Snapped to guide and page edge", on the canvas while something snaps. */
export function SnapChip() {
  useSyncExternalStore(subscribeSnap, snapVersion);
  const parts = snapNoteParts(snappedKinds());
  if (!parts.length) return null;
  return (
    <div className="sn-chip" role="status" aria-live="off" aria-label={describeSnap(snappedKinds())}>
      <Icon name="magnet" size={13} />
      Snapped to
      {parts.map((p, i) => (
        <span key={p.kind} className="sn-chip-item">
          {i > 0 && <span className="sn-chip-sep">{i === parts.length - 1 ? 'and' : ','}</span>}
          <Dot kind={p.kind} />
          {p.word}
        </span>
      ))}
    </div>
  );
}
