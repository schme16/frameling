// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'brush-presets': `A **saved brush** is the brush you like, kept under a name. Ink for outlines, a soft marker for shading, a thin pencil for sketching: one click to swap, instead of moving four sliders back and forth.

**Pick one:** choose the **Brush** tool (**B**). The row at the top of its options has your saved brushes. Click one and the size, smoothing, pressure and pointy ends all change at once. The dot beside each name is as big as the brush.

**Ready to use:** **Ink**, **Marker**, **Pencil** and **Tapered brush** come with Frameling. They never change, so you can't spoil them.

**Save your own:**
1. Set the brush how you like it.
2. Press **Save as...** (or **Ctrl+K** and type "save this brush").
3. Give it a name and press **Enter**.

**Changed it afterwards?** A small dot on the brush's name says you've moved a slider since you picked it. Press **Update** to keep the change in that brush, or **Revert** to go back to how it was saved. Your brush in the options always shows what you are drawing with, whatever the saved one says.

**Rather it saved every change by itself?** Open **Preferences, Behaviour** and set **Changing a saved brush** to **Yes, save every change**.

**Rename or delete:** pick one of yours, then press **Rename** or **Delete**. Delete has an **Undo** on the message that appears.

**From the keyboard:** **Alt+Down** moves to the next brush and **Alt+Up** to the one before. In the command palette, every brush has a command called **Brush: Ink** and so on, which also switches to the Brush tool for you.

**Share them:** open **Share your brushes** under the row. **Save as a file** and **Copy as text** make something you can send a friend (or a plugin). **Add from a file...** and **Paste from text** add ones you were sent, under new names if yours clash. The starters aren't included, because everyone has them. Your saved brushes also go in the settings backup in **Preferences, General**.

**Good to know:**
- A saved brush holds the size, smoothing, pressure, pointy ends and end caps. The colour, the mirror and your pen curves stay as they are.
- Saving under a name you already used replaces that brush.
- You can keep up to 100 of your own.
- Pixel layers use the pixel brush, which has its own size and shape.

help:tool-options help:remembered-settings help:pen-tablet`,
};
