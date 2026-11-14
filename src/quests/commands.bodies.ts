// The words of the help topics in commands.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  quests: `A quest is a little lesson with a handful of steps. You do each step in the real app, and Frameling ticks it off by itself.

## How it works

A small bar appears at the bottom left with what to do next, and a soft gold ring shows you where. [Quill](help:meet-quill) reads each step out in a speech bubble and points while the ring is showing. The dots show how far along you are.

- **Show me** does the step for you, so you can watch how it is done. You can undo it like anything else.
- **Skip** moves on without doing the step. **Back** returns to the step before, and waits for you to really do it again.
- When a step is done, a **Great work** card says what you just did. Press **Next** for the following step.
- The cross puts the quest down for now. Open the **Quests** panel (or press the command palette and type "quest") and choose **Continue** to carry on from the same step.
- Wait a while and the bar adds a quiet hint.

## The quests

The panel sorts them under five headings, each with how many you have done (like 1/3).

**Getting started**
- **Your first animation in 60 seconds** (Flipbooker). Draw, copy to the next frame, change it a little, press play. Onion skin is on for you.
- **Bouncing ball** (Squash & Stretch). Scrub the example, find the squash and change how long it is held.
- **Fill it in** (Paint Pot). The paint bucket and Close gaps.

**Drawing and pixel art**
- **Pixel pal**, **Shade and shine** and **Tiles**: a tiny sprite, shading with the palette, and a seamless tile painted into a level.
- **Say it with text** (Wordsmith). Letters that [pop in and wave](help:text-animators).

**Motion**
- **Your first tween** (Smooth Mover). Draw once, let Frameling draw the frames between.
- **Camera move** (Director). A [camera](help:camera) pan with far hills that drift slower.

**Rigging and effects**
- **Bones and a pose** (Puppeteer). Give an arm [bones](help:rig-bones) and make it wave.
- **Make it glow** (Lamplighter). A [glow](help:effects), the Add [blend mode](help:blend-modes) and a flicker.
- **Particle party** (Confetti Cannon). [Particles](help:particles) from a preset, made your own.

**Sharing**
- **Share it** (Showtime). Open Export and choose Animated GIF. Nothing is saved.

The first quest opens the others. If you said you're here for game sprites, **Pixel pal** is your first quest instead, and for tiles and levels it's **Tiles**; both are open from the start. If you already know your way around, **Try it anyway** is there on every locked one.

## Little things

- Quests that need a particular drawing (the ball, a lantern, a valley) ask before they replace what is open, and offer to save first.
- Your badges and place are remembered on this computer.
- With less motion asked for, the badge is a still card instead of confetti. Turn sounds on in Preferences for a soft chime.
- **Start the quests over** at the bottom of the panel forgets your badges.`,
};
