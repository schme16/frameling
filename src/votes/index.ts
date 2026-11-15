// Chat votes: counted, never applied. The streamer starts a vote with two to six options, the audience casts votes
// through the audience gate (src/audience) and the actions door (src/streamdoor), Frameling counts them live and shows
// a result, and that is where it stops. A feature you can turn off (Preferences > Features); off, there is no vote, no
// action, no command and no help, and a vote that was going is dropped.
import { defineFeature } from '../features/feature';
import { registerVoteAction } from './actions';
import { votesChoices } from './choices';
import { votesCommands, votesMenuItems } from './commands';
import { votesHelp } from './help';
import { closeVote, watchGate } from './state';

let unwatch: (() => void) | null = null;

export const votesFeature = defineFeature({
  id: 'stream-votes',
  name: 'Chat votes',
  about: 'Lets you ask your audience a question and count their votes live. It only counts: nothing in your drawing ever changes because of a vote. Needs the actions door, and only while audience features are on.',
  optional: true,
  requires: ['stream-door'],
  commands: votesCommands,
  help: votesHelp,
  choices: votesChoices,
  menus: [{ menu: 'sub:audience', items: votesMenuItems }],
  activate: () => {
    registerVoteAction();
    unwatch = watchGate();
  },
  deactivate: () => {
    unwatch?.();
    unwatch = null;
    closeVote();
  },
});

export { VoteLayer } from './VoteLayer';
