import { getCommand } from '../../core/registry';
import { useStore } from '../../core/store';
import { ActionButton, Tip } from '../../canvas/controls';
import { DrawModeToggle } from './DrawModeToggle';

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
  return (
    <div className="cv-options">
      <DrawModeToggle />
      <Tip>
        {count ? `${count} selected.` : 'Click a shape, or drag a box round several.'} Hold Shift to add more. Drag a corner to resize and the round handle to turn.
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
