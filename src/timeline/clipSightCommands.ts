// Seeing what you are actually working on: name a drawing, see a clip's drawings once each, find one by name, and keep
// the onion skin inside the clip. The words and pictures are in the 'timeline-drawings' and 'timeline-onion' help.
import { registerCommands } from '../core/registry';
import { celAt, findLayer } from '../core/doc';
import { currentChoice, setChoice } from '../core/choices';
import { store } from '../core/store';
import { showPanel } from '../ui/dock';
import { toast } from '../ui/toast';
import { wantFind } from './drawingsFind';
import { currentLayerId } from './ops';
import { ONION_CLIPS } from './onionScope';
import { setTl, tl } from './state';
import type { OnionClipsChoice } from './choices';

export const DRAWINGS_PANEL = 'clip-drawings';

/** The drawing under the playhead on the layer you are on. */
function drawingHere() {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, currentLayerId());
  const cel = layer ? celAt(layer, ui.frame) : undefined;
  return layer && cel ? { layer, cel } : undefined;
}

registerCommands([
  {
    id: 'timeline.nameKey',
    label: 'Name this drawing (so you can find it again)',
    category: 'Timeline',
    keys: ['F2'],
    description: 'Give the drawing on this frame a name like "eyes sad" or "arm up". It shows on the timeline and in the Drawings panel, so you find a pose by name and not by counting frames.',
    help: 'timeline-drawings',
    keywords: ['name', 'rename', 'label', 'pose', 'call it', 'title'],
    enabled: () => !!drawingHere(),
    run: () => {
      const here = drawingHere();
      if (!here) return void toast('There is no drawing on this frame. Press N to start one, then name it.');
      showPanel('timeline');
      setTl({ editing: { kind: 'cel', id: here.cel.id } });
    },
  },
  {
    id: 'timeline.showDrawings',
    label: 'See the drawings in this clip',
    category: 'Timeline',
    description: 'A picture of every drawing in the clip you are in, held frames skipped, with its name underneath. Click one to go there.',
    help: 'timeline-drawings',
    keywords: ['contact sheet', 'thumbnails', 'poses', 'keys', 'keyframes', 'overview', 'frames at a glance', 'drawings'],
    run: () => showPanel(DRAWINGS_PANEL),
  },
  {
    id: 'timeline.findDrawing',
    label: 'Find a drawing by name and jump to it',
    category: 'Timeline',
    description: 'Open the Drawings panel with the cursor in its search box. Type part of a name, then click the picture.',
    help: 'timeline-drawings',
    keywords: ['go to', 'jump', 'search', 'named drawing', 'pose by name', 'find pose'],
    run: () => {
      wantFind();
      showPanel(DRAWINGS_PANEL);
      setTl({ findTick: tl().findTick + 1 });
    },
  },
  {
    id: 'timeline.onionAcrossClips',
    label: 'Onion skin carries on into the next clip',
    category: 'Timeline',
    description: 'Normally the onion skin stops at the edge of the clip you are in, so you never draw a pose against a limb from another animation. Turn this on for one long scene made of clips back to back.',
    help: 'timeline-onion',
    keywords: ['onion skin', 'clips', 'across', 'cross', 'edge', 'next clip', 'ghost', 'neighbouring'],
    checked: (s) => !!s.ui.onion.acrossClips,
    run: () => {
      const across = currentChoice<OnionClipsChoice>(ONION_CLIPS) === 'across';
      setChoice(ONION_CLIPS, (across ? 'inside' : 'across') satisfies OnionClipsChoice);
      if (!across) store().setUi((ui) => (ui.onion.enabled ? {} : { onion: { ...ui.onion, enabled: true } }));
    },
  },
]);
