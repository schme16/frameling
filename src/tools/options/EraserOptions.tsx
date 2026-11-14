import { Choice, Slider, Tip } from '../../canvas/controls';
import { setChoice, useChoice } from '../../core/choices';
import type { EraserWay } from '../eraser';
import { PenOptions } from '../../tablet/PenOptions';
import { setToolSettings, useToolSettings } from '../settings';
import { useActiveLayerKind } from './BrushOptions';
import { DrawModeToggle } from './DrawModeToggle';
import { useStore } from '../../core/store';
import { findLayer } from '../../core/doc';
import { isMergeLayer } from '../merge-mode';
import { MirrorOptions } from './MirrorOptions';

export function EraserOptions() {
  const kind = useActiveLayerKind();
  const size = useToolSettings((s) => s.eraserSize);
  const pixels = useToolSettings((s) => s.eraserPixelSize);
  const way = useChoice<EraserWay>('eraser.vectorWay');
  const merge = useStore((s) => isMergeLayer(findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1]));
  if (kind === 'pixel') {
    return (
      <div className="cv-options">
        <Slider label="Size" value={pixels} min={1} max={24} format={(v) => `${v} pixel${v === 1 ? '' : 's'}`} onChange={(v) => setToolSettings({ eraserPixelSize: v })} />
        <Tip>Rubs out pixels as you drag.</Tip>
        <PenOptions tool="eraser" size />
      </div>
    );
  }
  return (
    <div className="cv-options">
      <DrawModeToggle />
      {!merge && (
        <Choice
          label="Rub out"
          value={way}
          options={[
            { value: 'bit', label: 'Just the bit', title: 'Only the part you drag over goes, like a real rubber. A line can be cut in two or nibbled at the end.' },
            { value: 'whole', label: 'Whole lines', title: 'Anything the circle touches goes, so one swipe removes a stroke or a shape.' },
          ]}
          onChange={(v) => setChoice('eraser.vectorWay', v)}
        />
      )}
      <Slider label={merge || way === 'bit' ? 'Size' : 'Reach'} value={size} min={2} max={120} format={(v) => `${v}px`} onChange={(v) => setToolSettings({ eraserSize: v })} />
      <Tip>
        {merge
          ? 'This layer merges shapes, so the eraser rubs out just the area under the circle. Grouped shapes are left alone.'
          : way === 'bit'
            ? 'Rubs out just the part under the circle. Drag across a line to cut it in two, or along its end to nibble it away. Symbols and text are left alone.'
            : 'This erases whole lines. Anything the circle touches disappears, so one swipe removes a stroke or a shape. Undo brings it back.'}
      </Tip>
      <MirrorOptions />
      <PenOptions tool="eraser" size />
    </div>
  );
}
