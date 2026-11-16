import { Choice, Tip } from '../../canvas/controls';
import { setChoice, useChoice } from '../../core/choices';
import type { BuildLook } from '../../geometry/regions';
import { setBuildMode, useBuildMode, type BuildMode } from '../shapeBuilder';

export function ShapeBuilderOptions() {
  const mode = useBuildMode();
  const look = useChoice<BuildLook>('shapes.buildLook');
  return (
    <div className="cv-options">
      <Choice<BuildMode>
        label="Dragging across"
        value={mode}
        options={[
          { value: 'join', label: 'Joins them', title: 'Drag across the bits you want as one shape. Alt or Shift flips it for one drag.' },
          { value: 'remove', label: 'Takes them away', title: 'Drag across the bits you want gone. Alt or Shift flips it for one drag.' },
        ]}
        onChange={setBuildMode}
      />
      <Choice<BuildLook>
        label="Joined shape wears"
        value={look}
        options={[
          { value: 'dragged', label: 'Where you began', title: 'The colours and outline of the bit your drag started on.' },
          { value: 'bottom', label: 'Bottom shape', title: 'The colours and outline of the lowest shape in the pile, like Join.' },
        ]}
        onChange={(v) => setChoice('shapes.buildLook', v)}
      />
      <Tip>Where shapes overlap, they make little bits. Drag across the ones you want as one shape. Alt-drag (or Shift-drag) does the other thing. Pick two or more shapes first to work on just those.</Tip>
    </div>
  );
}
