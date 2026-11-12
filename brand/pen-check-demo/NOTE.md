# Quill's pen check: a dummy run on video

A made-up pen goes through the whole of Quill's pen check (Preferences, Diagnostics, Check my pen with Quill), all nine
steps, the Save step and Quill's closing line, then the saved report is shown.

| File | What it is |
|---|---|
| `pen-check-dark.mp4`, `pen-check-light.mp4` | The run, 1280x800, H.264 yuv420p, about 85 seconds and 2 MB each. |
| `pen-check-dark-poster.png`, `pen-check-light-poster.png` | A still from the end (Quill's closing line). |
| `sample-report.json` | The report file the run saved (the same file the video shows scrolling past). |
| `LINUX-BETA.md` | The checklist for the Zorin OS beta tester, and what was tested for Linux. |

## What is real and what is made up

- Real: the app (the built Electron app), the dialog, Quill's words, the step ticking, the report. Pen movement, pressure,
  lean and twist are Chromium pen events made with the DevTools protocol (`pointerType: 'pen'`), the same way
  `scripts/e2e/pen.cjs` does it, so the page sees them as a real pen's.
- Made in the page instead: the eraser end and the two barrel buttons (steps 5, 6, 7), because the protocol cannot press
  them. These are real `PointerEvent`s with the eraser and button bits set. The express keys in step 9 are two key presses
  (F13 and F14).
- The fake pen drawn over the page (a pen shape, a ring that grows with pressure, a leaning body, a twist stripe, lit
  buttons and a small readout) is driven by the same pointer events the dialog receives, so it shows what Frameling is hearing.
- The Save dialog is the test stub (`FRAMELING_AUTOMATION_DIR`): it saves into a temporary folder and shows no window, so
  that step has a caption saying so.
- The captions are burned in with ffmpeg `drawtext` in a bar under the app.
- The report says `app.version` is the Electron version because the run starts the app through `electron`, not an installed build.

## Make them again

```
npm run build
SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/pen-check-demo.cjs <outDir> --theme dark
SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/pen-check-demo.cjs <outDir> --theme light
```

Each run takes about two minutes and writes `pen-check-<theme>.mp4`, its poster and `sample-report.json` into `<outDir>`.
It stops with a list of problems if any step fails to tick off.
