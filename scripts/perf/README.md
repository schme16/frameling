# Performance measurements

`run.cjs` drives the real built renderer in Electron, with real input events (`webContents.sendInputEvent`) and the
real GPU canvas, and writes numbers as JSON. `compare.cjs` lines two result files up in a table.

```bash
npm run build                                    # or build a renderer somewhere private, see below
npx electron scripts/perf/run.cjs --label after --out scripts/perf/results/after.json
node scripts/perf/compare.cjs scripts/perf/results/before.json scripts/perf/results/after.json
```

Options:

| | |
|---|---|
| `--out file.json` | where to write the results (printed to the console when left out) |
| `--only draw,playback` | run some tests only: `draw`, `playback`, `rigfx`, `pixelblend`, `pixellive`, `templates`, `zoompan`, `onioncam`, `memory`, `soak` (`soak` only runs when named) |
| `--label name` | a name stored in the results |
| `PERF_RENDERER=dir` | use a renderer build from another folder, so you can measure without touching `dist/` (`npx vite build --outDir /somewhere/renderer`) |
| `PERF_CPU_SLOWDOWN=4` | emulate a CPU four times slower (Chromium's CPU throttling). The GPU is unchanged. |
| `PERF_SOFTWARE_GL=1` | software WebGL (SwiftShader) for machines with no GPU, e.g. under xvfb, so the WebGL paths run (numbers are then software numbers) |
| `PERF_SHOW=1` | put the window on screen, to watch it |

A full run takes about two minutes. Don't run other Electron work at the same time, it skews the numbers. Compare
runs from the same machine only, and run each twice if a difference is small.

## Start-up time and bundle size

`startup.cjs` launches the built app as a fresh process again and again and times it from launch to the first
interactive frame (`frameling:interactive`, set in `src/renderer/App.tsx` two frames after the app mounts, so the
canvas has drawn and the page is free for input). It also reports the JS the page needs before it can start (the entry
file and anything it preloads, from `index.html`).

```bash
npm run build && node scripts/perf/startup.cjs --out scripts/perf/results/startup-desktop.json
npx vite build --config vite.web.config.ts && node scripts/perf/startup.cjs --web --out scripts/perf/results/startup-web.json
```

- The desktop run starts the real main process (`dist/main/main.cjs`) through `launch.cjs`, which parks windows
  off-screen on a real desktop and keeps them on-screen under xvfb (`display.cjs`; `PERF_ONSCREEN=1` or `0` forces it). Afterwards it imports every lazily loaded chunk from `file://` in that real window, to prove they load.
- `--web` serves `dist/web` from a sub-path (`/some/sub/path/frameling/`), then stops the server and opens the app
  again offline, and opens Export, Preferences, Themes and Help, so the lazily loaded chunks have to come from the
  service worker's copy.
- The first launch has a fresh profile; the median is of the launches after it. `--cpu 4` (the default) also reloads
  each page with the CPU slowed down four times; that number is only dependable for the desktop run, as Chromium drops
  the throttling when a service worker takes the reload.

What loads later is in `src/core/lazy.ts`: the Export dialog and every exporter, the big sheets and dialogs, and most
dock panels load on first use, and in idle time a moment after start-up so the first click doesn't wait either.

## The hidden window

The window is parked off-screen (x = -4000) and can't take focus, so nothing appears on the desktop (`startup.cjs` keeps it on-screen under xvfb, where an off-screen window is never
drawn). It is not
truly hidden on purpose: with this app a hidden Electron window only gets one `requestAnimationFrame` a second, so
there is nothing to measure (`PERF_HIDDEN=1` shows that). Frames come at the display's refresh rate; the results
record it as `env.idleRafMs` (6.06 ms means a 165 Hz display), so remember it when reading frame deltas.

## What it measures

The page is opened with `?debug&perf`. `?perf` switches on `src/canvas/perf.ts`, which collects timings into
`window.__framelingPerf` (the harness reads it). Without `?perf` it costs one boolean check per event.

| Test | Scenario | Key numbers |
|---|---|---|
| `draw` | A 2,000 point stroke at about 250 Hz, on an empty document and on one with 300 strokes. Then a 240 point stroke at one event per frame. | `latency*`: pointer event timestamp to the end of the overlay draw that shows it. `overlayDrawMs`: the JS time of that draw. `rafDelta`: frame to frame. `mainDrawMsMax`: the repaint when the pen lifts. |
| `playback` | 600 frames, 5 layers of 50 strokes each (150,000 strokes), 24 fps for 8 s, onion skin off and on. Then a second lap, and 60 scrubbed frames with onion skin on. | `paintIntervalMs` (should sit on 41.7), `latePaints` (more than 1.5 frames late), `framesSkipped`, `paintMs`, long tasks, `bitmapBuilds`. |
| `rigfx` | The kitchen sink (`src/export/kitchenSink.ts`) stretched to 300 frames at 24 fps: ten layers, effects on several, a folder with a mask and a clipped layer, tiles, a tweening symbol with tiles inside, an arm bending a mesh layer, sound. Played 8 s twice. | `paintIntervalMs`, `latePaints`, `framesSkipped`, `paintMs`, long tasks |
| `pixelblend` | One 1920x1080 frame (a backdrop and three layers on Linear dodge, Subtract, Divide) rendered by the single renderer, with the GPU blend path off (pixel by pixel on the CPU) and on. Needs `window.__framelingEffects`. | `cpu.frameMs`, `gpu.frameMs`, `speedup` |
| `templates` | Every starter template: `make()`, then `store.load`, to the first canvas paint. Median of three. | `makeMs`, `firstPaintMs`, `presentedMs` |
| `zoompan` | 180 ctrl+wheel ticks in and out, then a middle-button pan circle, on a 300 stroke document and a 5 layer one. | `rafDelta`, `mainDrawMs`, `bitmapBuilds` |
| `memory` | 200 strokes drawn, 100 undone. JS heap after a forced GC at the start, after the strokes and after the undos. | `growthMB` |
| `soak` | The kitchen sink at 600 frames, then a 600 frame, 5 layer stroke document. Each is put through rounds (4, or `PERF_SOAK_ROUNDS`) of: scrub every frame, play 5 s, export a GIF of the lot. JS heap after a full GC after each round, the bitmap cache size, and a heap snapshot comparison (by constructor) between round 2 and the last. About four minutes. | `heapMB` per round, `growthAfterRound2MB` (should be near 0), `snapshotDiffRound2ToLast.top` |

Every `stats` block is `{n, mean, p50, p95, p99, max}` in milliseconds.

## Reading the results

- Brush latency is dominated by waiting for the next display frame (half a frame on average). What the app controls
  is `overlayDrawMs` staying small and flat as the stroke gets longer.
- A smooth playback has `paintIntervalMs.p95` near 41.7 and `latePaints` and `framesSkipped` at 0.
- `bitmapBuilds` is how many whole-stage bitmaps were rasterised. Lower during playback and zoom is better.

## Regression tests

`test/perf/` holds cheap checks that run with the normal test suite: cache hits and builds, shapes drawn when a
stroke is added, look-ahead depth against the memory budget. They count work against a fake canvas
(`test/perf/fakeCanvas.ts`) and never assert on time.

## What the app does about each number

- **Pen lift** (`mainDrawMsMax`): a new stroke on a cached drawing is drawn onto a copy of the old bitmap
  (`BitmapCache.build(..., from)`), not by redrawing every stroke in the drawing.
- **Playback** (`paintMs`): in the spare time of each tick the engine rasterises the layer bitmaps of the frames
  coming up (`FramePainter.warm`, `CanvasEngine.warmAhead`), about 5 ms per tick and no more than half the bitmap
  memory budget, so the frame that arrives is only blits.
- **Stepping and scrubbing**: when paused, idle callbacks pre-draw the two frames either side of the playhead.
  Onion skin ghosts are built from those same per-layer bitmaps rather than from the strokes again.
- **Memory** (`soak`): drawing a stroke keeps only its Path2D; the outline as arrays of points is kept only for
  strokes that are hit-tested or exported. Keeping it for every stroke drawn held 300 MB more on the 600 frame stroke
  document (408 MB against 101 MB after a round). Bitmaps stay inside `BUDGET_PIXELS` (40 megapixels).
- **Faded layers** in `core/render.ts` reuse one buffer rather than allocating a canvas per call.
- **Live stroke** (`overlayDrawMs`): still redrawn from all its points on every frame, on purpose, so the preview is
  exactly the outline the finished stroke gets. It stays well under a millisecond at 2,000 points on a fast CPU and
  about 1.3 ms with the CPU throttled 4x, so it was left alone.

## Pen-up cost

`penup.cjs` draws a stroke on a big pixel drawing and times the release (mouse-up to the next task), with `--profile out.cpuprofile` printing the top functions of the release (self and inclusive). `xvfb-run -a -s "-screen 0 1600x1000x24" npx electron --no-sandbox scripts/perf/penup.cjs --size 4096 --laps 6`.

## Everyday actions: sweep.cjs

`sweep.cjs` measures what people do all day, on documents that are big enough to show hidden costs, with real mouse and
key events and a Chrome DevTools CPU profile around each action. It prints a table of main-thread time and, under each
result, the hottest functions. Use it when something feels slow, and after a change that touches the store, the
timeline, a panel or file reading and writing.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/sweep.cjs --reps 3 --top 6 --out scripts/perf/results/sweep.json
node scripts/perf/compare-sweep.cjs before.json after.json
```

For readable function names in the profile, build an unminified renderer and point the sweep at it (the page's numbers
barely change): `npx vite build --minify false --outDir /tmp/dev-renderer` then `PERF_RENDERER=/tmp/dev-renderer`.

Documents (`--docs a,b`): `bouncing-ball`, `puppet`, `walk-cycle`, `hero-sprites` (built-in templates), `stress-vector`
(40 layers in nested folders, 240 keys each, three shapes per key), `stress-pixel` (2000 x 2000 stage, 100 frames of an
800 x 800 painted block), `variations` (a drawing with four variations), `stress-symbols` (60 symbols, 120 instances on the
stage).

Actions (`--actions x,y`): `brush-stroke`, `pixel-stroke`, `scrub` (drag along the timeline ruler), `play`,
`select-click`, `select-move`, `add-layer`, `delete-layer`, `add-key`, `delete-key` (click the key, then Delete),
`undo-redo`, `switch-artboard`, `export-dialog` (warm), `save-file` (the path Save uses), `open-file`, `autosave`,
`workspaces`. An action only runs on a document it applies to (a pixel stroke needs a pixel layer). Each action
leaves the document as it found it (the history is rewound), and an action that was meant to edit and did not
fails loudly, so a harness that stopped driving the app never prints a good-looking number.

Other options: `--reps N` (measured repeats, after one unmeasured warm-up; the table shows the median), `--top N`,
`--out file.json`, `--profile-dir dir` (one `.cpuprofile` per document and action, to open in Chrome DevTools),
`--trace` (also records a Chromium trace and prints the page's own time by kind: style recalculation, layout, paint),
`--label`.

Reading the table: `busy` is main-thread time with the page doing anything (script, layout, paint set-up, GC), idle time
left out, summed over the whole action including the frames it makes and the work it queues for later (look-ahead
frames). `per unit` divides by the action's units (mouse moves, undo steps, ...). Under xvfb the canvas is drawn in
software, so `setTransform` and `drawImage` (where Chrome does the drawing) and `(program)` (native work no script
called) are large and not the app's script; compare them between runs rather than chasing them, and look at the app's own functions.
Numbers move 20 to 30 percent from run to run on small actions; run twice before believing a small difference.

