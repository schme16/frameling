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
| `--only draw,playback` | run some tests only: `draw`, `playback`, `templates`, `zoompan`, `memory` |
| `--label name` | a name stored in the results |
| `PERF_RENDERER=dir` | use a renderer build from another folder, so you can measure without touching `dist/` (`npx vite build --outDir /somewhere/renderer`) |
| `PERF_CPU_SLOWDOWN=4` | emulate a CPU four times slower (Chromium's CPU throttling). The GPU is unchanged. |
| `PERF_SHOW=1` | put the window on screen, to watch it |

A full run takes about two minutes. Don't run other Electron work at the same time, it skews the numbers. Compare
runs from the same machine only, and run each twice if a difference is small.

## The hidden window

The window is parked off-screen (x = -4000) and can't take focus, so nothing appears on the desktop. It is not
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
| `templates` | Every starter template: `make()`, then `store.load`, to the first canvas paint. Median of three. | `makeMs`, `firstPaintMs`, `presentedMs` |
| `zoompan` | 180 ctrl+wheel ticks in and out, then a middle-button pan circle, on a 300 stroke document and a 5 layer one. | `rafDelta`, `mainDrawMs`, `bitmapBuilds` |
| `memory` | 200 strokes drawn, 100 undone. JS heap after a forced GC at the start, after the strokes and after the undos. | `growthMB` |

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
- **Faded layers** in `core/render.ts` reuse one buffer rather than allocating a canvas per call.
- **Live stroke** (`overlayDrawMs`): still redrawn from all its points on every frame, on purpose, so the preview is
  exactly the outline the finished stroke gets. It stays well under a millisecond at 2,000 points on a fast CPU and
  about 1.3 ms with the CPU throttled 4x, so it was left alone.
