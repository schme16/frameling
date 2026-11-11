// Clip flow commands and its panel.
import { lazyPanel } from '../core/lazy';
import { registerCommands, registerPanel } from '../core/registry';
import { showPanel } from '../ui/dock';
import { startTrying, stopTrying, tryingClip } from './ops';

registerPanel({ id: 'clip-flow', title: 'Clip flow', icon: 'flow', component: lazyPanel(() => import('./FlowPanel').then((m) => m.FlowPanel)), zone: 'right', order: 38, help: 'clip-flow' });

registerCommands([
  {
    id: 'flow.open',
    label: 'Clip flow (state machine)...',
    category: 'Animate',
    description: 'Say which clip plays first and what follows what: idle until jump, jump then land.',
    keywords: ['state machine', 'state graph', 'animation tree', 'transitions', 'states', 'clips', 'animator', 'blend tree'],
    help: 'clip-flow',
    run: () => showPanel('clip-flow'),
  },
  {
    id: 'flow.try',
    label: 'Try the clip flow',
    category: 'Animate',
    description: 'Plays the first clip, then follows the clip flow as clips end. Fire triggers from the Clip flow panel.',
    keywords: ['state machine', 'preview', 'test', 'play states'],
    help: 'clip-flow',
    enabled: (s) => s.doc.clips.length > 0,
    checked: () => !!tryingClip(),
    run: () => (tryingClip() ? stopTrying() : startTrying()),
  },
]);
