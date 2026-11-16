// The two things about scripts that people reasonably answer differently, asked once and then remembered
// (Preferences > Behaviour changes them). The words are in src/words/choices.json.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

/** Where a new script is kept. */
export const HOME_CHOICE = 'scripts.home';
/** What happens to the scripts inside a drawing you open. */
export const IN_FILES_CHOICE = 'scripts.inFiles';

registerChoice({
  id: HOME_CHOICE,
  title: choiceWord('choice.scripts.home.title'),
  question: choiceWord('choice.scripts.home.question'),
  category: 'Scripts',
  help: 'scripts',
  default: 'app',
  options: [
    { value: 'app', label: choiceWord('choice.scripts.home.app.label'), detail: choiceWord('choice.scripts.home.app.detail'), did: choiceWord('choice.scripts.home.app.did') },
    { value: 'doc', label: choiceWord('choice.scripts.home.doc.label'), detail: choiceWord('choice.scripts.home.doc.detail'), did: choiceWord('choice.scripts.home.doc.did') },
  ],
});

// A script that arrives inside somebody else's file can change your drawing and press commands. So this is always asked
// as a sheet that stops, "Turn them on" is never remembered (it is for this drawing, this time), and the only answer that is
// remembered is the careful one.
registerChoice({
  id: IN_FILES_CHOICE,
  title: choiceWord('choice.scripts.inFiles.title'),
  question: choiceWord('choice.scripts.inFiles.question'),
  category: 'Scripts',
  help: 'scripts',
  default: 'off',
  dismiss: 'off',
  mustAsk: true,
  options: [
    { value: 'off', label: choiceWord('choice.scripts.inFiles.off.label'), detail: choiceWord('choice.scripts.inFiles.off.detail'), once: true },
    { value: 'on', label: choiceWord('choice.scripts.inFiles.on.label'), detail: choiceWord('choice.scripts.inFiles.on.detail'), once: true },
    { value: 'never', label: choiceWord('choice.scripts.inFiles.never.label'), detail: choiceWord('choice.scripts.inFiles.never.detail'), did: choiceWord('choice.scripts.inFiles.never.did') },
  ],
});
