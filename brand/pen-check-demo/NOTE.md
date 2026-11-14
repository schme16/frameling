# Quill's pen check: a dummy run on video

A made-up pen goes through the whole of Quill's pen check (Preferences, Diagnostics, Check my pen with Quill), all nine
steps, the Save step and Quill's closing line, then the saved report is shown. Step 5 has a short caption-only aside
showing the button Quill offers on X11 when the eraser end does not show up ("My pen's eraser end doesn't show up here").

| File | What it is |
|---|---|
| `pen-check-dark.mp4`, `pen-check-light.mp4` | The run, 1280x800, H.264 yuv420p, about 90 seconds and 2 MB each. |
| `pen-check-dark-poster.png`, `pen-check-light-poster.png` | A still from the end (Quill's closing line). |
| `sample-report.json` | The report file the run saved (the same file the video shows scrolling past): report version 2, with raw button bits, pointer ids, device ids and a session per step. |
| `LINUX-BETA.md` | The checklist for the Zorin OS beta tester, and what was tested for Linux. |

## What is real and what is made up

- Real: the app (the built Electron app), the dialog, Quill's words, the step ticking, the report. Pen movement, pressure,
  lean and twist are Chromium pen events made with the DevTools protocol (`pointerType: 'pen'`), the same way
  `scripts/e2e/pen.cjs` does it, so the page sees them as a real pen's.
- Made in the page instead: the eraser end and the two barrel buttons (steps 5, 6, 7), because the protocol cannot press
  them. These are real `PointerEvent`s with the eraser and button bits set. The eraser goes in by its eraser bit (the way
  Windows and Wayland send it), so the report says `eraserBy: "bit"`; the X11 way (a second device, `eraserBy: "device"`) is
  not acted out. On Linux the made-up pen sends the button nearest the tip as bit 4, as real Linux pens do, so the report
  lists `rawBarrelBits` and `barrelsSwapped: true` for it.
- The X11 aside in step 5: the run waits out the six seconds Quill gives the eraser step, then the check's own extra
  button shows. The caption says what it is for; it is not pressed. If the session is not X11 (or unknown) the button does not
  appear and the aside is skipped. The express keys in step 9 are two key presses
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

Each run takes about two and a half minutes and writes `pen-check-<theme>.mp4`, its poster and `sample-report.json` into `<outDir>`.
It stops with a list of problems if any step fails to tick off.
