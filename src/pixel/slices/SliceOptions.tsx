// Tool options for the Slice tool: what dragging does, and the list of slices.
import { useEffect } from 'react';
import { ActionButton, Tip, Toggle } from '../../canvas/controls';
import { showPanel } from '../../ui/dock';
import { setPixelSettings, usePixelSettings } from '../settings';
import '../pixel.css';

export function SliceOptions() {
  const show = usePixelSettings((s) => s.showSlices);
  // The list lives in its own panel; choosing the tool brings it up.
  useEffect(() => showPanel('slices'), []);
  return (
    <div className="px-slice-options">
      <Tip>Drag on the layer to cut out a slice. Drag a slice to move it, its edges to resize it. Delete removes the picked one.</Tip>
      <Toggle label="Show slices on the canvas" checked={show} onChange={(v) => setPixelSettings({ showSlices: v })} />
      <ActionButton onClick={() => showPanel('slices')} title="Open the list of slices">
        Open the Slices list
      </ActionButton>
    </div>
  );
}
