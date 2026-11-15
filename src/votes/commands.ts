// The commands: start a vote, end it and see the result, put it away. All in the Audience menu.
import type { Command } from '../core/registry';
import { openVoteSetup } from './setupState';
import { closeVote, endVote, voteIsOpen, voteIsShowing } from './state';

const common = { category: 'Audience', help: 'votes', global: true } as const;

export const votesCommands: Command[] = [
  {
    id: 'votes.start',
    label: 'Start a vote',
    description: 'Ask your audience a question with two to six options. Frameling counts the votes live and shows you the result. It never acts on it: you decide.',
    keywords: ['vote', 'poll', 'ballot', 'chat', 'audience', 'stream', 'viewers', 'choose', 'decide', 'colour', 'color', 'what to draw'],
    keys: ['Mod+Alt+Y'],
    enabled: () => !voteIsShowing(),
    reason: () => (voteIsOpen() ? 'A vote is already going. End it first.' : 'Close the last result first.'),
    run: openVoteSetup,
    ...common,
  },
  {
    id: 'votes.end',
    label: 'End the vote and show the result',
    description: 'Stops counting and shows who won. Nothing changes in your drawing; what to do next is up to you.',
    keywords: ['vote', 'poll', 'end', 'finish', 'result', 'winner', 'stop counting', 'audience', 'stream'],
    keys: ['Mod+Alt+Shift+Y'],
    enabled: voteIsOpen,
    reason: () => 'No vote is going right now.',
    run: endVote,
    ...common,
  },
  {
    id: 'votes.close',
    label: 'Close the vote',
    description: 'Puts the vote or its result away. Everything about it is forgotten.',
    keywords: ['vote', 'poll', 'close', 'dismiss', 'hide', 'throw away', 'cancel', 'audience', 'stream'],
    enabled: voteIsShowing,
    reason: () => 'There is no vote on screen.',
    run: closeVote,
    ...common,
  },
];

export const votesMenuItems = ['-', 'votes.start', 'votes.end', 'votes.close'];
