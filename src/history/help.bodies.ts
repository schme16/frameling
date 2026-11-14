// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  history: `The **History** panel is [Undo](help:undo) you can see: every step you have taken, newest at the top, each with its name ("Draw stroke", "Fill") and how long ago it happened. Going back twelve steps is one click instead of twelve key presses.

**Open it:** **Edit > History**, or press **Ctrl+K** and type "history". It lives on the right, with the other panels.

**Go back to a step:** click it. The drawing goes back to just after that step, and every step after it turns grey. The step you are at is highlighted.

**Changed your mind?** The grey steps are still there. Click one of them, or press **Redo** (**Ctrl+Shift+Z**), to go forward again. They only go when you draw something new from the step you went back to, because then your drawing has taken a different road.

**The first row, Start,** is how the drawing was before your first step. Click it to go all the way back.

**Keep a step as a version:** point at a row and press **Keep**. Frameling saves the drawing as it was at that step as a named version, without changing what you are looking at. It joins your other [versions](help:version-history) in **File > Versions...**, so you can come back to it tomorrow, after the history has moved on or Frameling has closed.

**Quick jumps from the keyboard:** **Ctrl+Alt+Z** goes back ten steps and **Ctrl+Alt+Shift+Z** goes forward ten. Both are in the command palette as **Go back 10 steps** and **Go forward 10 steps**.

**Good to know:**
- The list holds as many steps as **Preferences, General, Undo steps** allows. Older ones drop off the bottom, so Start is the oldest step still held.
- Dragging something is one step, however long you drag for.
- Opening a file, or starting a new one, begins a fresh list.
- While you edit something inside your drawing (a tile, say), the list shows the steps of that, and **Keep** waits until you are back out.

help:undo help:version-history`,
};
