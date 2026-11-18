// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'clone-stamp': `The **Clone stamp** copies one part of your picture onto another as you paint. You choose a spot to copy **from**, then paint where you want the copy to **go**, and the spot you chose follows your hand. It is how you cover a stray mark, mend a gap, or grow more of a pattern. It works on **pixel layers**.

**Use it:** pick the **Clone stamp** from the **Retouch** button's pull-out (**Alt+Shift+S**). **Alt-click** the part of the picture you want to copy (or **Ctrl-click**; or hold the pointer there and use **Clone stamp: copy from the spot under the pointer**). Then paint where the copy should go. A cross marks the spot you chose, and a dashed ring shows where the copy is coming from as you move. Your first click does the choosing if you have not.

**Copy from:** **This layer** copies only what is on the layer you paint on, so a clone never brings in the colours of the layer below your line art. **Everything you see** copies the picture as it looks, every layer together, and paints the copy onto this layer.

**When you lift the pen:** you are asked once, after your first stroke, and your answer is remembered.
- **Carry on** (called *aligned* elsewhere): the copy keeps the same gap from your hand, so the next stroke carries on where the last one stopped. Best for covering a big area in several goes.
- **Start again** (*non-aligned*): every stroke begins by copying the spot you chose. Best for stamping the same patch over and over.
Change it any time in the options, or in **Preferences > Behaviour**.

**It is a brush:** size, hardness, spacing, flow and opacity work as on the [pixel brush](help:pixel-brush), and so do pen pressure and the other [dynamics](help:pixel-brush-dynamics). A selection keeps the copy inside it, and one stroke is one undo.

**Good to know:**
- The copy is of the picture as it was before the stroke, so painting over your own source never smears.
- Copying from a clear patch paints clear, so a clone can also remove things. That is a feature, not a bug.
- A layer with a [locked palette](help:palette-lock) stays on its palette: soft edges turn into a pattern of dots.

See also [blur and sharpen brushes](help:blur-sharpen-brush).`,
  'blur-sharpen-brush': `The **Blur brush** and the **Sharpen brush** retouch just the part of the picture you paint over, instead of the whole layer. Blur softens a hard edge, Sharpen crisps up a soft one. They are dab brushes, so you get the same spacing, hardness, flow and pen settings as the [pixel brush](help:pixel-brush). They work on **pixel layers**.

**Soften an edge:** pick the **Blur brush** (**Alt+Shift+U**) and paint along it. Go over a spot again to soften it more; each stroke blurs what the last one left.

**Crisp one up:** pick the **Sharpen brush** (**Alt+Shift+Y**) and paint over a soft edge. Sharpen pushes each pixel away from the average of its neighbours, so edges get a bit of extra snap.

**The settings:**
- **Amount:** how far a blur spreads (from a gentle smear to very soft), or how hard a sharpen pushes.
- **Size** and **Hardness:** how big the brush is, and how firmly its edge cuts off. A soft edge blends the retouch in.
- **Pen, speed and fade:** by default a pen presses harder for more. A mouse paints at full strength. Change what drives what here, like on any dab brush.

**Good to know:**
- A selection keeps the blur or sharpen inside it.
- Blur treats see-through properly: it softens the edge of a shape instead of dragging a dark fringe into it.
- Over-sharpening makes bright halos. Use a low amount and go over it again.
- To blur a whole layer at once, use the [Blur effect](help:effects).

See also the [clone stamp](help:clone-stamp).`,
};
