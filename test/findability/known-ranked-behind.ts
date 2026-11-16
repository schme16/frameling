// What the phrase table found that is still wrong: sentences where the right answer is in the top three but wrong
// ones rank above it, and plain words that bring up a stream feature nobody asked for. Like the other lists in this
// folder it can only shrink, and it is exact: a number that changes, up or down, fails until the line is updated, so a
// win is written down and a slip is caught. Do not add a line to get a new row past the audit: fix the keywords.

/** A sentence whose right answer is not first. `rank` is where it sits now (2 means one wrong answer above it). */
export const RANKED_BEHIND: Record<string, { rank: number; why: string }> = {
  "import a gif": { rank: 2, why: "Open a picture or sprite sheet has the same keywords as the import and 'a' in its name, which the filler bonus rewards. The import lives in the Import menu, which the palette does not count as part of its name." },
  "pan": { rank: 3, why: "All panels and the Skeleton panel start with 'pan', and a name that starts with the word still outranks an exact synonym (the hand tool's 'pan')." },
  "colour it in": { rank: 3, why: "The colour commands say 'colour' in their own names, and the paint bucket only has it as a keyword." },
  "flip it": { rank: 3, why: "Flip view, and flipping a layer's mask, both say 'flip' plainly; flipping the drawing comes third." },
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
  address: { count: 2, why: 'Two stream commands: the two Copy the address. Nobody else has an address, so this is the palette being right. It was three before Copy the remote door address took a place in the top five, which pushed the actions door\'s Roll out: a win for somebody who is not streaming.' },
};
