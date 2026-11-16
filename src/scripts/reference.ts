// What a script can use, written for the panel so nobody faces a blank box. The commands are read live from the app.
import { appCommands } from '../plugins/appBridge';
import type { AppCommandInfo } from '../plugins/appRules';

export interface ApiLine {
  /** What to type. */
  code: string;
  /** What it does, in plain words. */
  says: string;
}

/** The `frameling` object, one line each. Every line is also what a plugin has, so a script moves into a plugin as it is. */
export const API: ApiLine[] = [
  { code: 'await frameling.document.selected()', says: 'What is picked: { frame, layerId, drawingId, shapes: [...] }.' },
  { code: 'await frameling.document.get()', says: 'The whole drawing: layers, drawings, shapes, markers, clips. Read only: change it with edit.' },
  { code: 'await frameling.document.state()', says: 'Where you are: { frame, activeLayerId, selection, drawingId }.' },
  { code: "await frameling.document.edit('Label', [ops])", says: 'Changes the drawing. All the changes in the list land together. Ops: setShapeStyle, removeShape, setLayer, setDocument, flipDrawing, transformDrawing, setPixels, addMarker, removeMarker, addClip, removeClip, addSwatch.' },
  { code: "await frameling.app.run('edit.duplicate')", says: 'Presses one of Frameling\'s own commands and waits until it is done.' },
  { code: 'await frameling.app.commands()', says: 'Lists every command a script can press: id, label, category and whether it can run right now.' },
  { code: 'await frameling.app.set({ frame, layerId, selection, color, fillColor })', says: 'Chooses what commands act on: the frame, the layer, the picked shapes, the colours.' },
  { code: "await frameling.ui.notify('Done!', 'success')", says: 'Shows a message. The second word can be info, success, warn or error.' },
  { code: 'console.log(...)', says: 'Prints a line in the panel under the script.' },
  { code: 'frameling.progress(done, total)', says: 'For a long script: says how far it has got, so it is not mistaken for one that is stuck.' },
];

/** Commands a script can press, filtered by what the person typed (id, name or category). */
export function commandMatches(all: AppCommandInfo[], text: string, limit = 40): AppCommandInfo[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? all.filter((c) => words.every((w) => `${c.id} ${c.label} ${c.category}`.toLowerCase().includes(w))) : all;
  return hits.slice(0, limit);
}

export const listCommands = (): AppCommandInfo[] => appCommands();

/** What a script can NOT do, and why. Shown in the panel and in the help, so nobody has to find out by failing. */
export const CANNOT: { what: string; why: string }[] = [
  { what: 'Open, save, import or export files', why: 'A script could overwrite or send away your work. Use Frameling\'s own File menu for those.' },
  { what: 'Reach the internet or read your files', why: 'Scripts run in a sandbox with neither. A plugin can ask for them, and you are asked first.' },
  { what: 'Restart Frameling, update it, or change its settings', why: 'These change how the app behaves for everything, not just this drawing.' },
  { what: 'Undo or Redo', why: 'A run is one step in Undo, and is taken back whole if it goes wrong. A script that undid steps would undo yours.' },
  { what: 'Go live, use your accounts, or start a review', why: 'They send things to other people.' },
  { what: 'Press other scripts or plugin commands', why: 'A script that starts a script could never be stopped sensibly.' },
  { what: 'Press a command with a number or text in it (say, "set the size to 30")', why: 'Commands take no settings. Choose the frame, layer, shapes and colours first with frameling.app.set, then press the command; or use an op in document.edit, which does take values.' },
  { what: 'Draw with the pointer, or read a drawing you have not opened', why: 'Scripts work on the open drawing as it is, and there is no pen for them to hold. A plugin can add its own tool.' },
];
