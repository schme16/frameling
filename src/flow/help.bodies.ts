// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
import { ix } from '../features/flags';
export const bodies: Record<string, string> = {
  'clip-flow': `A character usually has a few [clips](help:timeline-clips): **idle**, **run**, **jump**, **land**. The **clip flow** says how they connect, so a game${ix(' or Interactives')} knows what to play next. Game makers call this a *state machine*.

Open **Frames and motion > Clips and clip flow > Clip flow (state machine)...**. Every clip is a box.
- **Drag a box's dot** onto another box to draw an arrow: "after this, that".
- **Click an arrow** to choose when it happens:
  - **At the end**: when the first clip finishes. A looping clip finishes each time round.
  - **On a trigger**: when something fires a named trigger, like **jump** or **hit**. Games fire it from code${ix("; in Interactives it's a node")}.
- **Click a box** and press **Play this one first** to choose the starting clip (it gets a star).
- Drag boxes around to tidy up. **Remove this arrow** deletes one.
- **With the keyboard:** Tab to a box and press **Enter**, then pick a clip under **Then go to** to draw the arrow. Arrows can be reached with Tab too.

Arrows from a looping clip start out as triggers named after where they go, since a loop never ends on its own. Arrows from other clips start as **At the end**.

**Try it** plays the first clip on the canvas and follows the arrows as clips end. Buttons for the triggers you can fire from the clip that's playing appear next to it.

**Where it goes:**
- **Godot** exports add a \`-flow.json\` file and a small \`_flow.gd\` script. Put the script on the AnimatedSprite2D: it plays the first clip, moves on when clips end, and \`fire("jump")\` follows a trigger.
${ix('- **Export for Interactives** puts the flow in the package, so Interactives can play it.\n')}
**Reacting to the game:** arrows can also check [inputs](help:clip-flow-inputs), like speed or health, and a hurt clip can play from any clip.

Frameling's own play button still plays the whole timeline or the picked clip, so the flow never gets in the way while you animate.`,
  'clip-flow-inputs': `**Inputs** are values your game sets while it plays: **speed**, **grounded**, **health**. Arrows in the [clip flow](help:clip-flow) can check them, so a character reacts instead of just following a script. Game makers call these *parameters* and *conditions*.

**Add an input:** in the Clip flow panel, under **Inputs**, press **Add on/off** (a switch, like grounded) or **Add number** (like speed). Give it a name. It also sits in the command palette as **Add a clip flow input**.

**Check it on an arrow:** click an arrow, press **Add a check**, and pick the input and what to compare it with: *speed is above 0.5*, *grounded is on*. Every check has to hold for the arrow to go.
- **As soon as** goes the moment its checks hold. Idle to run when speed is above 0.5.
- **At the end** and **On a trigger** wait for their moment, then also need their checks. Jump on a trigger, but only if grounded is on.

**Play a clip from any clip:** pick a clip, press **Play this from any clip** (or use the command of the same name). An **Any clip** box appears, and its arrow works whichever clip is playing. That's how hurt cuts in on run, jump or idle. An Any clip arrow skips itself while its own clip is already playing, so a check that stays true doesn't restart it.

If an Any clip arrow and a clip's own arrow are ready together, Frameling asks once which goes first, then remembers (**Preferences > Behaviour**). Click the Any clip box to change it for one file.

**Fade between clips:** click an arrow and set **Fade (seconds)**. 0 is a straight cut.

**Try it** shows a switch or a number box for every input, so you can change speed and watch the clip change. Try it cuts rather than fades.

**Where it goes:**
- **Godot** gets all of it in the flow script: \`set_flow_input("speed", 0.7)\` sets an input, and \`fire("jump")\` still works. Godot sprites can't mix two clips, so a fade is a cross fade from a still copy of the old clip.
${ix("- **Export for Interactives** writes the inputs, checks, Any clip arrows and fades into the package. Frameling can't see what your version of Interactives does with them.\n")}- Other exports have no clip flow. The Export window says so when your flow uses any of this.

**Good to know:** an arrow that checks an input you've since removed never goes, and the panel and the Export window both say so. Renaming an input renames it in every check.`,
};
