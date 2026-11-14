import { Tip } from '../../canvas/controls';
import { GradientEditor } from '../../canvas/panels/GradientEditor';
import { Wells } from '../../canvas/panels/Wells';

export function GradientToolOptions() {
  return (
    <div className="cv-options">
      <Wells />
      <GradientEditor />
      <Tip>Drag across a shape to set where its gradient starts and ends. Drag the square ends to adjust. Shift keeps 45 degree steps.</Tip>
    </div>
  );
}
