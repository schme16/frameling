// The two answers a vote remembers: what happens when someone votes twice, and what happens to a vote that comes with no
// voter id. Both are preferences (never asked in the middle of a stream), changed in Preferences > Streaming. Their
// words are in src/words/choices.json.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

export const votesChoices: ChoiceDef<string>[] = [
  {
    id: 'votes.again',
    title: choiceWord('choice.votes.again.title'),
    question: choiceWord('choice.votes.again.question'),
    options: [
      { value: 'first', label: choiceWord('choice.votes.again.first.label'), detail: choiceWord('choice.votes.again.first.detail'), did: choiceWord('choice.votes.again.first.did') },
      { value: 'latest', label: choiceWord('choice.votes.again.latest.label'), detail: choiceWord('choice.votes.again.latest.detail'), did: choiceWord('choice.votes.again.latest.did') },
    ],
    default: 'first',
    category: 'Streaming',
    help: 'votes',
    silent: true,
  },
  {
    id: 'votes.noId',
    title: choiceWord('choice.votes.noId.title'),
    question: choiceWord('choice.votes.noId.question'),
    options: [
      { value: 'refuse', label: choiceWord('choice.votes.noId.refuse.label'), detail: choiceWord('choice.votes.noId.refuse.detail'), did: choiceWord('choice.votes.noId.refuse.did') },
      { value: 'count', label: choiceWord('choice.votes.noId.count.label'), detail: choiceWord('choice.votes.noId.count.detail'), did: choiceWord('choice.votes.noId.count.did') },
    ],
    default: 'refuse',
    category: 'Streaming',
    help: 'votes',
    silent: true,
  },
];
