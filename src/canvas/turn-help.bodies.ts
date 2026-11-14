// The words of the help topic in turn-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'turn-flip-view': `Painters turn the page to reach a stroke comfortably, and look at a picture in a mirror to see what is off. You can do both here.

**This is only the view.** It's how you look at the page, like turning a sheet on your desk. Your drawing isn't changed, saving the file isn't affected, and exporting gives you the picture the right way round. A small note at the top of the canvas, and a button in the status bar, say so while the view is turned, with the angle.

**Flip the view:** **View > Turn and flip the view > Flip view**, or **Ctrl+Alt+H**. The screen is mirrored left to right. A face that looks fine can suddenly look lopsided. Press it again to flip back.

**Turn the view to any angle:** hold **Alt** and drag round the middle of the canvas, with the Brush, Pencil, Eraser or Bucket. The page turns with your pointer, like a sheet of paper on your desk. Near straight it settles upright by itself, so getting back is easy. Hold **Shift** as you drag to turn in neat 15 degree steps instead.

**Alt and click still picks a colour** on a pixel layer. Press and let go without moving and it's a pick; move more than a few pixels and it's a turn. A hand that shakes a little still gets its pick. Tools that already use Alt (the shapes, selections, Transform, the pen) keep it, and there you can turn with the keys below.

**Turn it with keys:** **Alt+.** turns it a little clockwise and **Alt+,** a little anticlockwise (15 degrees each press). Or hold **Space** and **Shift** together and drag round the middle of the window. A pen works just like a mouse for all of this.

**Put it back:** press **Straighten** on the note at the top of the canvas, or the turn button in the status bar, or **Reset view turn** (**Ctrl+Shift+0**). Opening or starting another file also starts straight.

**Drawing while it's turned works as usual.** The pen, the brush ring, snapping, guides, the pixel grid and the selection box all turn with the page, and a line lands exactly where you see it.

**Good to know:**
- The rulers step aside while the view is turned, since they measure the straight page. They come back when you reset.
- Turned by anything other than a quarter turn, the picture is smoothed a little on screen, so pixel art looks softer than it is. Reset to see the crisp pixels.
- Fit to window (**Ctrl+0**) fits the page as it is turned.

See also [Moving around the page](help:canvas-navigation).`,
};
