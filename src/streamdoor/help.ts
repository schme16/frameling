import type { HelpTopic } from '../core/registry';

export const streamDoorHelp: HelpTopic[] = [
  {
    id: 'actions-door',
    title: 'The actions door: Streamer.bot, Firebot and Stream Deck',
    section: 'Settings',
    media: 'actions-door.png',
    summary: 'A small local address that Streamer.bot, Firebot or a Stream Deck can call to make a short list of safe things happen in Frameling. It opens only while audience features are on.',
    keywords: ['streamer.bot', 'streamerbot', 'firebot', 'stream deck', 'touch portal', 'http', 'api', 'endpoint', 'token', 'key', 'port', 'channel points', 'redeem', 'twitch', 'youtube', 'kick', 'obs', 'stream', 'audience', 'local', 'curl'],
    order: 20,
  },
  {
    id: 'actions-door-reference',
    title: 'The actions door: what it can do',
    section: 'Settings',
    media: 'actions-door-reference.png',
    summary: 'The addresses, the example actions and every answer the actions door can give, for setting up Streamer.bot, Firebot or a Stream Deck.',
    keywords: ['actions', 'api', 'endpoint', 'http', 'post', 'get', 'json', 'cooldown', '429', '401', 'reason', 'door.message', 'door.zoom', 'streamer.bot', 'firebot'],
    order: 21,
  },
];
