// The questions a timelapse asks once and remembers. The words are in src/words/choices.json.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

/** Pictures from an earlier timelapse are waiting and a new recording starts. Nothing is lost unless they say so. */
registerChoice({
  id: 'timelapse.startAgain',
  title: choiceWord('choice.timelapse.startAgain.title'),
  question: choiceWord('choice.timelapse.startAgain.question'),
  category: 'Export',
  help: 'timelapse',
  default: 'continue',
  // Starting new throws the old pictures away, which Undo cannot bring back.
  mustAsk: true,
  options: [
    { value: 'continue', label: choiceWord('choice.timelapse.startAgain.continue.label'), detail: choiceWord('choice.timelapse.startAgain.continue.detail'), did: choiceWord('choice.timelapse.startAgain.continue.did') },
    { value: 'fresh', label: choiceWord('choice.timelapse.startAgain.fresh.label'), detail: choiceWord('choice.timelapse.startAgain.fresh.detail'), did: choiceWord('choice.timelapse.startAgain.fresh.did') },
  ],
});

/** What happens to the pictures once the video is saved. */
registerChoice({
  id: 'timelapse.afterExport',
  title: choiceWord('choice.timelapse.afterExport.title'),
  question: choiceWord('choice.timelapse.afterExport.question'),
  category: 'Export',
  help: 'timelapse',
  default: 'keep',
  options: [
    { value: 'keep', label: choiceWord('choice.timelapse.afterExport.keep.label'), detail: choiceWord('choice.timelapse.afterExport.keep.detail'), did: choiceWord('choice.timelapse.afterExport.keep.did') },
    { value: 'clear', label: choiceWord('choice.timelapse.afterExport.clear.label'), detail: choiceWord('choice.timelapse.afterExport.clear.detail'), did: choiceWord('choice.timelapse.afterExport.clear.did') },
  ],
});

/** Start recording whenever a drawing opens. A preference (never asked), off until someone turns it on. */
registerChoice({
  id: 'timelapse.autoStart',
  title: choiceWord('choice.timelapse.autoStart.title'),
  question: choiceWord('choice.timelapse.autoStart.question'),
  category: 'Export',
  help: 'timelapse',
  default: 'off',
  silent: true,
  options: [
    { value: 'off', label: choiceWord('choice.timelapse.autoStart.off.label'), detail: choiceWord('choice.timelapse.autoStart.off.detail') },
    { value: 'on', label: choiceWord('choice.timelapse.autoStart.on.label'), detail: choiceWord('choice.timelapse.autoStart.on.detail'), did: choiceWord('choice.timelapse.autoStart.on.did') },
  ],
});
