// The words of the help topic in remember-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'remembered-settings': `Close Frameling and open it again, and your tools are as you left them.

## What comes back

- The **brush**: size, smoothing, pressure and the pointy ends.
- The **stroke** and **fill** colours, and whether the stroke is switched on.
- **Loop playback**, and play back and forth.
- The **onion skin**: on or off, how many frames before and after, how strong, and the colours.
- The options of the eraser, pencil, shapes, pixel tools and [mirror drawing](help:mirror-drawing), which were already remembered.

## What doesn't

Things that are about where you are right now start fresh: the playhead, what is selected, the layer you are on, the zoom and whether it is playing. The tool you had picked starts as the brush.

## If you'd rather the onion skin started off

Press **Ctrl+K** (the command palette) and run **Bring the onion skin back on at launch** to turn it off. The frames and strength are still remembered, just not the on or off. It also sits in Preferences > Behaviour.

## Starting over

Run **Put the brush, colours, onion skin and looping back to the start** from the command palette. It is one step and it is what a fresh install has.

Your settings are kept on this computer, and the **Backup** button in Preferences includes them.`,
};
