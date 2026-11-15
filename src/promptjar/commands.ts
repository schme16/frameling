import type { Command } from '../core/registry';
import { emptyTheJar, pullFromJar } from './JarCard';
import { hideJar, jarCardOpen, jarFocusAdd, showJar } from './card';
import { jar, passOn, putBack } from './jar';

const common = { category: 'Audience', help: 'prompt-jar', global: true } as const;
const KEYS = ['prompt', 'jar', 'idea', 'ideas', 'suggestion', 'suggestions', 'audience', 'chat', 'viewers', 'stream', 'draw'];
const inJar = (): number => jar.get().slips.length;

export const promptJarCommands: Command[] = [
  {
    id: 'promptjar.open',
    label: 'Prompt jar',
    description: 'Opens your private prompt jar: ideas your audience has dropped in, and a button to pull one out. Nothing in it shows until you open it.',
    keywords: [...KEYS, 'open', 'show', 'inbox'],
    ...common,
    checked: () => jarCardOpen.get(),
    run: () => (jarCardOpen.get() ? hideJar() : showJar()),
  },
  {
    id: 'promptjar.pull',
    label: 'Pull a prompt out of the jar',
    description: 'Picks one prompt from the jar at random and shows it to you, on the jar card. Pass on it if you do not want it.',
    keywords: [...KEYS, 'pull', 'pick', 'random', 'roll', 'draw one', 'next'],
    keys: ['Mod+Alt+Shift+J'],
    ...common,
    enabled: () => inJar() > 0,
    reason: () => 'The jar is empty. Prompts from your audience wait there, or add one of your own.',
    run: () => {
      showJar();
      pullFromJar();
    },
  },
  {
    id: 'promptjar.pass',
    label: 'Pass on this prompt',
    description: 'Throws away the prompt you pulled out. It does not come back.',
    keywords: [...KEYS, 'pass', 'skip', 'discard', 'no', 'not this one', 'reject'],
    ...common,
    enabled: () => jar.get().hand !== null,
    reason: () => 'You have not pulled a prompt out yet.',
    run: passOn,
  },
  {
    id: 'promptjar.putBack',
    label: 'Put this prompt back in the jar',
    description: 'Puts the prompt you pulled out back in the jar, to come up another time.',
    keywords: [...KEYS, 'put back', 'return', 'undo', 'later'],
    ...common,
    enabled: () => jar.get().hand !== null,
    reason: () => 'You have not pulled a prompt out yet.',
    run: putBack,
  },
  {
    id: 'promptjar.add',
    label: 'Add a prompt to the jar yourself',
    description: 'Opens the jar with the cursor in the box for your own prompt. Paste a list to add one per line.',
    keywords: [...KEYS, 'add', 'own', 'type', 'write', 'paste', 'list'],
    ...common,
    run: () => {
      showJar();
      jarFocusAdd.set((n) => n + 1);
    },
  },
  {
    id: 'promptjar.empty',
    label: 'Empty the prompt jar',
    description: 'Throws away every prompt in the jar, and the saved copy if you chose to keep one, in one click.',
    keywords: [...KEYS, 'empty', 'clear', 'wipe', 'delete', 'forget', 'privacy'],
    ...common,
    enabled: () => inJar() > 0 || jar.get().hand !== null,
    reason: () => 'The jar is already empty.',
    run: () => void emptyTheJar(),
  },
];

export const promptJarMenuItems = ['promptjar.open', 'promptjar.pull', 'promptjar.pass', 'promptjar.putBack', 'promptjar.add', 'promptjar.empty'];
