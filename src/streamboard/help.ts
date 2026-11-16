import type { HelpTopic } from '../core/registry';

/** Goes with the commands: it is for people who stream, so it leaves when the streaming tools are tucked away. */
export const streamboardHelp: HelpTopic[] = [
  {
    id: 'stream-control',
    title: 'Stream control: the private side of your stream',
    section: 'Streaming',
    media: 'stream-control.png',
    summary: 'A window for your second screen where you read and choose what is not agreed yet: the vote you are writing, the secret word and guesses of a guessing game, and every prompt waiting in the jar. Big buttons run the stream, and Stop everything is always there. It keeps working while you draw.',
    keywords: ['stream control', 'streamer tools', 'buttons', 'board', 'second screen', 'second monitor', 'other screen', 'control panel', 'rearrange', 'arrange', 'move buttons', 'layout', 'put buttons back', 'reset buttons', 'vote', 'guess', 'prompt', 'obs', 'stream', 'streamer', 'live', 'popout', 'pop out', 'window', 'on top', 'private', 'private side', 'waiting prompts', 'guesses', 'secret word', 'on stream', 'panel', 'one screen'],
    order: 0.6,
  },
];
