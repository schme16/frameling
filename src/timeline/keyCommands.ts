// Commands for the detailed timeline: the look switch, fit, property rows, solo, and picked keys.
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { getPrefs } from '../ui/prefs';
import { toast } from '../ui/toast';
import { zoomToFit } from './Grid';
import { deleteKeys, moveKeys, scaleKeys, type KeysOutcome } from './keys';
import { isSolo, toggleSolo } from './layerExtras';
import { clearKeys, pickKeys, tl, toggleOpen } from './state';
import { layerTracks } from './tracks';
import { currentLayerId } from './ops';
import { setCleanTimeline } from './view';

const picked = () => [...tl().keys];
const hasKeys = () => tl().keys.size > 0;
const after = (o: KeysOutcome) => {
  if (o.ok) pickKeys(o.refs);
  else if (o.why) toast(o.why);
};

registerCommands([
  {
    id: 'view.cleanTimeline',
    label: 'Clean timeline (simple blocks)',
    category: 'View',
    description: 'Switch between the detailed timeline (keys as diamonds, tweens with their easing, property rows) and the clean one (one plain block per drawing).',
    help: 'timeline-detailed',
    keywords: ['simple timeline', 'detailed timeline', 'dope sheet', 'timeline style', 'property rows'],
    checked: () => getPrefs().cleanTimeline,
    run: () => setCleanTimeline(!getPrefs().cleanTimeline),
  },
  {
    id: 'timeline.zoomFit',
    label: 'Fit the whole animation in the timeline',
    category: 'Timeline',
    description: 'Zoom the timeline so every frame fits across it, even a few hundred. Runs of very short drawings squeeze into one band until you zoom in.',
    help: 'timeline-fit',
    keywords: ['zoom to fit', 'show all frames', 'zoom out'],
    run: () => void zoomToFit(),
  },
  {
    id: 'timeline.toggleProperties',
    label: 'Show or hide this layer\'s property rows',
    category: 'Timeline',
    description: 'Open the layer up to see a row for each thing that changes on it (position, zoom, a bone, an effect), with its keys.',
    help: 'timeline-detailed',
    keywords: ['expand layer', 'collapse layer', 'tracks', 'properties', 'twirl'],
    enabled: () => {
      const id = currentLayerId();
      const l = id ? store().get().doc.layers.find((x) => x.id === id) : undefined;
      return !!l && !getPrefs().cleanTimeline && layerTracks(store().get().doc, l).length > 0;
    },
    run: () => {
      const id = currentLayerId();
      if (id) toggleOpen(id);
    },
  },
  {
    id: 'timeline.soloLayer',
    label: 'Show only this layer (solo)',
    category: 'Layers',
    description: 'Hide every other layer while you work on this one. Run it again to bring them back as they were.',
    help: 'timeline-detailed',
    keywords: ['solo', 'isolate', 'only this layer'],
    checked: (s) => !!s.ui.activeLayerId && isSolo(s.doc, s.ui.activeLayerId),
    run: () => {
      const id = currentLayerId();
      if (id) toggleSolo(id);
    },
  },
  {
    id: 'timeline.deleteKeys',
    label: 'Delete the picked keys',
    category: 'Timeline',
    description: 'Take the picked keys away. A drawing\'s frames go to the drawing before it. (Delete does this while the timeline has focus.)',
    help: 'timeline-detailed',
    keywords: ['remove keyframes', 'delete keyframes'],
    enabled: hasKeys,
    run: () => {
      const o = deleteKeys(picked());
      if (o.ok) clearKeys();
      else if (o.why) toast(o.why);
    },
  },
  { id: 'timeline.keysLater', label: 'Move the picked keys one frame later', category: 'Timeline', description: 'Nudge the picked keys right. (Alt+Right arrow while the timeline has focus.)', help: 'timeline-detailed', keywords: ['nudge keys', 'retime'], enabled: hasKeys, run: () => after(moveKeys(picked(), 1)) },
  { id: 'timeline.keysEarlier', label: 'Move the picked keys one frame earlier', category: 'Timeline', description: 'Nudge the picked keys left. (Alt+Left arrow while the timeline has focus.)', help: 'timeline-detailed', keywords: ['nudge keys', 'retime'], enabled: hasKeys, run: () => after(moveKeys(picked(), -1)) },
  { id: 'timeline.keysSpread', label: 'Spread the picked keys out (twice as long)', category: 'Timeline', description: 'Make the picked keys take twice as long, counting from the first one. Slower.', help: 'timeline-detailed', keywords: ['scale keys', 'stretch', 'slower', 'timing'], enabled: () => tl().keys.size > 1, run: () => after(scaleKeys(picked(), 2)) },
  { id: 'timeline.keysSqueeze', label: 'Squeeze the picked keys together (half as long)', category: 'Timeline', description: 'Make the picked keys take half as long, counting from the first one. Faster.', help: 'timeline-detailed', keywords: ['scale keys', 'compress', 'faster', 'timing'], enabled: () => tl().keys.size > 1, run: () => after(scaleKeys(picked(), 0.5)) },
]);
