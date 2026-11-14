// The words of the help topic in align-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'align-space-out': `Five icons that should sit on one line, a title that should be in the middle of the page, three buttons that should be the same distance apart: pick the shapes and press a button. It is one undo step.

**Line things up:** pick two or more shapes with the Select tool, then open **Align and space out** in the Properties panel (or **Edit > Align and space out**, or the command palette).
- **Align left**, **Align centre** and **Align right** line them up side to side.
- **Align top**, **Align middle** and **Align bottom** line them up up and down.

**What they line up to:** the box round everything you picked, so the leftmost shape stays where it is and the rest join it. Switch **Line up to** to **The page** to use the edges and middle of the page instead. Frameling remembers which you chose.

**One shape on its own** has nothing to line up with, so it lines up to the page: pick a title, press **Align centre**, and it sits in the middle.

**Space out evenly:** pick three or more shapes and press **Space out across** (left to right) or **Space out down**. The two at the ends stay where they are, and the ones between share out the room so every gap is the same. The gaps are measured edge to edge, so a wide shape and a thin one still look evenly spaced.
- Type a number in **Gap** first to set the gap exactly. The first shape stays, and each one after it sits that far from the one before. Leave it empty for the even share.

**Good to know:**
- It works on shapes, symbols and text. Pixel selections line up to the page too (whole pixels, nothing blended); spacing out needs separate shapes.
- A shape you have already lined up is left alone, and Frameling says so instead of making an empty undo step.
- If you are in the middle of a [Transform](help:transform) box, it lands first, then the shapes line up.

See also [Exact position and size](help:selection-numbers).`,
};
