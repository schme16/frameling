// Scripts to start from. Each one is a real script: open it, run it, change a number, see what happens.

export interface Example {
  id: string;
  name: string;
  /** One line for the picker. */
  about: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'red',
    name: 'Turn the picked shapes red',
    about: 'Reads what you picked and changes its colour.',
    code: `// Turn every picked shape red
const picked = await frameling.document.selected();

// Symbols' copies and particles keep their own colours, so leave those out.
const shapes = picked.shapes.filter((s) => s.type !== 'instance' && s.type !== 'particles');
if (shapes.length === 0) {
  await frameling.ui.notify('Pick some shapes first.', 'warn');
  return;
}

const changes = shapes.map((shape) => ({
  op: 'setShapeStyle',
  drawingId: picked.drawingId,
  shapeId: shape.id,
  color: '#e8403a',
  fill: '#e8403a',
}));
await frameling.document.edit('Make red', changes);
console.log('Painted ' + shapes.length + ' shapes.');
`,
  },
  {
    id: 'beats',
    name: 'A marker every 12 frames',
    about: 'Loops over the frames and adds a marker to each beat.',
    code: `// Put a marker every 12 frames, named Beat 1, Beat 2 and so on
const doc = await frameling.document.get();
const every = 12; // change this number to space them out differently

const changes = [];
for (let frame = 0; frame < doc.length; frame += every) {
  changes.push({ op: 'addMarker', frame, name: 'Beat ' + (frame / every + 1) });
}
await frameling.document.edit('Beats', changes);
console.log('Added ' + changes.length + ' markers.');
`,
  },
  {
    id: 'trail',
    name: 'Copy the picked shapes along a trail',
    about: 'Presses Frameling\'s own commands, one after another.',
    code: `// Copy the picked shapes three times, each copy a bit further to the right
const picked = await frameling.document.selected();
if (picked.shapes.length === 0) {
  await frameling.ui.notify('Pick some shapes first.', 'warn');
  return;
}

for (let i = 0; i < 3; i++) {
  await frameling.app.run('edit.duplicate'); // the copy is picked straight away
  await frameling.app.run('select.nudgeRightMore'); // 10 pixels along
  await frameling.app.run('select.nudgeRightMore');
}
// frameling.app.commands() lists every command a script can press.
`,
  },
];

/** A starting point for an empty script. */
export const BLANK = `// Write what you want to happen, then press Run.
// Ctrl+Enter runs it too. Everything it does is one step in Undo.
console.log('Hello from my script!');
`;
