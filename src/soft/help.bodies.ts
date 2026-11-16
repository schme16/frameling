// The words of the help topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'soft-paint': `**Soft paint** is five tools whose edges fade out instead of stopping: the **Soft brush**, the **Airbrush**, the **Highlighter**, the **Soft eraser** and **Smudge**. They work on **pixel layers**. A vector shape can't hold a fading edge, so on a vector layer they wait out of sight, and picking one takes you to a pixel layer.

**Paint with them:** pick a tool from the **Pixel tools** (or press its key), choose a colour, and drag.

- **Soft brush** (**Shift+F**): a round brush that fades at the edge. **Hardness** sets how much of it is solid before the fade starts.
- **Airbrush** (**Alt+Shift+A**): soft colour that builds up. Go slowly, or hold still, and it gets denser.
- **Highlighter** (**Shift+J**): colour that goes over your lines without hiding them, like a marker over print. Dark lines stay dark and show through.
- **Soft eraser** (**Alt+Shift+R**): rubs out with a fading edge, so what is left fades away instead of ending in a cut.
- **Smudge** (**Shift+Z**): press where the colour is and drag. It pushes that colour along, like a finger in wet paint.

**The options:**
- **Size** is how many pixels across.
- **Hardness** is how firm the edge is. Zero is soft all the way in.
- **Flow** (or **Strength**) is how much one stroke lays down. A low flow is light, and goes darker when you stroke over it again.
- With a pen, pressing harder makes the mark bigger and denser (see **Pen and tablet**).

**Pixel art stays pixel art.** A soft edge is made of see-through pixels, which a pixel-art layer shouldn't have. So when the layer has its [palette locked](help:palette-lock), the soft edge is dithered instead: a pattern of dots in your own colours, and nothing new. The options say so when it happens. With **Pixel perfect** on, Frameling asks once which you'd like, then remembers. You can change that any time in **Preferences, Behaviour**.

**Good to know:**
- Smudge moves whole pixels around on a locked or Pixel perfect layer, rather than blending them.
- Smudge doesn't follow [mirror drawing](help:pixel-mirror). The others do.
- The highlighter on a locked palette picks the nearest palette colour, since mixing two colours makes a new one.

For a sprinkle of single pixels, try the [Spray](help:tool-spray). For a firm hard-edged brush, the Pencil.`,
};
