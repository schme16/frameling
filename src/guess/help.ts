import type { HelpTopic } from '../core/registry';

export const guessHelp: HelpTopic[] = [
  {
    id: 'guess',
    title: 'Guess the drawing: your audience guesses, Frameling keeps score',
    section: 'Streaming',
    media: 'guess.mp4',
    summary: 'You draw a secret word, your audience guesses it in chat, and Frameling checks the guesses and shows who got it. The word never shows on screen while the round runs, and nothing in your drawing changes.',
    keywords: ['guess', 'guessing', 'game', 'word', 'secret word', 'pictionary', 'gartic', 'charades', 'draw this', 'chat', 'viewers', 'audience', 'stream', 'twitch', 'streamer.bot', 'firebot', 'winner', 'hint', 'reveal', 'peek', 'quill', 'door', 'one guess'],
    order: 25,
  },
];
