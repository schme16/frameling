// The Transform tool's options: what the box has done so far in numbers, Apply and Put back, and what pixels will go through.
import { getCommand } from '../core/registry';
import { useStore } from '../core/store';
import { ActionButton, Tip } from '../canvas/controls';
import { readout } from './box';
import { currentFrame, getSession, isDirty, selectionBox, useTransformVersion } from './session';
import { skewKey } from './settings';

const num = (v: number): string => String(Math.round(v * 10) / 10);

export function TransformOptions() {
  useTransformVersion();
  useStore((s) => s.ui.selection);
  useStore((s) => s.doc);
  const f = currentFrame();
  const kind = getSession()?.kind ?? selectionBox()?.kind ?? null;
  const dirty = isDirty();
  const r = f ? readout(f) : null;
  const skew = skewKey() === 'shift' ? 'Shift' : 'Ctrl';
  const run = (id: string) => void getCommand(id)?.run();
  return (
    <div className="cv-options">
      <p className="cv-tip" data-testid="transform-readout">
        {r ? `Width ${num(r.w)}, height ${num(r.h)}, turned ${num(r.turn)}°, slanted ${num(r.slant)}°.` : kind === null ? 'Nothing selected.' : ''}
      </p>
      <div className="cv-row cv-wrap">
        <ActionButton disabled={!dirty} onClick={() => run('transform.apply')} title="Apply it (Enter)">
          Apply
        </ActionButton>
        <ActionButton disabled={!dirty} onClick={() => run('transform.putBack')} title="Put it all back (Escape)">
          Put back
        </ActionButton>
        <ActionButton disabled={!f} onClick={() => run('transform.pivotMiddle')} title="Move the pivot back to the middle of the box">
          Pivot to the middle
        </ActionButton>
      </div>
      {kind === 'pixel' && (
        <Tip stays>
          Turning, slanting and stretching pixels picks them again, so doing it over and over softens the art. Moves by whole pixels, flips and right angles stay exact, and nothing is blended: no new colours.
        </Tip>
      )}
      <Tip>
        Drag the middle to move. Corners stretch (Shift keeps the shape, Alt works from the pivot). Sides squash; hold {skew} to slant. The round knob turns, and Shift snaps it. Drag the little cross to move the pivot. Enter applies, Escape puts it back.
      </Tip>
    </div>
  );
}
