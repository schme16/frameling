import { getCommand } from '../../core/registry';
import { setChoice, useChoice } from '../../core/choices';
import { SCOPE_CHOICE, type VectorScope } from '../../select/scope';
import { findLayer } from '../../core/doc';
import { isMergeLayer } from '../merge-mode';
import { useStore } from '../../core/store';
import { ActionButton, Choice, Tip } from '../../canvas/controls';
import { DrawModeToggle } from './DrawModeToggle';
import { modeOfTool } from '../../select/ways';
import { ClingSlider } from '../../select/ClingSlider';

const ACTIONS: [string, string][] = [
  ['select.flipH', 'Flip left-right'],
  ['select.flipV', 'Flip up-down'],
  ['arrange.forward', 'Bring forward'],
  ['arrange.backward', 'Send back'],
  ['edit.duplicate', 'Duplicate'],
  ['edit.delete', 'Delete'],
];

export function SelectOptions() {
  const count = useStore((s) => s.ui.selection.length);
  const mode = modeOfTool(useStore((s) => s.ui.tool));
  const lasso = mode !== 'box';
  const scope = useChoice<VectorScope>(SCOPE_CHOICE);
  // A merge layer has its own way (a box cuts out the part inside), so the question is only for layers that keep shapes separate.
  const merge = useStore((s) => isMergeLayer(findLayer(s.doc, s.ui.activeLayerId)));
  return (
    <div className="cv-options">
      <DrawModeToggle />
      {!merge && (
        <Choice
          label="Picks"
          value={scope}
          options={[
            { value: 'parts', label: 'Just the bit', title: 'Only the points and edges inside your drag are picked, so you can move one corner. Hold Ctrl to pick the whole shape for one drag.' },
            { value: 'whole', label: 'Whole shapes', title: 'Any shape your drag touches is picked all of it, so you move it as one piece. Hold Ctrl to pick just the bit for one drag.' },
          ]}
          onChange={(v) => setChoice(SCOPE_CHOICE, v)}
        />
      )}
      {mode === 'magnetic' && <ClingSlider />}
      <Tip stays>
        {count ? `${count} selected.` : mode === 'magnetic' ? 'Trace roughly round shapes and the outline clings to their edges. Click to place a point, Backspace takes one back, Enter closes it.' : lasso ? 'Click a shape, or draw a lasso round several (hold Alt as you let go for straight sides).' : 'Click a shape, or drag a box round several.'} Hold Shift to add more. Drag a corner to resize and the round handle to turn.
      </Tip>
      <div className="cv-row cv-wrap">
        {ACTIONS.map(([id, label]) => (
          <ActionButton key={id} disabled={!count} onClick={() => void getCommand(id)?.run()}>
            {label}
          </ActionButton>
        ))}
      </div>
    </div>
  );
}
