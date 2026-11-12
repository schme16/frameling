// The words of the help topics in merge-mode.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'merge-drawing': `Each vector layer has a **Merge shapes together** switch at the top of the tool options, and **J** flips it.

**Off** (object drawing) is how layers start. Every line and shape stays on its own. You can click it later, move it, and everything under it is still there.

**On** (merge drawing) works like paint:
- Draw over the **same colour** and the two join into one shape.
- Draw a **different colour** on top and it cuts away what's underneath. Move it off again and there's a hole.
- A line drawn **across** a filled shape splits it, so the paint bucket and Select work on each side by itself.
- The **eraser** rubs out just the area under it, not whole lines.
- With Select, **drag a box** over part of a shape to pick just that part. Drag it away and it lifts out, leaving a hole.

**Protect a shape** with **Group** (Ctrl+G). Grouped shapes never merge or get cut, and select as one. **Ungroup** (Ctrl+Shift+G) unties them.

**Break apart** (Ctrl+B) does the opposite: it turns the selection into plain painted areas, which merge with the drawing on a merge layer.

Every merge is one step, so Undo puts things back exactly. New layers start as **Keep separate**. To change that, see Preferences > Behaviour.`,
};
