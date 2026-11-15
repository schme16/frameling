import type { Command } from '../core/registry';
import { react, signFlow, type Reaction } from './react';
import { tryWelcome } from './welcomeFlow';
import { SAMPLE_NAME, type WelcomeKind } from './welcome';

/** The streamer's own go at each one, so they can see what chat would see. It runs straight away: the audience switch and the limits are for the audience, not for you. */
const TRY: { id: string; label: string; description: string; which: Reaction | 'sign'; keywords: string[] }[] = [
  { id: 'quillreacts.cheer', label: 'Try: Quill cheers', which: 'cheer', description: 'Shows Quill cheering, the way he does when chat cheers. Only a try: nothing is sent anywhere.', keywords: ['cheer', 'clap', 'hooray', 'celebrate'] },
  { id: 'quillreacts.hop', label: 'Try: Quill hops', which: 'hop', description: 'Shows Quill hopping, the way he does when chat sets him off. Only a try.', keywords: ['hop', 'jump', 'bounce', 'boing'] },
  { id: 'quillreacts.snack', label: 'Try: Quill has a snack', which: 'snack', description: 'Shows Quill eating a snack from chat. Only a try, and it changes nothing about how he is.', keywords: ['snack', 'eat', 'feed', 'food', 'treat'] },
  { id: 'quillreacts.nuzzle', label: 'Try: Quill gets a cuddle', which: 'nuzzle', description: 'Shows Quill nuzzling, the way he does when chat sends a cuddle. Only a try.', keywords: ['cuddle', 'hug', 'nuzzle', 'pet'] },
  { id: 'quillreacts.wave', label: 'Try: Quill waves hello', which: 'wave', description: 'Shows Quill waving at chat. Only a try.', keywords: ['wave', 'hello', 'hi', 'greet'] },
  { id: 'quillreacts.sign', label: 'Try: Quill holds up a sign', which: 'sign', description: 'Shows the sign, question and all, with a made-up message. Nothing from chat is used.', keywords: ['sign', 'message', 'banner', 'board', 'words', 'approve'] },
];

/** The made-up arrivals the welcome Try command goes through, in turn: a follower, a subscriber, a cheer, a raid. */
export const TRY_WELCOMES: { kind: WelcomeKind; raw: Record<string, unknown> }[] = [
  { kind: 'follow', raw: { name: SAMPLE_NAME } },
  { kind: 'sub', raw: { name: SAMPLE_NAME } },
  { kind: 'cheer', raw: { name: SAMPLE_NAME, amount: 100 } },
  { kind: 'raid', raw: { name: SAMPLE_NAME, amount: 12 } },
];
let nextTry = 0;

/** The words on the pretend sign. Written here, not taken from anyone. */
export const SAMPLE_SIGN = 'Hello from chat!';

const common = { category: 'Audience', help: 'quill-reacts', global: true } as const;

/** The streamer's own go at a welcome, with a made-up name, through the same flow chat's would take (so the question about the name is the real one). Each press is the next kind. */
const welcomeCommand: Command = {
  id: 'quillreacts.welcome',
  label: 'Try: Quill welcomes somebody new',
  description: 'Shows Quill welcoming a made-up follower, then a subscriber, a cheer and a raid on the next presses, with the question about the name first. Only a try: nothing is sent anywhere.',
  keywords: ['quill', 'welcome', 'welcomes', 'greet', 'follower', 'subscriber', 'sub', 'bits', 'raid', 'raiders', 'new', 'hello', 'name', 'try', 'chat', 'audience', 'stream', 'twitch'],
  category: 'Audience',
  help: 'quill-welcomes',
  global: true,
  run: () => {
    const t = TRY_WELCOMES[nextTry++ % TRY_WELCOMES.length];
    void tryWelcome(t.kind, t.raw);
  },
};

export const quillReactCommands: Command[] = [
  welcomeCommand,
  ...TRY.map(
    (t): Command => ({
      id: t.id,
      label: t.label,
      description: t.description,
      keywords: ['quill', 'chat', 'audience', 'stream', 'react', 'try', ...t.keywords],
      ...common,
      run: () => void (t.which === 'sign' ? signFlow(SAMPLE_SIGN, new AbortController().signal) : react(t.which)),
    }),
  ),
];

export const quillReactMenuItems = ['sub:quillreacts'];
