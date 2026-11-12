// The words of the help topics in index.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'edit-in-frameling': `When you export for Interactives with **Include the editable drawing** ticked (it's on unless you turn it off), the **.flplay** file carries your Frameling drawing inside it. So you can always come back and change it.

## Change an animation that's already in Interactives

1. Choose **File > Open Interactives file...** and pick the .flplay. (In the desktop app you can also double-click a .flplay file.)
2. Frameling opens the drawing that's inside it.
3. Draw, re-time, add frames: anything you like.
4. Press **Save** (Ctrl+S). Frameling puts your changes back into the same .flplay, at the same size as before.

The first time you save, Frameling asks whether to **just update the Interactives file** or **also keep a .frameling file**. Either is fine; the drawing is safe inside the .flplay. You can change your answer in **Preferences > Behaviour**.

## Turn the updating off

**File > Update the Interactives file when saving** is ticked for drawings that came from a .flplay. Untick it to work on a copy without touching the Interactives file; Frameling remembers this for each drawing. **File > Update the Interactives file now** puts the changes in without saving anything else.

## If there's nothing to edit

A .flplay exported without the editable drawing only has the finished pictures, so Frameling can't open it for editing. Export it again from the original drawing with **Include the editable drawing** ticked.

## From Interactives

Other apps on your computer can ask Frameling to open a file with a **frameling://open?path=...** link (the desktop app sets this up when it's installed). That's how an "Edit in Frameling" button in Interactives can work.`,
};
