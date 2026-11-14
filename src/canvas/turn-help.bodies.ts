// The words of the help topic in turn-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'turn-flip-view': `Painters turn the page to reach a stroke comfortably, and look at a picture in a mirror to see what is off. You can do both here.

**This is only the view.** It's how you look at the page, like turning a sheet on your desk. Your drawing isn't changed, saving the file isn't affected, and exporting gives you the picture the right way round. A small note at the top of the canvas and a button in the status bar say so while the view is turned.

**Flip the view:** **View > Turn and flip the view > Flip view**, or **Ctrl+Alt+H**. The screen is mirrored left to right. A face that looks fine can suddenly look lopsided. Press it again to flip back.

**Turn the view:** **Alt+.** turns it a little clockwise and **Alt+,** a little anticlockwise (15 degrees each press). Or hold **Space** and **Shift** together, then drag round the middle of the window; it turns in 15 degree steps and follows your pointer.

**Put it back:** **Reset view turn** (**Ctrl+Shift+0**), or the **Reset** button on the note. Opening or starting another file also starts straight.

**Drawing while it's turned works as usual.** The pen, the brush ring, snapping, guides, the pixel grid and the selection box all turn with the page, and a line lands exactly where you see it.

**Good to know:**
- The rulers step aside while the view is turned, since they measure the straight page. They come back when you reset.
- Turned by anything other than a quarter turn, the picture is smoothed a little on screen, so pixel art looks softer than it is. Reset to see the crisp pixels.
- Fit to window (**Ctrl+0**) fits the page as it is turned.

See also [Moving around the page](help:canvas-navigation).`,
};
