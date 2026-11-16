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
- On a drawing layer, the Brush's **Chalk** and **Charcoal** tips catch on the same paper, and stay lines you can reshape. See [Brush tips](help:brush-tips).`,
  paper: `**Paper** is what chalk, charcoal and grainy brushes catch on. Your sheet has one paper, so a charcoal sketch and a speckled pixel brush meet the same bumps, the way they would on a real page.

**Where the Paper box is:** the options of [Chalk and charcoal](help:chalk-charcoal), the [Pixel brush](help:pixel-brush-texture) once **Catch on paper** is on, and the Brush when its Tip is **Chalk** or **Charcoal**, under the **Stick** picker (see [Brush tips](help:brush-tips)). In the pixel brush and the Brush the box carries the **Catch on paper** switch, so you can turn paper on from it. It is the same box every time, and the top right of it says which paper you are on, like **Rough, the sheet's**. Tools that never touch paper don't have it.

**Change the paper:** pick **Smooth**, **Fine**, **Medium**, **Laid** or **Rough**. It changes for every tool that uses it. The new paper is for strokes you draw from now on; what is already drawn stays as it is.

**Give one brush its own paper:** in the Pixel brush, press **Keep this brush on Rough**. The box now says **This brush keeps its own paper**, and changing the sheet leaves the brush alone. **Use the sheet's paper** hands it back.

**Two papers, one question:** if you pick a paper while a brush keeps its own, Frameling asks once whether you mean just that brush or the whole sheet, then remembers. Using a brush you saved on another paper asks the same way: change the sheet to match, or keep yours. Both answers are in **Preferences > Behaviour**, and the message that says what happened has a **Change** button.

**Good to know:**
- Photoshop and Krita textures come in with no paper of their own, so they follow the sheet.
- A **Paper tooth** effect on a layer has its own paper in the [Effects](help:effects) panel, since an effect belongs to the layer.
- The commands **Chalk and charcoal paper: rough** and the others in the palette change the sheet too.`,
};
