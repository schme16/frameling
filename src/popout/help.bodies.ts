// The words of the second-window help topic in help.ts, kept apart so they load only when Help is opened.
export const bodies: Record<string, string> = {
  'canvas-popout': `The **second window** shows your drawing big, in a window of its own. Put it on another screen and you can draw on your tablet while the whole picture sits in front of you, as large as the screen allows.

**Open it:**
- Press **Ctrl+Alt+P**, or choose **View > Panel windows and tools > Second window**. Press it again to close it.
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
- Everything you draw shows as you draw it, a moment behind: pixel and vector brush strokes, erasing, shapes dragged out, the pen, and moving or turning things. If your drawing is slow to follow, the second window drops frames rather than slow you down.
- Picking things stays in your drawing window. The selection box, the lasso line and the little handles are the interface, not the drawing, so nobody watching sees you pick.
- If you close the drawing window, the second window closes with it.
- If the second window gets lost behind others, choose **View > Panel windows and tools > Bring the second window forward**.
- It needs the Frameling desktop app.

To see what a camera shows, see [Camera](help:camera). To check the picture as it will export, see [Exporting](help:exporting).`,
  'stream-capture': `The **capture view** is your drawing in a window with nothing else in it: no title bar, no panels, no buttons. OBS (or any streaming program) can capture it as a normal window, so your audience sees the drawing and none of the interface.

**Open it:**
- Press **Ctrl+Alt+Shift+P**, or choose **Streaming > Capture view > Capture view**. Press it again to close it.
- The first time, it asks what colour to put behind the drawing.
- Drag the window to move it, and its edges to resize it.

**In OBS:**
1. Add a **Window Capture** source and pick **Frameling capture**.
2. To drop the background, right-click the source, choose **Filters**, add a **Chroma Key** filter and pick the same colour as the capture view (Green is the usual one).

**Colour.** A window can't be see-through, so the capture view sits on a flat colour OBS can key out. Change it any time with **Capture view background colour** (same menu): **Green**, **Blue** or **Magenta** to key out (pick one your drawing doesn't use), or **Dark**, **Black** or **White** for a plain backdrop. Parts of your page with no background show it too.

**Size.** Leave it any size, or fix it at **1920 x 1080**, **1280 x 720**, **2560 x 1440**, **3840 x 2160**, **1080 x 1080** or a tall **1080 x 1920**. A fixed size stays exactly that many pixels, with the drawing fitted inside.

**Mouse pointer.** Hidden over the capture view by default. Turn **Hide the mouse pointer over the capture view** off to see it.

**Your file stays private.** The window is always called "Frameling capture". It is never told your drawing's name or where the file lives.

**It only watches.** Like the [second window](help:canvas-popout), it follows your drawing as you draw it, a moment behind (so your audience sees a line grow rather than appear when you lift the pen), it plays along, and nothing in it can change your drawing. It shows the picture as an export would: no grid, guides, handles or notes.

**On Linux with Wayland**, OBS can only see windows through **PipeWire**. If Window Capture is empty or black, make sure PipeWire and your desktop's xdg-desktop-portal are installed, then add a **Screen Capture (PipeWire)** source and pick the capture view when asked what to share. Windows, macOS and X11 work as they are.

It needs the Frameling desktop app, and closes when you close your drawing window. To change what is remembered, see [Behaviour](help:behaviour).`,
};
