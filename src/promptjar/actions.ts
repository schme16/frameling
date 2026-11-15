// What the audience may do with the jar: drop a prompt in. That is all. There is no action that reads the jar, shows
// a prompt or pulls one out, so nothing a viewer sends can put words on screen: only the streamer's own pull does.
// It never touches the drawing (no `touchesDrawing`), and the gate shows a waiting one by its label alone.
import { registerAudienceAction } from '../audience';
import { addToJar } from './jar';
import { ADD_COOLDOWN, cleanPrompt } from './logic';

export const ADD_ACTION = 'jar.add';

export function registerJarActions(): void {
  registerAudienceAction<{ text: string }>({
    id: ADD_ACTION,
    label: 'Add a prompt to the jar',
    kind: 'jar',
    cooldown: ADD_COOLDOWN,
    parse: cleanPrompt,
    // A repeat is quietly ignored. A full jar says so, which the audience card counts as "did not work".
    run: ({ text }) => {
      if (addToJar(text) === 'full') throw new Error('The prompt jar is full.');
    },
  });
}
