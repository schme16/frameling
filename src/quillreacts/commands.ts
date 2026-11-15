import type { Command } from '../core/registry';
import { react, signFlow, type Reaction } from './react';

/** The streamer's own go at each one, so they can see what chat would see. It runs straight away: the audience switch and the limits are for the audience, not for you. */
const TRY: { id: string; label: string; description: string; which: Reaction | 'sign'; keywords: string[] }[] = [
  { id: 'quillreacts.cheer', label: 'Try: Quill cheers', which: 'cheer', description: 'Shows Quill cheering, the way he does when chat cheers. Only a try: nothing is sent anywhere.', keywords: ['cheer', 'clap', 'hooray', 'celebrate'] },
  { id: 'quillreacts.hop', label: 'Try: Quill hops', which: 'hop', description: 'Shows Quill hopping, the way he does when chat sets him off. Only a try.', keywords: ['hop', 'jump', 'bounce', 'boing'] },
  { id: 'quillreacts.snack', label: 'Try: Quill has a snack', which: 'snack', description: 'Shows Quill eating a snack from chat. Only a try, and it changes nothing about how he is.', keywords: ['snack', 'eat', 'feed', 'food', 'treat'] },
  { id: 'quillreacts.nuzzle', label: 'Try: Quill gets a cuddle', which: 'nuzzle', description: 'Shows Quill nuzzling, the way he does when chat sends a cuddle. Only a try.', keywords: ['cuddle', 'hug', 'nuzzle', 'pet'] },
  { id: 'quillreacts.wave', label: 'Try: Quill waves hello', which: 'wave', description: 'Shows Quill waving at chat. Only a try.', keywords: ['wave', 'hello', 'hi', 'greet'] },
  { id: 'quillreacts.sign', label: 'Try: Quill holds up a sign', which: 'sign', description: 'Shows the sign, question and all, with a made-up message. Nothing from chat is used.', keywords: ['sign', 'message', 'banner', 'board', 'words', 'approve'] },
];

/** The words on the pretend sign. Written here, not taken from anyone. */
export const SAMPLE_SIGN = 'Hello from chat!';

const common = { category: 'Audience', help: 'quill-reacts', global: true } as const;

export const quillReactCommands: Command[] = [
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
