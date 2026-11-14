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
  'export-interactives': `Interactives builds clickable pages for courses. A Frameling animation can live on one of those pages as its own layer, and the page can play it, stop it, or wait for a moment in it.

## In Frameling

1. Name your clips in the timeline (idle, wave, run...). Each one becomes something Interactives can play. Add **markers** for moments the page should react to (a footstep, the ball landing).
2. Press **Ctrl+E** and pick **Interactives**, or choose **File > Export > Export for Interactives**.
3. Pick the size. Pixel art starts at real size (**Art size**): Interactives scales it up itself and keeps every pixel sharp.
4. Press **Export** and save the \`.flplay\` file.

## In Interactives

1. Drag the \`.flplay\` file onto the canvas (or add it in **Assets** and press **Place**). It becomes a **Frameling animation** layer.
2. In the inspector, pick the **clip** to show, and whether it **plays** when the page starts.
3. To control it, use the nodes **Play a Frameling clip**, **Stop a Frameling animation** and **Show a Frameling frame**, and the events **When a Frameling clip ends** and **When a Frameling animation reaches a marker**. A timeline can also scrub its **Frameling frame**.

## What's in the file

- Every frame, with frames that look the same stored only once (a drawing held for 6 frames is one picture held for 6 frames).
- Your clips, with their loop settings, and your markers. Interactives plays a clip forward, looping or once, so a clip that plays [backward, back and forth or a set number of times](help:timeline-clip-play) is written out frame by frame in the order it plays, after the animation's own frames, and the clip points at that. It plays right in any Interactives. (An animation layer with no clip chosen plays every frame, written-out clips included, until Interactives learns to skip them; pick a clip to avoid that. A clip that would come to more than 5000 frames stays forward, and the Export dialog tells you which.) The settings also stay in the editable drawing inside the package.
- The frame rate, size, and whether it is pixel art.
- Your editable drawing too, unless you untick **Include the editable drawing**. Leave it in if you might change the animation later; take it out for the smallest file.

## Good to know

- Transparent background is on to start with, so the page shows through. Turn it off to keep your background colour.
- [Reference layers](help:reference-layers) are left out, like every export.
- Change the animation? Export again with **Ctrl+Shift+E** and replace the file in Interactives' Assets. Layers using it keep their settings.

Interactives' own help has more: search it for **Frameling animations**.`,
};
