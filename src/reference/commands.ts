// The commands for reference pictures: bringing one in, moving and sizing it, and what shows on which frame.
import { findLayer } from '../core/doc';
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { notify } from '../io/notify';
import { setLayerVisible } from '../timeline/ops';
import { fitPicture, pasteReferencePicture, pickPictureForFrame, pickReferencePictures, referenceLayerToEdit, removePictureFrom, resetPicture } from './ops';
import { getPlacing, setPlacing } from './state';

const HELP = 'reference-picture';
const anyPicture = (s: ReturnType<ReturnType<typeof store>['get']>) => s.doc.layers.some((l) => l.picture);

/** The layer the commands work on, said in a toast when there is none. */
function target() {
  const { doc, ui } = store().get();
  const layer = referenceLayerToEdit(doc, ui.activeLayerId);
  if (!layer) notify('There is no reference picture yet. Choose File > Import > Reference picture to add one.', 'info', undefined, 6000);
  return layer;
}

registerCommands([
  {
    id: 'file.importReference',
    label: 'Reference picture...',
    category: 'File',
    description: 'Put a JPG or PNG behind your drawing to trace or copy from. You can move, size, turn and fade it, and it is never exported.',
    help: HELP,
    keywords: ['reference', 'reference image', 'trace', 'tracing', 'photo', 'model sheet', 'mood board', 'underlay', 'picture behind', 'jpg', 'png', 'import', 'rotoscope', 'pureref'],
    run: () => pickReferencePictures(),
  },
  {
    id: 'reference.paste',
    label: 'Paste a picture as a reference',
    category: 'File',
    description: 'Takes the picture on the clipboard (a screenshot, an image copied from a web page) and puts it behind your drawing as a reference.',
    help: HELP,
    keys: ['Mod+Alt+V'],
    keywords: ['reference', 'paste', 'clipboard', 'screenshot', 'trace', 'picture behind', 'photo'],
    run: () => void pasteReferencePicture(),
  },
  {
    id: 'reference.place',
    label: 'Move, size and turn the reference picture',
    category: 'View',
    description: 'Drag the reference picture to move it, a corner to size it, the knob to turn it. Run it again to finish.',
    help: HELP,
    keys: ['Mod+Alt+R'],
    keywords: ['reference', 'move', 'scale', 'size', 'rotate', 'turn', 'position', 'place', 'trace', 'picture behind'],
    enabled: (s) => anyPicture(s),
    checked: () => !!getPlacing(),
    run: () => {
      if (getPlacing()) return setPlacing(null);
      const l = target();
      if (l) setPlacing(l.id);
    },
  },
  {
    id: 'reference.fit',
    label: 'Fit the reference picture to the page',
    category: 'View',
    description: 'Sizes the reference picture as big as it can be without cutting any off, in the middle of the page.',
    help: HELP,
    keywords: ['reference', 'fit', 'scale', 'size', 'centre', 'center', 'picture behind'],
    enabled: (s) => anyPicture(s),
    run: () => {
      const l = target();
      if (l) fitPicture(l.id, 'fit');
    },
  },
  {
    id: 'reference.fill',
    label: 'Fill the page with the reference picture',
    category: 'View',
    description: 'Sizes the reference picture to cover the whole page, cutting off what is left over.',
    help: HELP,
    keywords: ['reference', 'fill', 'cover', 'scale', 'size', 'picture behind'],
    enabled: (s) => anyPicture(s),
    run: () => {
      const l = target();
      if (l) fitPicture(l.id, 'fill');
    },
  },
  {
    id: 'reference.reset',
    label: 'Put the reference picture back to its own size',
    category: 'View',
    description: 'One picture pixel for each page pixel, in the middle, not turned.',
    help: HELP,
    keywords: ['reference', 'reset', 'original size', '100%', 'actual size', 'picture behind'],
    enabled: (s) => anyPicture(s),
    run: () => {
      const l = target();
      if (l) resetPicture(l.id);
    },
  },
  {
    id: 'reference.toggleShow',
    label: 'Show or hide the reference pictures',
    category: 'View',
    description: 'Hides every reference picture to see your drawing on its own, or brings them all back.',
    help: HELP,
    keywords: ['reference', 'hide', 'show', 'toggle', 'picture behind', 'eye'],
    enabled: (s) => anyPicture(s),
    run: () => {
      const layers = store().get().doc.layers.filter((l) => l.picture);
      const hide = layers.some((l) => l.visible);
      for (const l of layers) if (l.visible === hide) setLayerVisible(l.id, !hide);
    },
  },
  {
    id: 'reference.pictureFromHere',
    label: 'Use another picture from this frame on...',
    category: 'Layers',
    description: 'For a few traced frames: the reference layer shows the picture you pick from this frame until the next one you set.',
    help: HELP,
    keywords: ['reference', 'rotoscope', 'frame', 'per frame', 'another picture', 'swap', 'picture behind', 'change picture'],
    enabled: (s) => !!findLayer(s.doc, s.ui.activeLayerId)?.picture,
    run: () => pickPictureForFrame(),
  },
  {
    id: 'reference.removeFromHere',
    label: 'Take away the picture set on this frame',
    category: 'Layers',
    description: 'Goes back to the picture before this frame. The first picture of a layer stays: delete the layer to remove it.',
    help: HELP,
    keywords: ['reference', 'remove', 'per frame', 'picture behind', 'undo swap'],
    enabled: (s) => !!findLayer(s.doc, s.ui.activeLayerId)?.picture?.shots.some((x) => x.start === s.ui.frame) && (findLayer(s.doc, s.ui.activeLayerId)?.picture?.shots.length ?? 0) > 1,
    run: () => {
      const { doc, ui } = store().get();
      const l = findLayer(doc, ui.activeLayerId);
      if (l?.picture && !removePictureFrom(l.id, ui.frame)) notify('There is no picture set on this frame.', 'info');
    },
  },
]);
