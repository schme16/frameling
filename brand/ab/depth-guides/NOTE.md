# Guides, grid and snap lines on a depth (parallax) layer

Clips of the "Camera and parallax" example: the camera pans from frame 1 to 37 with the Near hills layer picked at depth 0.5 (`depth-0_5-*`), then with the Far hills layer picked at depth 1 (`depth-1-*`). Guides sit on the hill peaks (vertical lines through two or three peaks, one horizontal through the tops) and the square grid is on. The other layers are hidden so the picked one is easy to follow.

- A (built, the default): guides, grid and snap lines are drawn in the picked layer's space, so they stay on the art and move at that layer's parallax speed. `depth-*-A.mp4`.
- B (before): they stay on the stage and move with the plain camera, so a guide drifts off the hill as the camera pans. `depth-*-B.mp4`.
- `depth-*-A-left-B-right.mp4`: both side by side, A on the left, labelled.

Decided: A, guides follow the picked layer, and the grid now covers the whole picture on a far layer (it used to be only as wide as the layer's own page). The debug flag that drew B and the script that rendered these clips are gone; the clips stay as the record.
