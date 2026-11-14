// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  camera: `A **camera** decides what part of your scene shows. Draw a big background once, then pan across it, zoom in for a close-up, or tilt for drama. Every export and playback shows what the camera sees.

**Add one:** **Frames and motion > Add a camera** (or press **Add a camera** in the Camera panel, **View > Panels > Camera**). It goes on top of your layers in the timeline and starts out showing the whole stage.

**Move it:** with the camera layer picked, the **Camera** tool is on. On the canvas the purple frame is what the camera sees:
- **Drag** anywhere to pan.
- **Drag a corner** to zoom (a smaller frame is a closer view).
- **Drag the yellow knob** to turn it. Hold **Shift** to turn in 15 degree steps.

Or type exact numbers in the **Camera** panel: **X** and **Y** (where the middle of the view is), **Zoom** (200% shows half as much, twice as big) and **Turn**.

**Make it move:** go to another frame and move the camera there. That frame gets its own camera key. Then press **Make in-betweens** in the Camera panel (or **Ctrl+Shift+T** with the camera layer picked), and it glides from key to key with the [easing](help:easing) you like. You can send it along a [path](help:motion-paths) too.

**Look through it:** press **Shift+C** (or **View > Look through the camera**) to see just what the camera sees, the way an export will. You can keep drawing while you do: brush, pencil, pen and eraser sizes are what you see, so a size of 10 is 10 pixels in the finished picture even when the camera is zoomed in. The [onion skin](help:timeline-onion), the [light table](help:light-table) and the [ghost on empty frames](help:empty-frame-ghost) show through it too. On a pixel layer a brush size is in whole pixels, so it is rounded (a 4 pixel brush is 2 pixels through a camera zoomed in 2x). By default, playing always looks through the camera; turn that off in the Camera panel.

**Parallax:** in the Camera panel, give each layer a **Distance**. 0 is on the stage. 1 is twice as far away, so it moves half as fast when the camera pans, like distant hills. Below 0 is closer than the stage, so it rushes past, like grass in front of the lens.

Hide the camera layer (its eye in the timeline) to switch the camera off: exports then show the whole stage. The camera belongs to the main scene, not to symbols.`,
};
