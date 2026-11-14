// The words of the second-window help topic in help.ts, kept apart so they load only when Help is opened.
export const bodies: Record<string, string> = {
  'canvas-popout': `The **second window** shows your drawing big, in a window of its own. Put it on another screen and you can draw on your tablet while the whole picture sits in front of you, as large as the screen allows.

**Open it:**
- Press **Ctrl+Alt+P**, or choose **View > Second window**. Press it again to close it.
- Drag it to the screen you want. Frameling remembers where you left it, and if that screen isn't there next time it opens on the one you have.
- **Double-click** it (or press **F**) for full screen. **Esc** comes back.

**What it does:**
- It follows every stroke while the pen is still down, not only when you lift it.
- It moves with you: change frame and it changes frame, press play and it plays.
- Undo, redo, opening another drawing: it keeps up with all of it.

**It only watches.** You can't draw, select or change anything in it, so you can't spoil your drawing from there. Everything you do still happens in your drawing window.

**What it shows, and what it leaves out:**
- It shows the picture as an export would: no grid, guides, handles, onion skin, notes or reference pictures.
- **Camera.** If your drawing has a camera, Frameling asks once whether the second window should show **what the camera sees** or **the same as your drawing window**. Change your mind any time in **Preferences > Behaviour**.
- **Marks.** If you have drawn [marks](help:canvas-marks), it asks once whether to show them. They never show while the picture plays or through the camera.
- Working inside a symbol, it keeps showing the whole page.

**Good to know:**
- Pixel strokes appear when you lift the pen; freehand lines on vector layers show as you draw them.
- If you close the drawing window, the second window closes with it.
- If the second window gets lost behind others, choose **View > Panel windows and tools > Bring the second window forward**.
- It needs the Frameling desktop app.

To see what a camera shows, see [Camera](help:camera). To check the picture as it will export, see [Exporting](help:exporting).`,
};
