import type { HelpTopic } from '../core/registry';

/** Goes with the commands: it is for people who stream, so it leaves when the streaming tools are tucked away. */
export const streamboardHelp: HelpTopic[] = [
  {
    id: 'stream-control',
    title: 'Stream control: buttons for your second screen',
    section: 'Streaming',
    media: 'stream-control.png',
    summary: 'A window of big buttons for another screen: start and end a vote, start a guessing game, pull a prompt, switch audience participation on or off, and Stop everything. Move the buttons where you like. It keeps working while you draw.',
    keywords: ['stream control', 'streamer tools', 'buttons', 'board', 'second screen', 'second monitor', 'other screen', 'control panel', 'rearrange', 'arrange', 'move buttons', 'layout', 'put buttons back', 'reset buttons', 'vote', 'guess', 'prompt', 'obs', 'stream', 'streamer', 'live', 'popout', 'pop out', 'window', 'on top'],
    order: 0.6,
  },
];
