// The words of the help topic in offset.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'offset-path': `Make a copy of a shape the same distance out, or in, all the way round. An outline round a character, a cut line, a second stroke inside a badge. In other programs it's called **offset path**.

**Try it:** pick a shape, then use the **Copy bigger or smaller...** button in the Select tool's options, or press **Ctrl+K** and type **offset**. It opens a small card: choose **Bigger** or **Smaller**, slide the **Distance**, and watch the copy on the stage before you commit. **Make the copy** does it as one step.

- **Bigger** puts the copy **behind** the original, so it reads as an edge round it. Recolour the copy for a sticker outline.
- **Smaller** puts the copy **in front**, so it reads as an inner line.
- **Round** corners keep the edge the same distance away everywhere. **Sharp** corners keep the points of a star or a box.

**It wears the original's look.** The copy has the same fill and outline, so recolour it afterwards. An open line gives you the strip it draws, grown or shrunk. A shape with a hole keeps the hole: bigger makes the hole smaller, and smaller makes it bigger.

**Good to know:**
- The first time you use it you're asked whether the original stays or is swapped for the copy. Change it any time in **Preferences > Behaviour**.
- A shape that would shrink away to nothing is left as it was, and you're told.
- Symbols, text and particles have no outline to copy, so they're left alone.
- The copy is an ordinary shape with curves, so **Edit points** works on it. **Undo** takes it back in one step.

See also [Join, cut out and overlap shapes](help:combine-shapes) and [Edit points](help:tool-points).`,
};
