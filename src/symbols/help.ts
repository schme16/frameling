import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'symbols',
    order: 1,
    title: 'Symbols: drawings you can reuse',
    section: 'Symbols and motion',
    media: 'symbols.png',
    summary: 'Make a drawing once, then place it as many times as you like. Change it once and every copy changes.',
    keywords: ['symbol', 'library', 'reuse', 'instance', 'component', 'movie clip', 'graphic', 'convert to symbol', 'F8'],
    body: `A **symbol** is a drawing you can reuse. Each copy of it on the canvas (an *instance*) can have its own size, turn, fade and colour wash, but they all share one drawing. Fix a line inside the symbol and every copy is fixed.

**Make one:** select what you drew with the Select tool (V), then press **F8**, or pick **Draw > Make a reusable symbol**. Nothing selected? The whole drawing on this frame becomes the symbol.

**The Library** lists every symbol in your document (**View > Library**):
- **Drag** a symbol onto the canvas to place a copy, or press its **+** button to drop one in the middle.
- **Click its name** to rename it.
- The pencil opens it so you can [draw inside it](help:symbols-editing). The copy button makes a separate symbol you can change on its own.
- The bin deletes a symbol nothing uses. **Delete unused** tidies them all away.

**Symbols can move by themselves.** A symbol has its own timeline, so a flapping wing or a blinking eye can be one symbol that loops wherever you put it. See [Symbol and motion](help:symbol-properties) for how each copy plays.

Symbols can go inside other symbols, as deep as you like (just never inside themselves). They are what [in-betweens](help:tweens) move.`,
  },
  {
    id: 'symbols-editing',
    title: 'Drawing inside a symbol',
    section: 'Symbols and motion',
    media: 'symbols-editing.png',
    summary: 'Double-click a symbol to open it and draw inside. The rest of the scene stays in view, faded.',
    keywords: ['edit symbol', 'edit in place', 'enter symbol', 'breadcrumb', 'back to scene', 'F9', 'double-click'],
    body: `**Double-click** a symbol on the canvas with the Select tool (or press **F9**) to open it. The rest of the scene fades back so you can see where it sits, and the timeline shows the symbol's own frames and layers.

Draw, add layers and add frames just as you would on the main stage. Every copy of the symbol changes with you.

The bar at the top of the canvas shows where you are, like **Scene › Bird › Wing**. Click any name to go back to it, or press **Done**. You can also double-click an empty spot, or press **Shift+F9**, to go back out one level.

Undo works as usual. Going into and out of a symbol are steps too, so undoing far enough takes you back out.`,
  },
  {
    id: 'symbol-properties',
    title: 'Symbol and motion panel',
    section: 'Symbols and motion',
    media: 'symbol-properties.png',
    summary: "Change a symbol copy's place, size, turn, fade, colour wash and how it plays its own animation, plus the in-betweens on this key.",
    keywords: ['properties', 'inspector', 'transform', 'scale', 'rotate', 'skew', 'opacity', 'alpha', 'tint', 'swap symbol', 'loop', 'play once', 'single frame', 'first frame'],
    body: `Select a symbol on the canvas and open **View > Symbol and motion**.

**Shows** picks which symbol this copy is. Swapping keeps its place, size and turn, which is handy for mouth shapes or hand poses.

**X, Y, Width, Height, Turn and Slant** place it exactly. (The industry words are position, scale, rotation and skew.) You can also drag it, its corners and its round handle on the canvas.

**See-through** fades the whole copy, and **Colour wash** tints it any colour (opacity and tint). Both can change smoothly with [in-betweens](help:tweens), so a copy can fade in or flash red.

**Its own animation**, for symbols with more than one frame:
- **Loop** plays round and round.
- **Play once** plays to the end, then holds the last frame.
- **One frame** shows just one frame, picked with **Frame**. Great for a symbol that holds a set of poses.

**Starts on** picks which of its frames it begins with, so a crowd of copies don't all blink at once.

Below that are the [in-betweens](help:tweens) for the key under the playhead.`,
  },
  {
    id: 'tween-offer',
    order: 2.5,
    title: 'Fill the gap with one click (tween offer)',
    section: 'Symbols and motion',
    media: 'tween-offer.png',
    summary: 'Click a frame between two drawings and Frameling offers to fill the gap with in-betweens: Move or Morph.',
    keywords: ['tween offer', 'offer', 'suggestion', 'click a frame', 'quick tween'],
    body: `Click a frame in the timeline that sits between two drawings (held frames, or empty frames with a drawing after them), and a small **In-betweens?** offer appears on that stretch.

- **Move** glides, grows, turns or fades the drawing from one key to the next (a classic tween). A plain drawing becomes a [symbol](help:symbols) first.
- **Morph** melts one drawing's shapes into the next (a [shape tween](help:shape-tweens)). It's offered when both drawings are plain shapes.
- **x** (or **Esc**) says no thanks. It won't offer again on that stretch until something on the layer changes.

Either way it's one step, so **Ctrl+Z** takes it straight back. You can reach the buttons with **Tab**.

It never shows while playing, scrubbing or dragging, and it goes away by itself when you move to another frame or start playing.

Don't want it? Turn it off in **Preferences > Behaviour > Offer in-betweens between keys**. You can still use **Ctrl+Shift+T** or the right-click menu.`,
  },
  {
    id: 'tweens',
    order: 2,
    title: 'In-betweens (tweens)',
    section: 'Symbols and motion',
    media: 'tweens.mp4',
    summary: 'Pose a symbol on two keys and Frameling draws the frames in between: moving, growing, turning and fading.',
    keywords: ['tween', 'classic tween', 'motion tween', 'inbetween', 'interpolation', 'keyframe', 'Ctrl+Shift+T', 'move', 'glide'],
    body: `Drawing every frame by hand is lovely for squash and stretch, but when something just needs to **glide, grow, turn or fade**, let Frameling draw the frames in between. Animators call these *in-betweens*, or *tweens*.

1. Draw something. (A drawing that only lasts one frame gets held for about a second, so there is room to move. Drag the end of its cel in the timeline to change how long.)
2. Press **Ctrl+Shift+T** (or right-click the cel and choose **Make in-betweens**).
3. Frameling makes an end key and moves the playhead there. **Move, resize or turn** the drawing there.
4. Press play.

If the drawing wasn't a [symbol](help:symbols) yet, it becomes one, because in-betweens move symbols.

**Even quicker:** click a frame between two drawings in the timeline, and a little [In-betweens? offer](help:tween-offer) appears there. One click makes them.

In the timeline, in-betweens show as a purple band with an arrow from one key to the next. A dashed line means the keys have come apart, so nothing moves until they touch again.

What moves: position, size, turn, slant, see-through and colour wash. Choose how it speeds up and slows down with [easing](help:easing), or send it along a curve with a [path](help:motion-paths). **Extra spins** adds whole turns on the way.

While you're between two keys, the canvas and the selection box show the in-between. If you **drag, resize or turn** it there, Frameling asks the first time what you'd like:

- **Make a key here**: this frame becomes a key with your change, and the glide goes through it.
- **Change the key before**: the same move goes to the key where the glide starts.

Change your answer any time in **Preferences > Behaviour**. The numbers in the Properties panel always belong to the key where the glide starts (it says so while you're between keys).`,
  },
  {
    id: 'easing',
    order: 3,
    title: 'Easing: how in-betweens speed up and slow down',
    section: 'Symbols and motion',
    media: 'easing.png',
    summary: 'Gentle start, gentle stop, bouncy, springy, overshoot... or draw your own curve.',
    keywords: ['ease', 'easing', 'ease in', 'ease out', 'bounce', 'elastic', 'back', 'overshoot', 'curve', 'bezier', 'timing', 'spacing'],
    body: `Real things rarely move at one steady speed. **Easing** is how in-betweens speed up and slow down.

Pick one in the **Symbol and motion** panel, or from the command palette ("Easing: ..."):

| Name | What it does |
|---|---|
| **Steady** (linear) | The same speed all the way. Robotic, sometimes just right. |
| **Gentle start** (ease in) | Starts slowly and speeds up, like something falling. |
| **Gentle stop** (ease out) | Moves off quickly and slows down, like a sliding puck. |
| **Gentle start and stop** (ease in and out) | Slow at both ends. The natural choice for most moves, and what new in-betweens use. |
| **Wind up** (anticipation) | Pulls back a little before it goes. |
| **Overshoot** (back out) | Goes a bit too far, then settles back. |
| **Springy** (elastic) | Wobbles like a spring before it settles. |
| **Bouncy** (bounce) | Lands and bounces. |

**Your own curve:** drag the two yellow handles on the graph. Time runs left to right and the move runs bottom to top, so a steep part is fast and a flat part is slow. Handles above the top line make it overshoot. With a handle focused, the arrow keys nudge it.

On the canvas, the dots along the motion trail show one in-between each. Bunched-up dots are slow, spread-out dots are fast.`,
  },
  {
    id: 'one-click-motions',
    order: 4,
    title: 'One-click motions: bounce, wobble, float',
    section: 'Symbols and motion',
    media: 'one-click-motions.mp4',
    summary: 'Make something bounce, wobble, float, pop in, shake or fade in with one click. You get ordinary keys you can change.',
    keywords: ['motion preset', 'animate preset', 'preset', 'bounce', 'wobble', 'float', 'pop in', 'shake', 'fade in', 'one click', 'quick animation', 'effect'],
    body: `Want something to move without setting up every key? Pick a motion and Frameling does the keys for you.

**How**
1. Go to the frame where the motion should start.
2. Select what should move with the Select tool (V). Nothing selected moves the whole drawing on this frame.
3. Pick **Animate > One-click motions**, or right-click the frame in the timeline, or press **Ctrl+K** and type "make it".

**The motions**
- **Bounce**: crouches, hops up and lands with a squash, like a ball.
- **Wobble**: rocks side to side and settles, like jelly.
- **Float**: drifts gently up and back down. It loops smoothly.
- **Pop in**: springs up from small and clear, going a little too far before it settles (overshoot).
- **Shake**: shudders side to side, quick and getting smaller. Good for "no!" or a hit.
- **Fade in**: starts clear and fades up.

**What it makes**
Plain [keys with in-betweens](help:tweens), each with its own [easing](help:easing). Nothing is hidden: drag the keys to change the timing, move the drawing on any key to change a pose, or change an easing in the Symbol and motion panel. Every motion ends just as it started, so it loops, and you can add another one straight after it.

Shapes that aren't a [symbol](help:symbols) yet are made into one first, so they can move as one piece. **Ctrl+Z** undoes the whole motion in one go.

**Not enough room?** If the motion runs into the next drawing on the layer, Frameling asks the first time whether to make it quicker to fit or move the later drawings along, then remembers (Preferences > Behaviour).`,
  },
  {
    id: 'motion-paths',
    title: 'Paths to follow (motion paths)',
    section: 'Symbols and motion',
    media: 'motion-paths.png',
    summary: 'Make in-betweens travel along a line you draw, and turn to face along it if you like.',
    keywords: ['motion path', 'guide', 'guide layer', 'follow path', 'orient to path', 'curve', 'trajectory'],
    body: `Out of the box, in-betweens move in a straight line. To send them along a curve:

1. Go to a frame with in-betweens.
2. In **Symbol and motion**, press **Draw a path** (or choose **Animate > Draw a path to follow**).
3. Drag the route on the canvas. That's it: press play.

The path keeps its shape, and bends just enough that it still starts and ends exactly where your two keys are. So you can move either key afterwards and the path follows along.

Turn on **Turn to face along the path** for things that should point where they're going: a paper plane, a fish, a car on a road.

Already drew the line with the brush or pencil? Select it and choose **Follow the selected line**. The line becomes the path and leaves the drawing.

**Straight line again** removes the path.`,
  },
  {
    id: 'shape-tweens',
    title: 'Morph between shapes (shape tweens)',
    section: 'Symbols and motion',
    media: 'shape-tweens.mp4',
    summary: "Draw one shape on a key and a different one on the next, and Frameling melts the first into the second: outlines, colours and line widths.",
    keywords: ['shape tween', 'morph', 'blend', 'metamorphosis', 'transform shape', 'Ctrl+Shift+M', 'inbetween'],
    body: `**Morphing** turns one drawing into another: a square into a circle, a closed eye into an open one, a puddle into a splash. Animators call it a *shape tween*.

1. Draw the first shape and hold it for a few frames.
2. Press **Ctrl+Shift+M** (or **Animate > Morph between shapes**, or **Morph between shapes** in the **Symbol and motion** panel).
3. Frameling makes an end key and takes you there. Change the drawing: reshape it, recolour it, or rub it out and draw something new.
4. Press play.

What melts: outlines and holes, fill colours (and see-through), line colours and widths, and brush strokes. Shapes pair up in the order you drew them. A shape with no partner shrinks away (or grows in from nothing), so a different number of pieces still works.

Text and particles come along too. A piece of text moves, turns, resizes and changes colour into the text on the next key, and a particle emitter slides to its new spot and changes its speed, direction, size and colours while it keeps playing (the particles don't restart). Text pairs with text and emitters with emitters, in order, and one with no partner fades out or in. Different words or a different font crossfade, and an emitter keeps the first key's count, lifetime and sprite. The panel says so when that happens.

Shapes stay plain shapes. Symbols on the same key glide like ordinary [in-betweens](help:tweens). Easing, extra spins and paths work as usual.

**Move or Morph:** the **How it changes** switch in the panel flips any in-betweens between the two. The first time you make in-betweens on a plain drawing, Frameling asks which you'd like (change it later in **Preferences > Behaviour**).

If the morph twists, crumples or turns inside out, add [shape hints](help:shape-hints).`,
  },
  {
    id: 'shape-hints',
    title: 'Shape hints: fixing a twisty morph',
    section: 'Symbols and motion',
    media: 'shape-hints.png',
    summary: 'Pin a point of the first drawing to a point of the last one with lettered markers, so a morph goes the way you mean.',
    keywords: ['shape hint', 'hints', 'morph', 'shape tween', 'twist', 'match points', 'correspondence'],
    body: `Frameling matches the two outlines of a [morph](help:shape-tweens) by itself, picking the shortest way for every point. When that isn't what you meant (a face turns inside out, a letter twists), **shape hints** tell it which point goes where.

1. Put the playhead on the morph's **first key** and choose **Add shape hints** in the **Symbol and motion** panel (the **Shape hints** tool).
2. Click on the outline where a point should start. A gold marker **a** appears. Add more: **b**, **c**...
3. Press **Place them on the last key**. The same letters show there in mint green. Drag each one to where that point should end up.
4. Play it. The outline between two hints is matched on its own, so each stretch goes where you said.

Tips:
- Go round the shape in the same direction on both keys (a, b, c clockwise on both). Hints that cross over each other are left out.
- Two or three hints usually do it. Put them on corners and tips.
- **Alt-click** a marker to remove it, or **Remove all hints** in the panel.`,
  },
]);
