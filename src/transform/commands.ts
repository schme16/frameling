// The Transform tool's commands. The tool itself is `tools.transform` (Q), which the registry makes from the tool.
import { getCommand, registerCommand, registerCommands } from '../core/registry';
import { store } from '../core/store';
import { hint } from '../canvas/controller';
import { rectCentre } from '../canvas/geometry';
import { cancel, commit, currentFrame, getSession, isDirty, sayWith, setFrame, whyNot, begin } from './session';

/** Switches to the tool first, so a command from the palette lands on the box you can see. */
function toTool(): void {
  if (store().get().ui.tool !== 'transform') void getCommand('tools.transform')?.run();
}

registerCommands([
  {
    id: 'transform.apply',
    label: 'Apply the transform',
    category: 'Select',
    description: 'Land what you have moved, turned, stretched or slanted with the Transform tool, as one undo step. Enter does the same.',
    help: 'transform',
    keywords: ['transform', 'commit', 'confirm', 'done', 'accept', 'enter', 'free transform'],
    enabled: () => isDirty(),
    run: () => {
      sayWith(hint);
      const r = commit();
      if (r.lossy) hint('Pixels were picked again to fit, so this is not exactly what you had. Ctrl+Z puts them back.');
    },
  },
  {
    id: 'transform.putBack',
    label: 'Put the transform back',
    category: 'Select',
    description: 'Throw away what you have moved, turned, stretched or slanted with the Transform tool, and put it all back as it was. Escape does the same.',
    help: 'transform',
    keywords: ['transform', 'cancel', 'revert', 'undo', 'escape', 'reset', 'discard'],
    enabled: () => isDirty(),
    run: () => {
      cancel();
      hint('Put back as it was.');
    },
  },
  {
    id: 'transform.pivotMiddle',
    label: 'Pivot to the middle',
    category: 'Select',
    description: 'Put the Transform tool’s turning point back in the middle of the box.',
    help: 'transform',
    keywords: ['transform', 'pivot', 'origin', 'centre', 'center', 'reference point', 'turn around'],
    enabled: () => !!currentFrame(),
    run: () => {
      toTool();
      const why = getSession() ? null : whyNot();
      if (why) return hint(why);
      const s = begin();
      if (!s) return;
      setFrame({ m: s.f.m, pivot: rectCentre(s.f.r0) });
    },
  },
]);

// Undo while a transform is open puts it back (nothing has landed yet), instead of undoing the step before it.
const undo = getCommand('edit.undo');
if (undo) {
  registerCommand({
    ...undo,
    enabled: (s) => isDirty() || (undo.enabled ? undo.enabled(s) : true),
    run: () => {
      if (!isDirty()) return undo.run();
      cancel();
      hint('Put back as it was.');
    },
  });
}
