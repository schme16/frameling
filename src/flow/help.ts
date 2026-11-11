import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'clip-flow',
    title: 'Clip flow: what plays after what (state machine)',
    section: 'Animating',
    media: 'clip-flow.png',
    summary: 'Say which clip plays first and what follows what, like idle until jump, then land, then idle again. Games and Interactives play it for you.',
    keywords: ['state machine', 'state graph', 'states', 'transitions', 'animation tree', 'animator', 'clips', 'trigger', 'idle', 'jump', 'Godot', 'Interactives'],
    body: `A character usually has a few [clips](help:timeline-clips): **idle**, **run**, **jump**, **land**. The **clip flow** says how they connect, so a game or Interactives knows what to play next. Game makers call this a *state machine*.

Open **View > Clip flow**. Every clip is a box.
- **Drag a box's dot** onto another box to draw an arrow: "after this, that".
- **Click an arrow** to choose when it happens:
  - **At the end**: when the first clip finishes. A looping clip finishes each time round.
  - **On a trigger**: when something fires a named trigger, like **jump** or **hit**. Games fire it from code; in Interactives it's a node.
- **Click a box** and press **Play this one first** to choose the starting clip (it gets a star).
- Drag boxes around to tidy up. **Remove this arrow** deletes one.
- **With the keyboard:** Tab to a box and press **Enter**, then pick a clip under **Then go to** to draw the arrow. Arrows can be reached with Tab too.

Arrows from a looping clip start out as triggers named after where they go, since a loop never ends on its own. Arrows from other clips start as **At the end**.

**Try it** plays the first clip on the canvas and follows the arrows as clips end. Buttons for the triggers you can fire from the clip that's playing appear next to it.

**Where it goes:**
- **Godot** exports add a \`-flow.json\` file and a small \`_flow.gd\` script. Put the script on the AnimatedSprite2D: it plays the first clip, moves on when clips end, and \`fire("jump")\` follows a trigger.
- **Export for Interactives** puts the flow in the package, so Interactives can play it.

Frameling's own play button still plays the whole timeline or the picked clip, so the flow never gets in the way while you animate.`,
  },
]);
