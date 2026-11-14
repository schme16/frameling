// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
import { ix } from '../features/flags';
export const bodies: Record<string, string> = {
  timeline: `The timeline is the strip along the bottom. Time runs left to right, one square for each frame. Your layers are stacked on the left, the top layer in front.

## Reading it

- A **solid cell with a diamond** (a bright block with a dot on the clean timeline) is a drawing (a *key*). It's where a new drawing starts.
- A **paler band** after it means the drawing is *held*: it stays on screen for those frames.
- An **empty square** means nothing is drawn on that layer at that frame.
- The **pink line** is the playhead: the frame you're looking at and drawing on.

## Getting around

- Click any square to go to that frame and pick that layer.
- Drag along the numbers at the top to scrub through your animation.
- Press **,** and **.** to step back and forward one frame, **Home** and **End** to jump to the ends.
- Hold **Ctrl** and scroll to zoom in and out of the timeline.
- Drag the timeline about with the middle mouse button, or hold **Space** and drag, just like the canvas.

## Making things

- **N** starts a new blank drawing on this frame.
- **D** copies the drawing to the next frame, so you can change it a little.
- Right-click any square for everything you can do there, in plain words.

> The frame counter counts from 1, like a flipbook page. "3 / 24" means page three of twenty-four.

Learn more: [Frames, keys and holds](help:timeline-frames), [Keys, tweens and property rows](help:timeline-detailed), [Layers](help:timeline-layers), [Playing your animation](help:timeline-playing).`,
  'timeline-detailed': `The timeline starts out **detailed**. Each layer row shows its drawings as cells:

- A **solid cell with a diamond** is a key: a new drawing starts there.
- A **paler band with a small box at the end** is a hold: the drawing stays on screen until the box. Stripes mean it carries on by itself until your next drawing.
- An **empty cell** shows nothing on that layer.
- A **purple arrow** is in-betweens (a tween) to the next key, with a little curve showing the easing. A **green arrow** melts one shape into the next (a morph).

## Property rows

Click the **arrow** beside a layer's name to open it. You get a row for each thing that changes on it: position, size or turn of a symbol, where a camera looks, each bone of a puppet, each animated effect. Every key is a diamond on its row, and a line joins two keys where the value glides between them. Each row's keys move on their own: see [Property rows](help:timeline-property-rows).

## Picking and moving keys

- **Click** a diamond to pick it. **Shift+click** picks more, across any layers.
- **Drag** across the empty part of a property row (or **Shift** and drag anywhere empty) to pick every key in a box.
- **Drag** a picked diamond to retime all the picked keys. A hold that ran up to the next key still does, so tweens stay joined.
- Hold **Alt** while you drag to **stretch or squeeze** the picked keys from the first one: slower or faster.
- **Delete** takes picked keys away. The drawing before carries on over the gap. A key on a property row goes alone.

Right-click a key for **Spread out** and **Squeeze together** too.

## With the keyboard

Click the frames once so the timeline has the keys, then:

| Keys | Does |
| --- | --- |
| Arrow keys | move round the cells, rows included |
| Shift + arrows | pick the keys you pass over |
| Ctrl + Left or Right | jump to the previous or next key on the row |
| Alt + Left or Right | nudge the picked keys a frame |
| Delete | delete the picked keys |
| Esc | let go of the picked keys |

## Around the edges

- The ruler shows **seconds** along the top and **frames** underneath. Markers draw a faint line down through the rows.
- **Ctrl + scroll** zooms; the magnifier button **fits** the whole animation in view. In a narrow window back and forth, add a sound and clean timeline move into the **...** menu at the end of the buttons; the rest stay as icons (hover one for its name).
- **S** on a layer shows only that layer (solo). Click it again to bring the others back as they were.
- Give a layer a **colour label** from its **...** menu, to tell layers apart at a glance.

## Prefer it simpler?

Turn on **Clean timeline** (the sliders button in the timeline, **View > Look and sound > Clean timeline (simple blocks)**, or **Preferences > General**) for one plain block per drawing and no property rows. Everything else works the same.`,
  'timeline-property-rows': `Open a layer with the **arrow** beside its name and each thing that changes gets its own row of diamonds.

## What moves on its own

- A symbol's **Position**, **Size**, **Turn**, **Slant**, **See-through** and **Tint**.
- Each **bone** of a puppet: one diamond is that bone's pose at that moment.
- A camera's **Where it looks**, **Zoom** and **Turn**.

Drag a diamond, stretch a few (**Alt** and drag) or press **Delete**, and only that row changes. A deleted key leaves the row at the value it had just before. Everything is one step in Undo.

## Dropping a diamond between drawings

Frameling makes a drawing key there to hold it. If the diamond lands inside in-betweens (a tween), the two halves play the same curve the one span did, and share out its extra spins and cut its motion path where the object is, so the other rows keep their easing and nothing speeds up, slows down or jumps. Other rows show no diamond there, because nothing was set on them: they are on the curve exactly where they would have been. A row only gets a diamond at the new key if its value there is not what the curve gives.

## When it says no

Frameling tells you in plain words. It can't land on another key of the same row, on a frame with nothing to hold a key (an empty frame, or no camera key), inside a morph (a shape melting into the next one), or on a locked layer. A motion path can also say no at a frame where a bouncy easing runs back over the path. The first key of a row stays: it's where the row starts.

## The exception

The **Shape (morph)** row is different. Its keys are the drawings themselves, so dragging one moves the whole drawing.

Learn more: [Keys, tweens and property rows](help:timeline-detailed), [Tweens](help:tweens).`,
  'timeline-frames': `Your animation plays at a set number of frames each second (the **fps** box in the timeline, 12 to start). Every frame can show a different drawing, but you rarely need to draw that many.

## Keys and holds

A **key** (keyframe) is a frame where you drew something new. A **hold** is how many frames that drawing stays up before the next key. Animators call this the drawing's *exposure*.

| Hold for | Animators say | Good for |
| --- | --- | --- |
| 1 frame | on ones | smooth, fast action |
| 2 frames | on twos | most hand-drawn animation, and a calm 12 drawings a second at 24 fps |
| 3 frames | on threes | slow, chunky, stop-motion feel |
| 4 frames | on fours | very slow or stylised moves |

Press **Alt+1** to **Alt+4** to hold the current drawing for that many frames. The drawings after it move along to make room. The **Hold for** buttons in the timeline do the same (on a narrow timeline they fold into one **Hold for** button with a menu). It says **none** on a frame with no drawing.

Example: click the first of three one-frame drawings and press **Alt+2**. It's held for two frames and the others slide along. Do the same to the rest and it plays on twos.

A new drawing stays on screen until your next one, so there are no blank gaps. See [New drawings carry on](help:drawings-carry-on).

## Making and changing keys

- **New blank drawing (N):** starts an empty drawing here. If you're in the middle of a hold, the hold is cut in two, and the new drawing starts at your frame.
- **Copy this drawing to the next frame (D):** a copy to nudge into the next pose. If another drawing is already next, the later ones shift along. On an empty frame it copies the last drawing to that frame, so you can carry on.
- **Clear this drawing:** wipes it clean but keeps the frame and its hold.
- **Make these frames empty:** takes the drawing away completely.

In the top bar these buttons show their words while there's room, and shrink to icons as the timeline narrows. Hover one for its tip.

## Adding and removing time

- **Add a frame (=)** holds the drawing one frame longer, and everything after it moves later. A message says what it did, with a **Change** button.
- **Remove a frame (-)** does the opposite. With several layers it asks first whether to take the frame off every layer or just this one, since that can take drawings with it.
- Drag the **right edge of a block** to hold it for longer or shorter, or drag the block to move it. If it lands on another drawing, that drawing is nudged out of the way (hold **Alt** while you let go to cover it instead).

## Moving between keys

**<** and **>** (Shift+comma and Shift+full stop) jump to the previous and next drawing on the layer you're on.

If a layer is locked its frames can't be changed. Click the padlock to unlock it.`,
  'timeline-copy-keys': `Repeat a walk cycle three times, put a blink at the start and the end, copy a mouth shape onto another layer, paste a pose at frame 40. Copy the drawings once, paste them where you like.

**Copy:** pick some keys (click one, **Shift**+click more, or **Shift**+drag a box), or click a frame that has a drawing. Then press **Ctrl+C** while the timeline has focus. **Ctrl+X** cuts them instead. Right-click works too.

The copy keeps each drawing, how long it is held, and the gaps between them.

**Paste:** click the frame you want it to start on, pick the layer, and press **Ctrl+V**. The pasted keys are picked, so you can nudge them straight away.

- **Pasted drawings are new drawings.** Change one and the original stays as it was.
- To add on to the end of a layer, use **Paste keys after the last drawing** (in the command palette): the playhead can't go past the end, and this goes right after it.
- Keys copied from several layers land on the layer you paste on and the ones below it, in the same order.
- **Paste keys where they were** (in the command palette) puts them back on the same layers and frames, as new drawings, covering what is there now.

**When it lands on drawings that are already there:** the first time, Frameling makes room: the drawings in the way move later, so nothing is lost. A message says so, with a **Change** button for **Paste over them** instead, which covers them and keeps the animation the same length. Either way, Undo takes it back. You can change your mind any time in Preferences > Behaviour.

**Onto another kind of layer:** a vector drawing pasted on a pixel layer becomes pixels, with hard edges snapped to that layer's grid (and its palette, when that is locked). A pixel drawing pasted on a vector layer becomes a picture you can move, turn and resize. A message says what was converted. Camera keys and tile keys only go on their own kind of layer.

**Good to know:**

- Only drawing keys are copied. Effect keys aren't; a symbol's position, size and turn travel with its drawing.
- On the canvas, **Ctrl+C** still copies shapes. It is the timeline having focus (click it first) that makes it copy keys.
- Shapes and pixels: [Copy and paste with other apps](help:clipboard-system).`,
  'timeline-tidy-end': `Stretch a hold to frame 31, then pull it back to 28, and the timeline still says 31. The three frames on the end are empty. **Tidy the end** is Frameling taking them off, so the animation finishes where your last drawing does.

## The first time it happens

Frameling takes them off for you, and a little message at the bottom says so: **Took the empty frames off the end.** Press **Change** on it if you'd rather keep the length you have. Frameling puts the frames back and asks which you want from now on.

- **Take them off** (what it does to start with): the animation ends where its last drawing, marker or clip ends. From then on it happens by itself, in the same step as your edit, so one **Undo** puts it all back.
- **Keep the length I have:** nothing changes. The empty frames wait on the end.

Whichever you pick is remembered. Change it any time in **Preferences > Behaviour**, under **Empty frames at the end**.

## Do it yourself

Open the command palette and run **Tidy the end**, or use **Frames and motion > Tidy the end**. It works whatever you chose above, and you can undo it.

## What it never touches

The end never moves past the furthest of these, so nothing gets lost:

- the last drawing, with its hold
- markers and clips (a clip counts to its last frame)
- the **in** and **out** points of a play range
- animated effect keys and where a sound starts

Each artboard keeps its own length, so tidying one never changes another.

Good to know: opening a file never shortens it. Only an edit that leaves empty frames on the end does it, such as dragging a hold shorter, removing a frame, deleting a drawing or deleting a layer. Setting the length yourself always does exactly what you typed.

Learn more: [Frames, keys and holds](help:timeline-frames), [The timeline](help:timeline).`,
  'timeline-onion': `Drawing a walk or a bounce is much easier when you can see where the last pose was. **Onion skin** (named after the thin paper animators traced through) shows the neighbouring frames as faint ghosts under your drawing.

Press **Shift+O**, or click **Onion skin** (the onion, when the bar is narrow) in the timeline's top bar.

## Settings

Click the little arrow beside the onion for:

- **Frames before** and **frames after**: how many ghosts to show on each side. 2 before and 1 after is a good start.
- **Strength:** how strong the nearest ghost is. Ones further away fade.
- **Colours:** frames before are tinted rose and frames after mint, so you can tell them apart. Turn the tint off to see them in their own colours.

- **Only show keys (skip held frames):** counts drawings instead of frames. If your drawings are held for two or three frames each (on twos or threes), the ghosts are the poses before and after this one, not copies of the drawing you're on. Also in **Frames and motion > Onion skin shows only keys**.

On the ruler, the frames being ghosted are softly shaded in the same colours.

## Boards either side

Storyboarding on several [artboards](help:artboards)? Tick **Show the boards either side too** and the boards around the one you're on come up as ghosts as well, counted the same way as frames: **frames before** boards back, **frames after** boards on. The board before shows its last frame, the one you cut from, and the board after shows its first, the one you cut to, so a hand or a horizon carries across the cut. On a board with one drawing on it that's just that drawing. Also in **Frames and motion > Onion skin shows the boards either side**.

Board ghosts sit under this board's own frame ghosts, and a board of another size is fitted into yours and centred. Variations are left out: a variation is another take on a board, not the next one.

Looking through the [camera](help:camera)? The ghosts go through it too, so they sit where you see the drawing, and they stay quick even with heavy drawings.

> Ghosts are only for you. They never show up when you play or export.`,
  'drawings-carry-on': `When you draw on an empty frame, that drawing stays on screen until your next drawing, or to the end of the
animation. So you can draw on frame 1, then frame 5, then frame 9, press play, and see each drawing in turn with no
blank gaps. In the timeline a hold like this is a lighter block.

Draw on a later frame of that lighter block and a **new drawing** starts there: the one before stays on the earlier
frames, and shows faintly behind your new drawing so you can see where it was. Changing what's already there (moving,
rubbing out, recolouring) works on the drawing you can see.

Pick a hold yourself (**Alt+1** to **Alt+4**, or drag a block's end) and it stays exactly as you set it. Prefer every
new drawing to last one frame? Change **How long a new drawing lasts** in Preferences > Behaviour.`,
  'empty-frame-ghost': `Click a frame where nothing is drawn yet and your last drawing shows there faintly, in its own colours. It's
there so the drawing doesn't seem to vanish, and so you have something to trace over for the next pose.

Start drawing and the ghost stays behind your new lines until you go to another frame.

It's only for you: it never shows when you play or export. It hides while the [onion skin](help:timeline-onion) is on,
since that already shows the frames around this one. Looking through the [camera](help:camera), it goes through it too.

Turn it off or on in **View > Ghost on empty frames**.

Want to trace a particular frame, not just the last one? Put it on the [light table](help:light-table).`,
  'timeline-layers': `Layers are like sheets of tracing paper stacked on top of each other. Put the background on a low layer and your character on a higher one, and you can change one without touching the other.

## Two kinds

- **Vector layer** (the *V* badge): smooth, sharp lines that stay crisp at any size. Best for hand-drawn or cartoon art.
- **Pixel layer** (the *P* badge): pixel art, one square at a time. Each pixel starts 8 wide on the page, so a 1280 x 720 page gives a 160 x 90 pixel layer. The first one you add tells you its size, with a **Change size** button that opens the page size. New pixel layers copy the size of the ones you already have.

You can mix both in one animation.

## Where the list is

Layers show in two places, and they are the same list: the **Layers** panel in the right rail, and down the left
side of the timeline, where each row lines up with that layer's keys. Use whichever is closer to what you are
doing. Anything you change in one shows in the other at once.

## The layer list

- **Click** a layer to draw on it.
- **Double-click** its name to rename it.
- The **eye** hides it so you can see the layers below. Nothing is deleted.
- The **padlock** locks it, so you can't draw on it or change its frames by accident.
- The **...** button (or right-click) has the opacity slider, to make a whole layer see-through, plus move up and move down.
- **Drag** a layer up or down to change what's in front.

Along the top of the list, **Vector** and **Pixel** sit under **New layer**: each is a button that adds a layer of that kind above the one you're on (they aren't a mode switch). The two small buttons duplicate (with all its drawings copied) or delete the layer. You always keep at least one layer, and Undo brings back a deleted one.

Shortcuts: **Ctrl+Shift+N** adds a vector layer.`,
  'timeline-playing': `Press **Enter** (or the play button) to watch your animation, and again to stop.

## Speed and length

- **fps** is how many frames play each second. Games and cartoons often use 12 or 24. Change it in the timeline's top bar. It changes how fast things play, not how many frames you have.
- **Length** is how many frames the animation has. Drag the handle at the end of the ruler to make it longer or shorter, or just draw past the end and it grows to fit.

## Playback

- **Loop** (the loop button) starts again when it reaches the end. Turn it off to stop on the last frame.
- **Back and forth** (the button beside loop) plays to the end and then backwards to the start, instead of jumping back. Lovely for breathing, swinging and floating. With loop off it plays there and back once.
- If you've picked a [clip](help:timeline-clips), only that part plays. Click the clip again to go back to playing everything.
- To play just part of the animation without making a clip, set a [play range](help:timeline-play-range).
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
  'timeline-play-range': `Working on the jump in the middle of a long animation? Set a **play range** (in and out) and only those frames play, over and over, while you polish them.

## Set it

- **Shift and drag** along the numbers at the top of the timeline.
- Or go to a frame and press **Alt+[** to start the range there, then go to another and press **Alt+]** to end it.
- Or right-click the numbers and pick **Start the play range here** or **End the play range here**.

Frames outside the range are dimmed on the ruler, and there's a bracket at each end. Drag a bracket to move that end. The timeline's top bar shows the range, with an **x** to clear it.

## Clear it

Click the **x** beside the range in the top bar, or use **Frames and motion > Play everything again**. Undo (**Ctrl+Z**) also brings back a range you changed.

## Good to know

- The range is saved with your drawing.
- It keeps hold of the same drawings when you add or remove frames on every layer (or on your only layer): frames added before it push it along, and frames added inside it make it longer.
- A [clip](help:timeline-clips) you pick takes over while it's picked. Setting a range lets go of the clip.
- **Export** offers **Play range** under "What to export", so you can save just that part as a GIF, a video or a sprite sheet.
- It works with [back and forth](help:timeline-playing) too.`,
  'timeline-clips': `One file can hold many animations. A character might have an **idle**, a **run** and a **jump**. Mark each as a **clip**, a named range of frames, and games and sprite sheets can find them by name.

## Making a clip

1. In the **clips row** (just under the numbers), drag across the frames you want.
2. Type a name (like *run*) and press Enter.

## Using a clip

- **Click** a clip to play just that part. Playback and the first and last frame buttons stay inside it. Click it again to go back to the whole animation.
- A **short clip** shrinks to a small icon, or just a coloured bar when it is only a frame or two, so it never covers its neighbour. Rest the mouse on it for its name, or zoom in the timeline. Tab reaches each clip; **Enter** picks it and **F2** renames it.
- **Double-click** to rename it. Right-click for more: which way it plays, how often it repeats, delete.
- **Plays** and **Repeat** are saved with the clip: forward, backward or [back and forth](help:timeline-clip-play), and forever (a run cycle), once (a jump) or a number of times. A game engine reads them too.

> Frames in your animation that are not in any clip still play and still export. Clips just give them names.

When you export a sprite sheet or a game animation file, each clip becomes its own animation. Clips belong to the main scene, so they are hidden inside an open symbol: see [markers](help:timeline-markers).`,
  'timeline-clip-play': `A [clip](help:timeline-clips) can play three ways, and repeat as often as you like. Say it once on the clip and the timeline, your sprite sheets and your game animations all follow.

## Setting it

Click the clip in the clips row: its settings open in **Properties**, under **Clip**. Right-click gives the same choices as a menu. Resting the mouse on a clip tells you how it plays.

With Preview in front, a click leaves it there and offers **Show Clip settings**.

- **Plays:** **Forward**, **Backward** (reverse), **Back and forth** or **Back and forth, backward first** (it starts from the last frame).
- **Repeat:** **Forever** (it loops), **Once** (it stops and holds its last frame) or a number of **times**. Type the number in the box and press Enter. For back and forth, each direction counts as one (see below).

The clip shows a small sign for what it does: the loop arrows, back and forth arrows, or a backward arrow with the count.

## Back and forth

It plays to the end and then back again. Each end shows once per turn, so nothing stutters. Great for breathing, swinging and floating.

With back and forth, **each direction counts as one**, the same as in Aseprite. Take a clip of 4 frames:

- **Repeat 1** is there only: 1 2 3 4, and it holds the last frame.
- **Repeat 2** is there and back: 1 2 3 4 3 2 1.
- **Repeat 3** is there, back, there: 1 2 3 4 3 2 1 2 3 4.

**Forever** goes there and back for ever.

## Playing it

Pick the clip and press play. It plays the way you set it, so you see what a game will. The **Play back and forth** button in the timeline bar works for any clip with no direction of its own.

## In exports

- **Sprite sheets** (Godot, Unity, Phaser, PixiJS, CSS, JSON): each clip lists its frames in the order it plays. Phaser and CSS use their own repeat count for a forward clip that plays several times. Looping clips loop; the others hold their last frame.
- **GIF, APNG, video, Lottie and dotLottie:** exporting one clip bakes the order in.
- **PNG sequence, PDF and Illustrator pages:** these show each frame once, in the order the clip starts (a back and forth clip comes out 1 2 3 4, not 1 2 3 4 3 2 1), however often it repeats.
- **Back and forth in Godot and Phaser:** a back and forth clip that loops can use the game engine's own back and forth loop instead of listing every frame, which makes smaller files. In Godot the two end frames then show twice; Phaser plays it the same. Change it in **Preferences > Behaviour**, under *Back-and-forth clips in game engines*. Everything else always lists the frames.
${ix('- **Interactives** has its own forward, loop or once, so a clip that plays another way is written out in order there.\n')}
A clip with nothing set plays forward.`,
  'timeline-markers': `A **marker** is a little flag on one frame with a name. It doesn't change what you see. It tells a game${ix(' (or Interactives)')} *when* something should happen: play the footstep sound, flash the screen, spawn a puff of dust.

## Adding one

- **Double-click** in the markers row (the thin row under the numbers) at the frame you want.
- Or use **Add a marker here** from the command palette, to drop one on the current frame.

Type a name, like *footstep*, and press Enter.

## Changing one

- **Double-click** a marker to rename it.
- **Drag** it to move it to another frame.
- **Right-click** it to delete it.

Markers come out in exports as events.

Good to know: markers and clips belong to the main scene, so inside an open [symbol](help:symbols) their rows give way to a note and nothing can be added there. A marker made from inside would land on the scene at the symbol's own frame number and fire at the wrong moment. Go back out of the symbol to use them. To name frames inside a symbol (a mouth shape, say), see [lip sync](help:lip-sync).`,
  'reference-layers': `Some layers are only there to help you draw: the ground a character stands on, a rough sketch, a grid of where the feet go. Make it a **reference layer** and you still see it on the canvas, but videos, pictures, SVGs and sprite sheets all leave it out.

## Make one

Click the **⋯** button on a layer (or right-click it) and choose **Reference layer (leave out of exports)**. You can also find it in the command palette.

A reference layer's name turns *italic* with a small **ref** tag. Choose **Export this layer again** from the same menu to undo it.

## Good to know

- Hiding a layer (the eye) also keeps it out of exports, but then you can't see it either. A reference layer stays visible.
- The game hero template's **Ground** is a reference layer, so its sprite sheets come out with just the character and its shadow.`,
};
