import type { HelpTopic } from '../core/registry';

export const streamDoorHelp: HelpTopic[] = [
  {
    id: 'chat-commands',
    title: 'Chat commands: Firebot and Streamer.bot, step by step',
    section: 'Streaming',
    media: 'chat-commands.png',
    summary: 'Frameling never reads your chat, so Firebot or Streamer.bot reads it and passes what viewers type on. The route from nothing to a working !vote, and what to do when it fails.',
    keywords: ['chat commands', 'command', 'commands', '!vote', '!guess', '!prompt', 'type in chat', 'viewers type', 'twitch', 'streamer.bot', 'streamerbot', 'firebot', 'bot', 'chat bot', 'setup', 'set up', 'linux', 'curl', 'test', 'user id', 'http', 'wine'],
    order: 19,
  },
  {
    id: 'chat-commands-firebot',
    title: 'Chat commands with Firebot',
    section: 'Streaming',
    media: 'chat-commands-firebot.png',
    summary: 'Step by step in Firebot: a !vote, !guess and !prompt command, each sending to the actions door with the HTTP Request effect. No code, and it runs on Linux.',
    keywords: ['firebot', 'http request', 'effect', 'custom command', '$arg', '$userid', 'convertToJSON', 'linux', 'deb', 'rpm', 'chat', 'vote', 'guess', 'prompt', 'twitch'],
    order: 22,
  },
  {
    id: 'chat-commands-streamerbot',
    title: 'Chat commands with Streamer.bot',
    section: 'Streaming',
    media: 'chat-commands-streamerbot.png',
    summary: 'Step by step in Streamer.bot: one action with a little pasted C# that sends !vote, !guess and !prompt to the actions door. Fetch URL only does GET, so the door needs the code.',
    keywords: ['streamer.bot', 'streamerbot', 'c#', 'csharp', 'fetch url', 'execute c# code', 'command triggered', 'wine', 'linux', 'chat', 'vote', 'guess', 'prompt', 'twitch', 'youtube', 'kick'],
    order: 23,
  },
  {
    id: 'actions-door',
    title: 'The actions door: Streamer.bot, Firebot and Stream Deck',
    section: 'Streaming',
    media: 'actions-door.png',
    summary: 'A small local address that Streamer.bot, Firebot or a Stream Deck can call to make a short list of safe things happen in Frameling. It opens only while audience features are on.',
    keywords: ['streamer.bot', 'streamerbot', 'firebot', 'stream deck', 'touch portal', 'http', 'api', 'endpoint', 'token', 'key', 'port', 'channel points', 'redeem', 'twitch', 'youtube', 'kick', 'obs', 'stream', 'audience', 'local', 'curl'],
    order: 20,
  },
  {
    id: 'actions-door-reference',
    title: 'The actions door: what it can do',
    section: 'Streaming',
    media: 'actions-door-reference.png',
    summary: 'The addresses, the example actions and every answer the actions door can give, for setting up Streamer.bot, Firebot or a Stream Deck.',
    keywords: ['actions', 'api', 'endpoint', 'http', 'post', 'get', 'json', 'cooldown', '429', '401', 'reason', 'door.message', 'door.zoom', 'streamer.bot', 'firebot'],
    order: 21,
  },
];
