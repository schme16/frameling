// Reference pictures: a JPG or PNG behind the drawing, to trace or copy from. See model.ts (which picture shows and where it
// sits), paint.ts (drawing it, for the editing canvas only), ops.ts (adding and changing), Placement.tsx (the handles).
import './choices';
import './commands';
import './help';
import './drop';
import { findLayer } from '../core/doc';
import { store } from '../core/store';
import { setLayerOpacity } from '../timeline/ops';
import { addReferencePicture, referenceLayerToEdit, setPlacement } from './ops';

// With ?debug in the page address, adding a picture from bytes and placing it are exposed for the help picture capture and the checks.
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingReference: unknown }).__framelingReference = {
    add: (bytes: number[], name: string) => addReferencePicture(Uint8Array.from(bytes), name),
    /** Moves, sizes, turns and fades the first picture layer (from the top), as the bar and the handles would. */
    place: (change: { x?: number; y?: number; scale?: number; turn?: number; fade?: number }) => {
      const { doc, ui } = store().get();
      const layer = referenceLayerToEdit(doc, ui.activeLayerId);
      if (!layer) return false;
      const { fade, ...rest } = change;
      if (Object.keys(rest).length) setPlacement(layer.id, rest);
      if (fade !== undefined) setLayerOpacity(layer.id, fade);
      return !!findLayer(store().get().doc, layer.id);
    },
  };
}
