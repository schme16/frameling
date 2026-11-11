// The "Merge shapes together" switch at the top of every vector drawing tool's options (picked on the board over
// two picture buttons).
import { findLayer } from '../../core/doc';
import { useStore } from '../../core/store';
import { Toggle } from '../../canvas/controls';
import { layerDrawMode, setLayerDrawMode, type DrawMode } from '../merge-mode';

const HINT: Record<DrawMode, string> = {
  object: 'Off: each shape stays on its own, so you can move it later (object drawing). Key: J',
  merge: 'On: shapes join their own colour and cut other colours, like paint (merge drawing). Ctrl+G keeps a shape apart. Key: J',
};

export function DrawModeToggle() {
  const layer = useStore((s) => findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1]);
  if (!layer || layer.kind !== 'vector') return null;
  const mode = layerDrawMode(layer);
  return (
    <div data-quest="draw-mode">
      <Toggle label="Merge shapes together" checked={mode === 'merge'} onChange={(on) => setLayerDrawMode(layer.id, on ? 'merge' : 'object')} hint={HINT[mode]} />
    </div>
  );
}
