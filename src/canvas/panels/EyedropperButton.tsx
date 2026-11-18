// The eyedropper, in the Colours panel beside Hex. It picks the Eyedropper tool (key I): click any colour you can see on
// the canvas and it becomes the colour of the box in front. It stays on that tool, so the tip says to pick your drawing tool again.
import { useStore } from '../../core/store';
import { pickTool } from '../../tools/pick';
import { Icon } from '../../ui/icons';

export function EyedropperButton() {
  const on = useStore((s) => s.ui.tool === 'eyedropper');
  return (
    <button
      type="button"
      className="cp-eyedropper"
      data-control="eyedropper"
      data-command="tools.eyedropper"
      aria-pressed={on}
      aria-keyshortcuts="I"
      title="Pick a colour from the drawing. This switches to the Eyedropper tool: click any colour you can see, then pick your drawing tool again."
      aria-label="Eyedropper: pick a colour from the drawing"
      onClick={() => pickTool('eyedropper')}
    >
      <Icon name="eyedropper" size={15} />
    </button>
  );
}
