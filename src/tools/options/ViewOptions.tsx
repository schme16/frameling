import { ActionButton, Tip } from '../../canvas/controls';
import { center, fit, zoom100, zoomStep } from '../../canvas/controller';

function Buttons() {
  return (
    <div className="cv-row cv-wrap">
      <ActionButton onClick={() => zoomStep(1)}>Zoom in</ActionButton>
      <ActionButton onClick={() => zoomStep(-1)}>Zoom out</ActionButton>
      <ActionButton onClick={fit}>Fit to window</ActionButton>
      <ActionButton onClick={zoom100}>100%</ActionButton>
      <ActionButton onClick={center}>Centre</ActionButton>
    </div>
  );
}

export function HandOptions() {
  return (
    <div className="cv-options">
      <Tip>Drag to move the page around. You can also hold Space while using any tool, or use the middle mouse button.</Tip>
      <Buttons />
    </div>
  );
}

export function ZoomOptions() {
  return (
    <div className="cv-options">
      <Tip>Click to zoom in. Alt+click to zoom out. Drag a box to zoom right to it.</Tip>
      <Buttons />
    </div>
  );
}
