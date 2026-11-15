// The words of the help topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'chalk-charcoal': `**Chalk and charcoal** is one tool for nine dry drawing things: vine charcoal, compressed charcoal, chalk, soft pastel, oil pastel, crayon, and three pencils. They work on **pixel layers**, and they draw the way the real ones do: the pigment catches on the bumps of the paper and skips the dips.

**Draw with it:** pick **Chalk and charcoal** from the **Pixel tools** (or press **Alt+Shift+T**), choose a **Medium** and a **Paper** in the options, pick a colour, and drag.

**Press lightly and you get specks. Press hard and the dips fill in.** That one thing is most of the look. With a pen, pressing harder does it for you. With a mouse, the **Pressure** slider is how hard you're pressing.

**The papers:** **Smooth**, **Fine**, **Medium**, **Laid** (a woven criss-cross, like a Seurat drawing) and **Rough**. The paper stays put on the page, so two strokes over each other catch the same bumps, and going over a place again builds it up the way it does on real paper.

**The media:**
- **Vine charcoal**: light and dusty, never quite black.
- **Compressed charcoal**: dense, goes to a rich black when you press.
- **Chalk**: dry and matte. Try a pale colour on dark paper.
- **Soft pastel**: rich colour that fills the grain fast.
- **Oil pastel**: waxy, nearly solid, only a little tooth showing.
- **Crayon**: wax that skips the dips in sharp flecks.
- **Sketch pencil**, **Soft pencil (6B)** and **Colour pencil**: fine tips that build up as you go over them.

Each medium remembers its own **Size**, **Pressure** and **Edge**.

**Rub it in, lift it out:** the [Smudge](help:soft-paint) tool blends it like a finger, and the **Soft eraser** lifts it like a putty rubber.

**Good to know:**
- It only works on pixel layers. Picking it on a vector layer takes you to a pixel one.
- On a layer with a [locked palette](help:palette-lock), or with **Pixel perfect** on if you chose to keep pixels crisp, the grain is made of whole pixels in your own colours, so nothing see-through or new is made. The options say so when it happens.
- It follows [mirror drawing](help:pixel-mirror).
- The Brush's **Chalk** and **Charcoal** tips on a vector layer are shapes with holes cut in them. They can't catch on paper like this can. See [Brush tips](help:brush-tips).`,
};
