import { ActionButton, Tip } from '../../canvas/controls';
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
      </div>
      <Tip>Click a shape to see its points. Drag a point to move it, or a handle to bend the curve (Alt bends one side). Click the line to add a point. Alt+click a point to switch corner and smooth.</Tip>
    </div>
  );
}
