// The words of the help topic in shapeBuilder.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'tool-shape-builder': `Draw two circles that cross and you get three bits: the lens where they overlap, and a crescent either side. The **Shape builder** lets you make shapes out of those bits by dragging across them: a snowman from three circles, a cloud from a handful, a leaf from the lens of two.

**Join bits:** press **Shift+N** (or **Ctrl+K** and type **shape builder**), then drag across the bits you want as one shape. Each bit lights up as you reach it, and when you let go they become one shape. Click a single bit to pull it out as a shape of its own.

**Take bits away:** hold **Alt** and drag across the bits you want gone. They light up in red with stripes, so you can see what is about to go before you let go. Some desktops keep Alt+drag for moving the window, so **Shift** does the same thing.

**Change what a plain drag does:** in the tool options, **Dragging across** can be **Joins them** or **Takes them away**. Alt and Shift flip it for one drag. It is handy on a pen with no keys.

**Which shapes it works on:** pick two or more first and it works on just those. Pick nothing and it works on the shapes around the bit you point at.

**What colour the new shape is:** if the bits you joined have different colours, you're asked once. **The bit you started on** lets the drag decide, so start on the colour you want. **The bottom shape** matches **Join** (see [Join, cut out and overlap shapes](help:combine-shapes)). It is in Preferences > Behaviour, and the options below the rail too.

**Good to know:**
- Nothing changes until you let go, and **Undo** takes the whole drag back in one step.
- The bits you didn't touch stay as shapes of their own, each in the colours it had on show, so the picture looks the same.
- A shape that overlaps nothing is left exactly as it was.
- Groups come apart, and symbols, text and particles are left alone.
- Up to 40 shapes at a time. If more lie around, pick the ones you want first.`,
};
