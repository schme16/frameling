// The words of the help topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'animation-add': `A new drawing is **one picture**. There is no timeline, frame rate or onion skin in the way, so you can just draw. Want it to move? Add animation, and everything arrives at once.

## Add animation

Any of these does it:

- **Animation > Add animation** in the menu bar.
- The **Add animation** button in the bar at the bottom of the window. It stands where the frame rate and frame counter go once there is animation.
- The command search: type "animate", "frames", "timeline" or "animation".
- Asking for a frame. Pressing **N** (new drawing), **=** (insert a frame) or **.** (next frame), or opening the Timeline, adds animation first and then does what you asked. A message says so, and **Undo** takes both back.
- Picking the **Animate** room. Frameling adds animation for you, says so, and lets you change your mind. It asks the first time, then remembers.

You get a timeline with 24 frames, or 4 for pixel art. What you already drew stays on frame 1.

## Starters that move

Starters that are animations come with animation already on. Nothing to add and nothing to ask. A file you saved as an animation opens as one, because the file says so.

## Turn it off again

**Animation > Turn animation off** tucks the timeline, the frame rate and the animation tools away. **Nothing is deleted.** If you had frames, they stay in the file, and the message says how many. **Add animation** brings the timeline back with all of them. **Undo** works too.

While animation is off, the animation tools in the command search are greyed, and each says "Add animation first". Press one and the message has an **Add animation** button.

## Which drawings start as pictures?

- **Doodle** and **Square** start as one picture.
- **Custom** starts as a picture unless you tick **Add animation**.
- **Game sprite** and **Tiny sprite** start as one picture. Add animation gives them 4 frames.
- Starters made for animation, like the bouncing ball and the walk cycle, start animated. So do the sticker pack and the UI icon set, which keep one picture on each frame. **Blank level** starts as a picture.

Every drawing can change its mind. Doing one of each in a day is fine, because it belongs to the drawing and not to you.

Next: [the timeline](help:timeline), and [frames, keys and holds](help:timeline-frames).`,
};
