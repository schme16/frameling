// The words of the help topic in edge.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'selection-edge': `Change how far a selection reaches, or fade its edge so what you paste, fill or delete blends in instead of looking cut out.

**Try it:** select something, then press **Ctrl+Alt+F** (or **Ctrl+K** and type **feather**). A small card opens: pick **Grow**, **Shrink** or **Feather**, slide the **Amount** and watch the edge change before you press the button.

- **Grow** pushes the edge out, so a bit more is picked all the way round. Good for catching the dark fringe round a cut-out (it is called *expand* in other programs).
- **Shrink** pulls the edge in, so a bit less is picked. Good for leaving a border (*contract*).
- **Feather** fades the edge over about twice the amount, centred on where the edge was. Paint, fill, **Delete**, **Copy** and **Cut** all fade out along it. Paste it and it has no hard cut.

**Right under your hand:** **Edit > Grow, soften and save selection** has **Grow**, **Shrink** and **Feather** as plain commands that use the last amount you picked, so a second press needs no card.

**On shapes:** the picked shapes are what is selected, so **Grow** and **Shrink** make each shape a bit bigger or smaller all the way round (the same maths as [Copy a shape a bit bigger or smaller](help:offset-path), but it changes the shapes instead of copying them), and **Feather** gives them a **Soften** effect of that size.

**Good to know:**
- On pixels, the dashed edge sits where the selection is half in. The blue fringe on the stage shows how far the fade goes.
- Grow and Shrink make the edge sharp again, so feather last.
- A selection that runs to the edge of the drawing doesn't fade or shrink away from that edge.
- Moving, inverting, adding to and taking from a feathered selection all keep the fade. Turning or flipping the selected pixels makes the edge sharp again.

Next: [Saved selections](help:saved-selections), [Selecting pixels](help:pixel-select).`,
  'saved-selections': `Give a selection a name and bring it back whenever you like: a character's hair, the sky, the three shapes you keep picking. They're saved in the file, so they're still there tomorrow.

**Save one:** select something, then **Edit > Grow, soften and save selection > Save the selection...** (or press **Ctrl+K** and type **save selection**). Type a name, or leave it and Frameling names it for you, and press **Save what is selected**.

**Bring one back:** **Edit > Grow, soften and save selection > Saved selections...** lists every one in the document.
- **Bring back** puts it in place of what is selected now.
- **Add** joins it to what is selected now.
- **Take away** cuts it out of what is selected now.
- **Rename** and **Delete** do what they say.

**On pixels** it keeps exactly which pixels were picked, soft edge and all, so a feathered selection comes back feathered. **On shapes** it keeps which shapes were picked; if one has since been deleted, the rest come back and Frameling says so.

**Good to know:**
- A pixel selection brought back on a drawing of a different size sits at the top left of it, and Frameling tells you.
- Saving and deleting one is a step you can undo.
- A document keeps up to 60 of them.

Next: [Grow, shrink and feather a selection](help:selection-edge), [Selecting pixels](help:pixel-select).`,
};
