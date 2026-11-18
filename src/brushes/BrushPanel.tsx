// The Brush options' skeleton, one for both sides, so the vector Brush and the pixel brushes read the same top to bottom:
// the big preview, the titled Brush picker (with a line for what this kind of layer cannot draw of the brush), the parts of the brush (Tip, Stick), the paper, what the tip in use has, Size,
// what the brush has beside its size (hardness, flow, spacing), then Save and Share, then the folds. Each side hands in its own pieces; what the pieces are and where they go is here once.
// The test (test/brushes/panelSkeleton.test.tsx) holds both sides to this order.
import type { ReactNode } from 'react';
import { BrushPresetActions, BrushPresetPicker } from './BrushPresetRow';
import { KeptNote } from './Kept';
import { LitRow, PreviewFlash } from './PartsOptions';
import type { Side } from './presets';

export interface BrushPanelProps {
  side: Side;
  /** The big sample stroke. */
  preview: ReactNode;
  /** The Tip and the Stick, as the parts of the brush. */
  parts?: ReactNode;
  /** The Paper group, when the brush catches on paper. */
  paper?: ReactNode;
  /** What the tip or tool in use has: its own sliders and buttons. */
  controls?: ReactNode;
  /** The Size slider. */
  size: ReactNode;
  /** What the brush has beside its size: hardness, flow, spacing, pressure. */
  afterSize?: ReactNode;
  /** Folds and the rest, below Save and Share. */
  more?: ReactNode;
}

export function BrushPanel({ side, preview, parts, paper, controls, size, afterSize, more }: BrushPanelProps) {
  return (
    <div className="cv-options" data-brush-panel={side}>
      <PreviewFlash>{preview}</PreviewFlash>
      <LitRow part="brush">
        <BrushPresetPicker title="Brush" side={side} />
      </LitRow>
      <KeptNote side={side} />
      {parts}
      {paper}
      {controls}
      {size}
      {afterSize}
      <BrushPresetActions side={side} revert={!parts} />
      {more}
    </div>
  );
}
