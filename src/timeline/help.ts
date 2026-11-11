/** The timeline's help topics: friendly words first, the industry word second. */
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'timeline',
    order: 1,
    title: 'The timeline',
    section: 'Animating',
    media: 'timeline-scrub.mp4',
    summary: 'Where your animation lives: layers on the left, frames across the top, drawings as little blocks.',
    keywords: ['frames', 'layers', 'animation', 'dope sheet', 'exposure sheet'],
    body: `The timeline is the strip along the bottom. Time runs left to right, one square for each frame. Your layers are stacked on the left, the top layer in front.

## Reading it

- A **bright block with a dot** is a drawing (a *key*). It's where a new drawing starts.
- A **paler tail** after it means the drawing is *held*: it stays on screen for those frames.
- An **empty square** means nothing is drawn on that layer at that frame.
- The **pink line** is the playhead: the frame you're looking at and drawing on.

## Getting around

- Click any square to go to that frame and pick that layer.
- Drag along the numbers at the top to scrub through your animation.
- Press **,** and **.** to step back and forward one frame, **Home** and **End** to jump to the ends.
- Hold **Ctrl** and scroll to zoom in and out of the timeline.

## Making things

- **N** starts a new blank drawing on this frame.
- **D** copies the drawing to the next frame, so you can change it a little.
- Right-click any square for everything you can do there, in plain words.

> The frame counter counts from 1, like a flipbook page. "3 / 24" means page three of twenty-four.

Learn more: [Frames, keys and holds](help:timeline-frames), [Layers](help:timeline-layers), [Playing your animation](help:timeline-playing).`,
  },
  {
    id: 'timeline-frames',
    order: 2,
    title: 'Frames, keys and holds',
    section: 'Animating',
    media: 'timeline-holds.mp4',
    summary: 'A frame is one picture in time. A key is where a new drawing starts, and a hold keeps it on screen for a while.',
    keywords: ['key', 'keyframe', 'hold', 'exposure', 'ones', 'twos', 'threes', 'on twos', 'duplicate', 'insert', 'remove frame', 'flipbook'],
    body: `Your animation plays at a set number of frames each second (the **fps** box in the timeline, 12 to start). Every frame can show a different drawing, but you rarely need to draw that many.

## Keys and holds

A **key** (keyframe) is a frame where you drew something new. A **hold** is how many frames that drawing stays up before the next key. Animators call this the drawing's *exposure*.

| Hold for | Animators say | Good for |
| --- | --- | --- |
| 1 frame | on ones | smooth, fast action |
| 2 frames | on twos | most hand-drawn animation, and a calm 12 drawings a second at 24 fps |
| 3 frames | on threes | slow, chunky, stop-motion feel |
| 4 frames | on fours | very slow or stylised moves |

Press **Alt+1** to **Alt+4** to hold the current drawing for that many frames. The drawings after it move along to make room.

Example: you have three drawings of a bouncing ball, each one frame long. Click the first and press **Alt+2**. It's now held for two frames, and the other two slide along. Do the same to the others and your ball bounces on twos.

## Making and changing keys

- **New blank drawing (N):** starts an empty drawing here. If you're in the middle of a hold, the hold is cut in two, and the new drawing starts at your frame.
- **Copy this drawing to the next frame (D):** a copy to nudge into the next pose. If the next frame is still part of a hold it just becomes its own drawing. If another drawing is already there, the later ones shift along to make room.
- **Clear this drawing:** wipes it clean but keeps the frame and its hold.
- **Make these frames empty:** takes the drawing away completely.

## Adding and removing time

- **Add a frame (=)** holds the drawing one frame longer, and everything after it moves later.
- **Remove a frame (-)** does the opposite.
- Drag the **right edge of a block** to hold it for longer or shorter, or drag the block to move it. If it lands on another drawing, that drawing is nudged out of the way (hold **Alt** while you let go to cover it instead).

## Moving between keys

**<** and **>** (Shift+comma and Shift+full stop) jump to the previous and next drawing on the layer you're on.

If a layer is locked its frames can't be changed. Click the padlock to unlock it.`,
  },
  {
    id: 'timeline-onion',
    order: 4,
    title: 'Onion skin',
    section: 'Animating',
    media: 'onion-skin.mp4',
    summary: 'See faint ghosts of the frames before and after this one, so each drawing lines up with its neighbours.',
    keywords: ['onion skin', 'ghost', 'tracing', 'tint', 'previous frame', 'light table'],
    body: `Drawing a walk or a bounce is much easier when you can see where the last pose was. **Onion skin** (named after the thin paper animators traced through) shows the neighbouring frames as faint ghosts under your drawing.

Press **Shift+O**, or click the onion in the timeline's top bar.

## Settings

Click the little arrow beside the onion for:

- **Frames before** and **frames after**: how many ghosts to show on each side. 2 before and 1 after is a good start.
- **Strength:** how strong the nearest ghost is. Ones further away fade.
- **Colours:** frames before are tinted rose and frames after mint, so you can tell them apart. Turn the tint off to see them in their own colours.

On the ruler, the frames being ghosted are softly shaded in the same colours.

> Ghosts are only for you. They never show up when you play or export.`,
  },
  {
    id: 'timeline-layers',
    order: 5,
    title: 'Layers: vector and pixel',
    section: 'Animating',
    media: 'timeline-layers.png',
    summary: 'Layers are sheets of see-through paper. A vector layer is for smooth drawing, a pixel layer is for pixel art.',
    keywords: ['layer', 'vector', 'pixel', 'lock', 'hide', 'opacity', 'order', 'duplicate layer', 'new layer', 'add layer'],
    body: `Layers are like sheets of tracing paper stacked on top of each other. Put the background on a low layer and your character on a higher one, and you can change one without touching the other.

## Two kinds

- **Vector layer** (the *V* badge): smooth, sharp lines that stay crisp at any size. Best for hand-drawn or cartoon art.
- **Pixel layer** (the *P* badge): pixel art, one square at a time. You choose how big each pixel is (new pixel layers copy the size of the ones you already have, or start at 8).

You can mix both in one animation.

## The layer list

- **Click** a layer to draw on it.
- **Double-click** its name to rename it.
- The **eye** hides it so you can see the layers below. Nothing is deleted.
- The **padlock** locks it, so you can't draw on it or change its frames by accident.
- The **...** button (or right-click) has the opacity slider, to make a whole layer see-through, plus move up and move down.
- **Drag** a layer up or down to change what's in front.

Along the top of the list: **Vector** and **Pixel** add a new layer above the one you're on, and the two small buttons duplicate (with all its drawings copied) or delete the layer. You always keep at least one layer, and Undo brings back a deleted one.

Shortcuts: **Ctrl+Shift+N** adds a vector layer.`,
  },
  {
    id: 'timeline-playing',
    order: 3,
    title: 'Playing your animation',
    section: 'Animating',
    media: 'timeline-playing.mp4',
    summary: 'Press Enter to watch it. It plays at your fps, and loops until you stop it.',
    keywords: ['play', 'pause', 'loop', 'fps', 'speed', 'preview', 'scrub', 'length'],
    body: `Press **Enter** (or the play button) to watch your animation, and again to stop.

## Speed and length

- **fps** is how many frames play each second. Games and cartoons often use 12 or 24. Change it in the timeline's top bar. It changes how fast things play, not how many frames you have.
- **Length** is how many frames the animation has. Drag the handle at the end of the ruler to make it longer or shorter, or just draw past the end and it grows to fit.

## Playback

- **Loop** (the loop button) starts again when it reaches the end. Turn it off to stop on the last frame.
- If you've picked a [clip](help:timeline-clips), only that part plays. Click the clip again to go back to playing everything.
- If your computer can't keep up, playback skips frames to stay in time instead of slowing down.
- Changing anything while it plays stops it, so you never edit a moving target.

## Moving around

| Key | What it does |
| --- | --- |
| Enter | Play or pause |
| , and . | Back and forward one frame |
| < and > | Previous and next drawing |
| Home and End | First and last frame |

You can also drag along the numbers at the top to scrub.`,
  },
  {
    id: 'timeline-clips',
    title: 'Clips',
    section: 'Animating',
    media: 'timeline-clips-markers.png',
    summary: 'A clip is a named stretch of frames, like idle, run or jump. Games and sprite sheets use them to tell animations apart.',
    keywords: ['clip', 'animation', 'sprite sheet', 'godot', 'unity', 'idle', 'run', 'jump', 'range', 'loop'],
    body: `One file can hold many animations. A character might have an **idle**, a **run** and a **jump**. Mark each as a **clip**, a named range of frames, and games and sprite sheets can find them by name.

## Making a clip

1. In the **clips row** (just under the numbers), drag across the frames you want.
2. Type a name (like *run*) and press Enter.

## Using a clip

- **Click** a clip to play just that part. Playback and the first and last frame buttons stay inside it. Click it again to go back to the whole animation.
- **Double-click** to rename it. Right-click for more: loop on or off, delete.
- The **loop** flag is saved with the clip. A game engine uses it to know whether to repeat it, like a run cycle (loops) or a jump (doesn't).

> Frames in your animation that are not in any clip still play and still export. Clips just give them names.

When you export a sprite sheet or a game animation file, each clip becomes its own animation.`,
  },
  {
    id: 'timeline-markers',
    title: 'Markers',
    section: 'Animating',
    media: 'timeline-clips-markers.png',
    summary: 'A marker names one moment, like a footstep or a hit, so a game can do something at exactly that frame.',
    keywords: ['marker', 'event', 'flag', 'footstep', 'sound', 'cue', 'note'],
    body: `A **marker** is a little flag on one frame with a name. It doesn't change what you see. It tells a game (or Interactives) *when* something should happen: play the footstep sound, flash the screen, spawn a puff of dust.

## Adding one

- **Double-click** in the markers row (the thin row under the numbers) at the frame you want.
- Or use **Add a marker here** from the command palette, to drop one on the current frame.

Type a name, like *footstep*, and press Enter.

## Changing one

- **Double-click** a marker to rename it.
- **Drag** it to move it to another frame.
- **Right-click** it to delete it.

Markers come out in exports as events.`,
  },
  {
    id: 'reference-layers',
    media: 'reference-layers.png',
    title: 'Reference layers',
    section: 'Animating',
    summary: 'A layer you see while drawing that every export leaves out, like a ground line or a rough sketch.',
    keywords: ['reference', 'guide', 'guide layer', 'not exported', 'sketch', 'ground', 'helper layer', 'hide from export', 'background sketch', 'trace', 'tracing', 'sketch layer'],
    body: `Some layers are only there to help you draw: the ground a character stands on, a rough sketch, a grid of where the feet go. Make it a **reference layer** and you still see it on the canvas, but videos, pictures, SVGs and sprite sheets all leave it out.

## Make one

Click the **⋯** button on a layer (or right-click it) and choose **Reference layer (leave out of exports)**. You can also find it in the command palette.

A reference layer's name turns *italic* with a small **ref** tag. Choose **Export this layer again** from the same menu to undo it.

## Good to know

- Hiding a layer (the eye) also keeps it out of exports, but then you can't see it either. A reference layer stays visible.
- The game hero template's **Ground** is a reference layer, so its sprite sheets come out with just the character and its shadow.`,
  },
]);
