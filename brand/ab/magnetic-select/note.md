# Magnetic lasso

A lasso that clings to the edge your drawing already has. Trace roughly round something, the outline snaps onto its
edge, points drop as you go, and closing it picks what is inside.

Every clip is H.264 (yuv420p, even sizes), in both themes. The posters are the last frame of each clip.

## pixel-trace-dark.mp4 and pixel-trace-light.mp4 (the posters are pixel-trace-*.png)

A green slime on a sky-blue background with a strip of ground, in the Pixel workspace, Magnetic lasso picked.
The pointer goes round the slime a pixel or so outside its edge, clicking at every other corner. Between clicks the
outline walks the staircase of the edge, pixel by pixel, instead of cutting across. The dot is where it has hold. The
dashed line back to the first point is only the closing preview. At the end the pointer goes back to the first dot and
clicks it, and the slime is picked exactly, with the marching ants round its edge and none of the sky or ground.

The same clip is the help picture for the topic (public/help/select-magnetic-*.mp4).

## vector-trace-dark.mp4 and vector-trace-light.mp4 (the posters are vector-trace-*.png)

A vector layer with an orange circle and a blue square. The pointer wobbles round the circle 9 to 26 pixels outside it
and the outline stays on the circle's own edge. Clicking the first point closes it and the circle is selected, with
its handles. The square is left alone. On a vector layer a click on a shape starts a trace instead of picking the shape
up, so the trace can start right on an outline.

## Keys shown or implied

- Click: place a point yourself. Backspace: take the last stretch back (at the first point it gives up).
- Enter, or clicking the first point: close it. Escape: give up.
- The tool is **Shift+E**, or Magnetic lasso in the Select group of the toolbar.
- How strongly it clings is in the tool options (Light, Medium, Strong, with the reach in pixels). Medium is the default.
