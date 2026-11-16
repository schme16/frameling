import type { Command } from '../core/registry';
import { openPrefs } from '../ui/overlays';
import { cancelConnect, connect, disconnect, hasTwitch } from './actions';
import { twitchStatus } from './state';

const KEYWORDS = ['twitch', 'stream', 'streamer', 'channel points', 'redeem', 'redemption', 'bits', 'cheer', 'follow', 'follower', 'sub', 'raid', 'audience', 'viewers', 'eventsub', 'sign in'];

export const twitchCommands: Command[] = [
  {
    id: 'twitch.connect',
    label: 'Connect Twitch',
    category: 'Audience',
    description: 'Sign in to Twitch with a short code, so channel point rewards, cheers, follows, subs and raids can make Quill and your audience tools react. No other program needed for those; votes and guesses come from chat and need a bot.',
    help: 'twitch',
    keywords: KEYWORDS,
    global: true,
    // It stays pressable with no Twitch app set, because pressing it should take you to where you fix that. Greying it
    // would be true but useless: the answer is a box in Preferences and you would have no way of knowing.
    enabled: () => hasTwitch() && twitchStatus.get().state === 'signed-out',
    reason: () => (hasTwitch() ? 'Already connected. Use Disconnect from Twitch first.' : 'Connect Twitch needs the desktop app.'),
    run: () => void connect(),
  },
  {
    id: 'twitch.cancel',
    label: 'Cancel connecting to Twitch',
    category: 'Audience',
    description: 'Throws away the code that is waiting to be approved.',
    help: 'twitch',
    keywords: ['twitch', 'cancel', 'stop', 'code', 'sign in'],
    global: true,
    enabled: () => twitchStatus.get().state === 'signing-in',
    reason: () => 'Nothing is waiting to be approved.',
    run: () => void cancelConnect(),
  },
  {
    id: 'twitch.disconnect',
    label: 'Disconnect from Twitch',
    category: 'Audience',
    description: 'Stops listening, tells Twitch to cancel the sign-in, and forgets it on this computer.',
    help: 'twitch',
    keywords: [...KEYWORDS, 'disconnect', 'sign out', 'revoke', 'log out', 'forget'],
    global: true,
    enabled: () => hasTwitch() && twitchStatus.get().state !== 'signed-out',
    reason: () => 'Twitch is not connected.',
    run: () => void disconnect(),
  },
  {
    id: 'twitch.links',
    label: 'Twitch links: what each event does',
    category: 'Audience',
    description: 'Choose which Twitch event (a reward, a cheer, a follow, a sub, a raid) makes which audience action happen, such as Quill cheering or a dare.',
    help: 'twitch-links',
    keywords: [...KEYWORDS, 'map', 'mapping', 'links', 'rules', 'actions'],
    global: true,
    run: () => openPrefs('streaming'),
  },
];
