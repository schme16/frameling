The second window (View > Second window, Ctrl+Alt+P).

- `canvas-popout-dark.mp4`, `canvas-popout-light.mp4`: both windows on screen at once (1600 x 800, H.264). Three strokes are drawn in the drawing window on the left while the second window on the right follows them as they are drawn, then the animation plays and both play together.
- `rest-dark.png`, `rest-light.png`: the second window at rest, cropped to the window and captioned. The pill at the bottom is the hint that shows for the first few seconds.

Made by `scripts/e2e/popout-media.cjs` (xvfb, ffmpeg over the whole virtual screen). Frame rate with and without the window: `scripts/perf/results/popout-second-window.json`.
