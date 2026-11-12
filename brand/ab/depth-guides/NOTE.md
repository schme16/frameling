# Guides, grid and snap lines on a depth (parallax) layer

Clips of the "Camera and parallax" example: the camera pans from frame 1 to 37 with the Near hills layer picked at depth 0.5 (`depth-0_5-*`), then with the Far hills layer picked at depth 1 (`depth-1-*`). Guides sit on the hill peaks (vertical lines through two or three peaks, one horizontal through the tops) and the square grid is on. The other layers are hidden so the picked one is easy to follow.

- A (built, the default): guides, grid and snap lines are drawn in the picked layer's space, so they stay on the art and move at that layer's parallax speed. `depth-*-A.mp4`.
- B (before): they stay on the stage and move with the plain camera, so a guide drifts off the hill as the camera pans. `depth-*-B.mp4`.
- `depth-*-A-left-B-right.mp4`: both side by side, A on the left, labelled.

Things to judge in A: the grid is only as wide as the page, so on a far layer it slides across and leaves part of the view without grid; guides are long enough to always cross the view. A guide on a layer pinned to the stage (depth 0) looks the same in A and B.

B is cheap to render: `__frameling.anim.guidesOnStage(true)` in the debug hook (the flag lives in `src/camera/ops.ts`). Rebuild the clips with `SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/docs/depth-guides-ab.cjs`.
