// Record a move: palette, the Animate menu and keys.
import { registerCommands } from '../core/registry';
import { store, type State } from '../core/store';
import { toast } from '../ui/toast';
import { motionProblem } from './motions';
import { playTake, recordAgain, recordWhere, takeIsLatest, getTake } from './recording';

const canRecord = (s: State): boolean => {
  const w = recordWhere();
  return !!w && !motionProblem(s.doc, w, { allowTween: true });
};

registerCommands([
  {
    id: 'tween.recordMove',
    label: 'Record a move',
    category: 'Animate',
    keys: ['Alt+R'],
    description: 'Press and drag what is selected while the timeline plays, and Frameling turns your drag into keys. Use Detail to make them tidier or closer to your hand.',
    keywords: ['perform', 'performing', 'record motion', 'drag to animate', 'live', 'puppet', 'capture', 'draw the movement', 'move by hand', 'motion capture', 'record animation'],
    help: 'record-motion',
    enabled: canRecord,
    run: () => {
      const w = recordWhere();
      const why = w ? motionProblem(store().get().doc, w, { allowTween: true }) : 'Add a layer first, then draw something to move.';
      if (why) return void toast(why, { kind: 'warn' });
      store().setUi({ tool: 'record-move' });
      toast('Ready. Press on the canvas and drag: the timeline plays while you move it. Let go to make the keys.', { kind: 'info', duration: 3000 });
    },
  },
  {
    id: 'tween.recordAgain',
    label: 'Record the move again',
    category: 'Animate',
    description: 'Takes back the move you just recorded and gets ready for another go.',
    keywords: ['redo recording', 'retry', 'another take', 'try again'],
    help: 'record-motion',
    enabled: () => takeIsLatest(getTake()),
    run: () => recordAgain(),
  },
  {
    id: 'tween.recordPlay',
    label: 'Play the recorded move',
    category: 'Animate',
    description: 'Plays the move you just recorded from its start.',
    keywords: ['watch', 'replay', 'preview recording'],
    help: 'record-motion',
    enabled: () => takeIsLatest(getTake()),
    run: () => playTake(),
  },
]);
