// The words of the help topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'pixel-brush': `The **Pixel brush** draws a line as a row of **dabs**: one small stamp after another along the way you drag. You shape the stamp (its **tip**), how far apart the stamps go (the **spacing**), and whether they wander off the line (**scatter**). It works on **pixel layers**, and it is the quickest way to a pencil, a chunky marker, a chisel, a dotted line or a trail of stars.

**Draw with it:** pick the **Pixel brush** (**Alt+Shift+N**), choose a colour and drag. Or open the [brush picker](help:brush-picker) at the top of its options and pick one that comes ready.

**The things you reach for:**
- **Tip:** **Round**, **Square**, or **Picture**. A picture tip is a little drawing of your own. Select some pixels (up to 32 by 32) and press **Make from the selection**. Its own colours are kept, or it paints in the colour you picked.
- **Size:** how many pixels across. A picture goes down pixel for pixel when it is the size it was drawn.
- **Spacing:** how far apart the dabs go, as a share of the size. Low is a smooth solid line. 100% puts them side by side. More leaves gaps, like a dotted line. This one setting does most of what makes a brush feel like a brush.
- **Edges:** **Sharp pixels** or **Smooth**. Sharp is the pixel art way: no anti-aliasing, every pixel is all or nothing. Smooth fades the edge with see-through pixels, like a painting program.
- **Hardness:** how firm the edge is. With sharp pixels a soft edge becomes a pattern of dots.

**Under Shape, scatter and flow:**
- **Angle** and **Roundness** turn and flatten the tip. A flat square at an angle is a chisel.
- **Turn with the line** points the tip the way you are drawing.
- **Scatter** lets each dab land away from the line. **Size jitter** and **Angle jitter** vary each dab a little.
- **Flow** is how much paint one dab lays down. **Opacity** is the most any pixel can get in one stroke. Flow is how fast it builds up, opacity is where it stops.

**Keep your brushes:** press **Save as...** in the picker to keep this brush under a name. The same picker holds pixel brushes for the soft paint tools and chalk and charcoal, so one place has them all. See [saved brushes](help:brush-presets).

**Pixel art stays pixel art.** With sharp pixels nothing is ever see-through. If the layer has its [palette locked](help:palette-lock), a smooth edge is dithered into colours you already have, and the options say so.

**Good to know:**
- A low flow or opacity with sharp pixels becomes a pattern of dots, never a new colour.
- It follows [mirror drawing](help:pixel-mirror), and a pen's pressure makes it bigger or denser.

For soft fades try [soft paint](help:soft-paint); for paper grain, [chalk and charcoal](help:chalk-charcoal).`,
};
