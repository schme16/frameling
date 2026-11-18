// What the brush you picked has that this kind of layer cannot draw. The brush stays picked as you move between a pixel
// layer and a vector layer; a brush made for the other kind is drawn as close as this kind can (translate.ts), and what is
// left over is said here in one plain line, with a greyed row for each control and the reason it is greyed. Nothing is
// hidden: the half the brush was made with is kept exactly, so going back loses nothing.
import { MoreOptions } from '../canvas/controls';
import { useStore } from '../core/store';
import { brushesVersion, keptFor, pickedBrush, useBrushPresets, type Side } from './presets';
import { keptLine, type Kept } from './translate';
import './brushes.css';

/** One greyed control: its name, what it was set to, and why it does nothing here. */
export function KeptRow({ k }: { k: Kept }) {
  return (
    <div className="cv-field bp-kept-row" data-control={k.id} aria-disabled="true" title={k.why}>
      <div className="cv-field-head">
        <span className="cv-field-label">{k.label}</span>
        <span className="cv-field-value">{k.value}</span>
      </div>
      <div className="cv-field-hint">{k.why}</div>
    </div>
  );
}

/** The line under the Brush picker, and the greyed controls behind it. Nothing when the picked brush loses nothing here. */
export function KeptNote({ side }: { side: Side }) {
  useBrushPresets(brushesVersion);
  // The picked brush changes with the list; the layer changes which half is drawn.
  useStore((s) => s.ui.activeLayerId);
  const kept = keptFor(pickedBrush(), side);
  if (!kept.length) return null;
  const onVectors = side === 'vector';
  const rows = kept.filter((k) => !k.noRow);
  return (
    <div className="bp-kept" data-control="kept-note">
      <p className="bp-kept-line">{keptLine(kept, onVectors)}.</p>
      {rows.length > 0 && (
        <MoreOptions name="kept" command="brush.kept" label={onVectors ? 'Kept for pixel layers' : 'Kept for vector layers'} hint="These are greyed here, and come back on a layer that draws them.">
          {rows.map((k) => (
            <KeptRow key={k.id} k={k} />
          ))}
        </MoreOptions>
      )}
    </div>
  );
}
