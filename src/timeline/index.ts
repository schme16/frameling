// Registers the timeline area's commands, panels, tools and help topics.
import { registerPanel } from '../core/registry';
import './choices';
import './commands';
import './help';
import { installPlayback } from './playback';
import { TimelinePanel } from './TimelinePanel';

registerPanel({ id: 'timeline', title: 'Timeline', icon: 'timeline', component: TimelinePanel, zone: 'bottom', order: 10, help: 'timeline' });

// One playback loop for the app, driven by `ui.playing`.
installPlayback();

export { play, pause, togglePlay, goTo, stepFrame, stepKey, playRange } from './playback';
export * as timelineOps from './ops';
