// What the phrase table found that is still wrong: sentences where the right answer is in the top three but wrong
// ones rank above it, and plain words that bring up a stream feature nobody asked for. Like the other lists in this
// folder it can only shrink, and it is exact: a number that changes, up or down, fails until the line is updated, so a
// win is written down and a slip is caught. Do not add a line to get a new row past the audit: fix the keywords.

/** A sentence whose right answer is not first. `rank` is where it sits now (2 means one wrong answer above it). */
export const RANKED_BEHIND: Record<string, { rank: number; why: string }> = {
  "rub out": { rank: 2, why: "Erase marks (the notes tool) says 'erase' in its name and beats the eraser." },
  "draw a circle": { rank: 3, why: "The marks circle and the Marks tool outrank the ellipse tool." },
  "draw a square": { rank: 3, why: "Artboard variation Square and the square grid outrank the rectangle tool." },
  "fill it in": { rank: 3, why: "The Fill help topic and 'no colour' outrank the paint bucket." },
  "move the page around": { rank: 2, why: "The canvas navigation help topic outranks the hand tool." },
  "select everything": { rank: 2, why: "Invert selection outranks Select all." },
  "copy and paste": { rank: 2, why: "Two help topics outrank each other, and Copy the stream overlay address is third: a keyword match from the audience family." },
  "make a symbol": { rank: 3, why: "Make one and Make frames outrank Make a symbol." },
  "add a new layer": { rank: 3, why: "New folder and Add a mask outrank adding a drawing layer." },
  "open a file": { rank: 2, why: "Open an Aseprite file outranks Open." },
  "export a video": { rank: 2, why: "Export ProRes outranks Export." },
  "import a picture": { rank: 2, why: "Palette from a picture outranks the import." },
  "rename my drawing": { rank: 2, why: "Name this drawing on the timeline outranks the document name help." },
  "turn on dark mode": { rank: 2, why: "The Color burn blend mode outranks the theme switch." },
  "put it on top of everything": { rank: 2, why: "The audience Stop button (audience.kill) outranks Bring to front: a stream emergency brake shown to a painter." },
  "go to the next frame": { rank: 2, why: "Duplicate drawing outranks Next frame." },
  "import a gif": { rank: 3, why: "Palette from a picture and Open a picture outrank the import." },
};

/** The plain words the crowding audit asks about: what somebody types before they know what anything is called. */
export const EVERYDAY_WORDS: string[] = [
  'settings', 'test', 'copy', 'address', 'stop', 'new', 'show', 'hide', 'close', 'clear', 'capture', 'open', 'save', 'undo', 'add', 'move', 'start',
  'end', 'list', 'key', 'help', 'send', 'share', 'record', 'live', 'reset', 'switch', 'connect', 'roll', 'turn on', 'turn off', 'preview',
];

/** The stream family's own words. Asking for one of these and getting a stream command is the palette working. */
export const STREAM_WORDS: string[] = ['stream', 'obs', 'audience', 'twitch', 'vote', 'dare', 'jar', 'prompt', 'quill', 'overlay', 'door', 'guess', 'live', 'capture'];

/** Plain words where more than one of the top five is a stream command, with how many. */
export const CROWDED_WORDS: Record<string, { count: number; why: string }> = {
  settings: { count: 3, why: 'Actions door settings, OBS settings and Stream overlay settings sit above Preferences-style settings like the grid.' },
  test: { count: 3, why: 'Test the overlay and two Try the dare commands match on test, the keyword for try it yourself.' },
  address: { count: 5, why: 'All five are stream commands: two Copy the address, a Roll and the two settings screens. Nobody else has an address.' },
  list: { count: 3, why: 'What the audience can dare, Add to the prompt jar and What the audience can do to your pen all say list.' },
  key: { count: 2, why: 'Copy the actions door key and Make a new key sit beside Next key and Previous key on the timeline.' },
  roll: { count: 3, why: 'Make a new door key, Pull a prompt and Make a new overlay address all say roll.' },
  start: { count: 2, why: 'Start a vote and Start a guessing game sit among the timeline and audio starts.' },
  close: { count: 2, why: 'Close the vote and Close the round sit beside Close the file.' },
  connect: { count: 4, why: 'Connect Twitch is right, but Cancel the Twitch sign-in and two OBS commands come along with it.' },
};
