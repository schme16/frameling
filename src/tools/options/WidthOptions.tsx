import { ActionButton, Tip } from '../../canvas/controls';
import { deletePickedStop, makeEven, useWidthTarget } from '../width';

export function WidthOptions() {
  const t = useWidthTarget();
  return (
    <div className="cv-options">
      <div className="cv-options-row">
        <ActionButton onClick={deletePickedStop} disabled={!t?.picked} title="Take the chosen width point away (Delete)">
          Delete point
        </ActionButton>
        <ActionButton onClick={makeEven} disabled={!t || t.stops === 0} title="Make the line the same width all the way along again">
          Make even
        </ActionButton>
      </div>
      <Tip>Click a line, then drag its edge to make it fat or thin there. Shift+drag a point slides it along the line. Alt+click a point takes it away. For a quick start, pick a shape under Dashes, arrows and width.</Tip>
    </div>
  );
}
