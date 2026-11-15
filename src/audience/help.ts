import type { HelpTopic } from '../core/registry';

export const audienceHelp: HelpTopic[] = [
  {
    id: 'audience',
    title: 'Audience features and the pill',
    section: 'Streaming',
    media: 'audience.png',
    summary: 'Off until you switch it on. While it is on, a yellow Audience participation: on pill shows in the title bar. Press it to turn everything off. OBS shares the same pill.',
    keywords: ['stream', 'streamer', 'streaming', 'twitch', 'youtube', 'kick', 'chat', 'viewers', 'audience', 'on air', 'audience participation', 'live', 'obs', 'kill', 'panic', 'stop', 'queue', 'cooldown', 'rate limit', 'safety', 'privacy', 'interactive'],
  },
];

/** Goes with the gate commands: it is for people who stream, so it leaves when the streaming tools are tucked away. */
export const startHelp: HelpTopic[] = [
  {
    id: 'viewers-take-part',
    title: 'Getting your viewers taking part',
    section: 'Streaming',
    media: 'viewers-take-part.png',
    summary: 'The whole route from a Twitch channel to viewers voting: connect Twitch for rewards and cheers, add a chat bot for votes and guesses, import the setup file, run your first vote.',
    keywords: ['how do i', 'get started', 'start', 'setup', 'set up', 'first time', 'viewers', 'audience', 'interact', 'interaction', 'participate', 'take part', 'vote', 'voting', 'guess', 'prompt', 'suggest', 'suggestions', 'chat', 'twitch', 'bot', 'firebot', 'streamer.bot', 'channel points', 'overlay', 'obs', 'go live', 'stream'],
    order: 0.5,
  },
];
