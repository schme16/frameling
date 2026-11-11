// The friendly tips that rotate in the status bar. `{key:command.id}` is replaced with that command's shortcut.
import { getCommand } from '../core/registry';
import { shortcutLabel } from './keys';

export const TIPS: string[] = [
  'Press {key:view.commandPalette} to find anything. Just type what you want to do.',
  'Press F1 over anything to read about it.',
  'Made a mistake? {key:edit.undo} takes it back, as many times as you like.',
  'Hold Space and drag to slide the canvas around.',
  'Drag a panel tab to another side to move it. It remembers where you put it.',
  'Rest your mouse on a button to see what it does, and its shortcut.',
  'Switch between Draw, Animate and Pixel layouts from the View menu.',
  'Making pixel art? The Preview panel plays it at real size while you draw. Try the Pixel workspace.',
  'Every shortcut can be changed in Preferences, under Keyboard.',
  'Try the other look in Preferences. Cosy is soft, crisp is sharp.',
  'Press the name at the top to rename your drawing.',
  'You can leave the welcome sheet off. Turn it back on in Preferences.',
  'Twelve frames a second feels hand-drawn. Twenty-four feels like film.',
];

export function tipText(tip: string): string {
  return tip.replace(/\{key:([\w.]+)\}/g, (_, id: string) => {
    const c = getCommand(id);
    return (c && shortcutLabel(c)) || 'the menu';
  });
}
