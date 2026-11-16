import { ActionButton, Tip } from '../../canvas/controls';
import { getCommand } from '../../core/registry';
import { deletePickedPoint, togglePickedSmooth, usePickedPoint } from '../points';

export function PointsOptions() {
  const p = usePickedPoint();
  return (
    <div className="cv-options">
      <div className="cv-options-row">
        <ActionButton onClick={togglePickedSmooth} disabled={!p || !p.smooth} title="Sharp corner: no curve handles (Alt+click a point)">
          Make corner
        </ActionButton>
        <ActionButton onClick={togglePickedSmooth} disabled={!p || p.smooth} title="Smooth curve: handles in a line through the point (Alt+click a point)">
          Make smooth
        </ActionButton>
        <ActionButton onClick={() => deletePickedPoint()} disabled={!p?.canDelete} title="Take the chosen point away (Delete)">
          Delete point
        </ActionButton>
        <ActionButton onClick={() => void getCommand('width.tool')?.run()} title="Make a line fat or thin along its length (Width tool)">
          Shape the width
        </ActionButton>
      </div>
      <Tip>Click a shape to see its points. Drag a point to move it, or a handle to bend the curve (Alt bends one side). Click the line to add a point. Alt+click a point to switch corner and smooth.</Tip>
    </div>
  );
}
