// Two palette commands for the streaming family as one thing: tuck it away, bring it back. They are what typing "turn
// off stream stuff" finds, and the switch opposite the title on Preferences > Streaming runs the same two.
import { registerCommands } from '../core/registry';
import { toast } from '../ui/toast';
import { STREAM_FEATURES, streamingCount, STREAMING_NAME } from './streamFamily';
import { bringStreamingBack, tuckStreaming } from './streamOffer';

const WORDS = ['stream', 'streaming', 'streamer', 'twitch', 'chat', 'audience', 'viewers', 'obs', 'dares', 'votes', 'prompt jar', 'live'];

registerCommands([
  {
    id: 'features.streamingOff',
    label: `Tuck away the ${STREAMING_NAME.toLowerCase()}`,
    category: 'Features',
    description: 'Puts the streaming tools out of sight: audience dares, chat votes, the prompt jar, Twitch and the rest. Nothing is deleted, and they come back with one switch.',
    help: 'features',
    keywords: [...WORDS, 'hide', 'turn off', 'switch off', 'remove', 'put away', 'tuck', 'simple', 'stuff', 'things', 'shorter menus', 'declutter', 'i do not stream', 'never', 'i never stream'],
    global: true,
    enabled: () => streamingCount() > 0,
    reason: () => 'The streaming tools are already tucked away.',
    run: () => void tuckStreaming(),
  },
  {
    id: 'features.streamingOn',
    label: `Bring back the ${STREAMING_NAME.toLowerCase()}`,
    category: 'Features',
    description: 'Switches every streaming tool back on: audience dares, chat votes, the prompt jar, Twitch and the rest.',
    help: 'features',
    keywords: [...WORDS, 'show', 'turn on', 'switch on', 'bring back', 'tucked away', 'enable', 'i stream'],
    global: true,
    enabled: () => streamingCount() < STREAM_FEATURES.length,
    reason: () => 'Every streaming tool is already on.',
    run: () => {
      if (bringStreamingBack() > 0) toast(`The ${STREAMING_NAME.toLowerCase()} are on. Their commands are in the command palette and the View menu now.`, { kind: 'success' });
    },
  },
]);
