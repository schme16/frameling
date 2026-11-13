// Registers the timeline area's commands, panels, tools and help topics.
import { lazyPanel } from '../core/lazy';
import { registerPanel } from '../core/registry';
import './choices';
import './commands';
import './keyCommands';
import './range';
import './help';
import { installPlayback } from './playback';
import { installTweenOffer } from './tweenOffer';
import { store } from '../core/store';
import { TimelinePanel } from './TimelinePanel';

registerPanel({ id: 'clip-play', title: 'Clip', icon: 'timeline', component: lazyPanel(() => import('./ClipPanel').then((m) => m.ClipPanel)), zone: 'right', order: 36, help: 'timeline-clip-play' });
registerPanel({ id: 'timeline', title: 'Timeline', icon: 'timeline', component: TimelinePanel, zone: 'bottom', order: 10, help: 'timeline' });
// Layers get a place of their own in the right rail, above Artboards, for drawings with more layers than the
// timeline's corner can show.
registerPanel({ id: 'layers', title: 'Layers', icon: 'layers', component: lazyPanel(() => import('./LayersPanel').then((m) => m.LayersPanel)), zone: 'right', order: 39, help: 'timeline-layers' });

// One playback loop for the app, driven by `ui.playing`.
installPlayback();
// The in-betweens offer closes itself when it stops fitting (see tweenOffer.ts).
installTweenOffer(store());

export { play, pause, togglePlay, goTo, stepFrame, stepKey, playRange } from './playback';
export * as timelineOps from './ops';
