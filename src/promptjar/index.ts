// The prompt jar: ideas from the audience go into a jar only the streamer can see, and the streamer pulls one out when
// they like. The action (src/promptjar/actions.ts) goes through the audience gate, so the switch, the cooldowns and Stop
// apply, and the actions door lists it with nothing more to do. A feature you can turn off (Preferences > Features); off,
// there is no action, command, chip or help.
import { onChoiceChange } from '../core/choices';
import { defineFeature } from '../features/feature';
import { registerJarActions } from './actions';
import { jarFeatureOn, hideJar } from './card';
import { jarChoices } from './choices';
import { promptJarCommands, promptJarMenuItems } from './commands';
import { promptJarHelp } from './help';
import { dropFromMemory, keepChanged, loadKept } from './jar';

let offChoice: (() => void) | null = null;

export const promptJarFeature = defineFeature({
  id: 'prompt-jar',
  name: 'Prompt jar',
  about: 'Lets your audience drop ideas to draw into a jar only you can see, and lets you pull one out. Nothing shows until you do. Needs the actions door.',
  optional: true,
  requires: ['stream-door'],
  commands: promptJarCommands,
  help: promptJarHelp,
  choices: jarChoices,
  menus: [{ menu: 'sub:promptjar', items: promptJarMenuItems }],
  activate: () => {
    registerJarActions();
    loadKept();
    jarFeatureOn.set(true);
    offChoice = onChoiceChange((id) => id === 'promptjar.keep' && keepChanged());
  },
  deactivate: () => {
    offChoice?.();
    offChoice = null;
    jarFeatureOn.set(false);
    hideJar();
    dropFromMemory();
  },
});

export { ADD_ACTION } from './actions';
export { cleanPrompt, JAR_MAX, PROMPT_MAX } from './logic';
