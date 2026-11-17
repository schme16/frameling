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
| `--only draw,playback` | run some tests only: `draw`, `playback`, `rigfx`, `pixelblend`, `pixellive`, `templates`, `zoompan`, `onioncam`, `memory`, `soak`, `export` (`soak` and `export` only run when named) |
| `--label name` | a name stored in the results |
| `PERF_RENDERER=dir` | use a renderer build from another folder, so you can measure without touching `dist/` (`npx vite build --outDir /somewhere/renderer`) |
| `PERF_CPU_SLOWDOWN=4` | emulate a CPU four times slower (Chromium's CPU throttling). The GPU is unchanged. |
| `PERF_SOFTWARE_GL=1` | ask for software (SwiftShader) instead of the real card, for a machine with no card. Without it the run uses the card and fails if the card did not come up; either way the first line says which engine it got and the results file keeps it (`env.gpuRun`, or `gpu` for the sweep). Details: docs/colour-and-gpu.md |
| `PERF_SHOW=1` | put the window on screen, to watch it |

A full run takes about two minutes. Don't run other Electron work at the same time, it skews the numbers. Compare
runs from the same machine only, and run each twice if a difference is small.

**Getting the card under xvfb.** On a laptop or desktop with a switchable NVIDIA card, the card only comes up inside
xvfb when two graphics variables are set in front of the command, and without them the run lands on software and fails
the card check:

```bash
__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia \
  xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/run.cjs --label after
```

That goes in front of every xvfb command in this file, including `startup.cjs`, `sweep.cjs` and the brush and pen-up
harnesses. For software numbers on purpose, leave them off and pass `PERF_SOFTWARE_GL=1`.

## Start-up time and bundle size

`startup.cjs` launches the built app as a fresh process again and again and times it from launch to the first
interactive frame (`frameling:interactive`, set in `src/renderer/App.tsx` two frames after the app mounts, so the
canvas has drawn and the page is free for input). It also reports the JS the page needs before it can start (the entry
file and anything it preloads, from `index.html`).

```bash
npm run build && node scripts/perf/startup.cjs --out scripts/perf/results/startup-desktop.json
```

- The desktop run starts the real main process (`dist/main/main.cjs`) through `launch.cjs`, which parks windows
  off-screen on a real desktop and keeps them on-screen under xvfb (`display.cjs`; `PERF_ONSCREEN=1` or `0` forces it). Afterwards it imports every lazily loaded chunk from `file://` in that real window, to prove they load.
- The first launch has a fresh profile; the median is of the launches after it. `--cpu 4` (the default) also reloads
  each page with the CPU slowed down four times.

What loads later is in `src/core/lazy.ts`: the Export dialog and every exporter, the big sheets and dialogs, and most
dock panels load on first use, and in idle time a moment after start-up so the first click doesn't wait either.

## Where start-up time goes

Three small tools, all for the built app (run them under xvfb, never on the desktop):

- `node scripts/perf/bundle.mjs [--top 40] [--folder src/ui/]` builds the renderer into a temp folder and lists what the
  initial chunk holds: by source folder, by module, and by "loads only because of one importer" (the bytes that would
  leave the initial chunk if every static import of that module became a dynamic one). Start here when choosing what to make lazy.
  `--why src/ui/palette` lists who imports a module inside the first chunk, and `--json file.json` saves the module sizes and
  every importer, to answer "what leaves if I cut this one import?" without rebuilding.
  Most of the page time is not the download: the main thread waits for the entry script to parse (about 20 ms per MB),
  evaluates it (under 20 ms), then renders the app and lays it out for the first time (about 40 ms, cold). Splitting the
  first chunk into several files so they parse side by side was tried and did not help.
- `npx vite build --sourcemap --minify false && node scripts/build-main.mjs`, then
  `xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/perf/startprofile.cjs [--top 30] [--until 260]` profiles the first
  load of a fresh launch (V8 CPU profile, mapped back to source files with the source map).
- `STARTUP_TRACE=/tmp/st.json` in front of `electron scripts/perf/launch.cjs app` (with `STARTUP_USER_DATA=<folder>`) records a
  Chromium trace of the first load; `node scripts/perf/tracesum.cjs /tmp/st.json` lists main-thread work from the
  first request to the `frameling:interactive` mark (script eval, layout, style, frames). `PERF_DIST=<folder>` points
  `launch.cjs` (and so `startup.cjs`) at another build's `dist/`, so two builds can be timed one after the other.
  `STARTUP_TRACE_STACKS=1` beside it records the stack of whatever asked for each layout or style pass, which is how
  the first layout was traced back to a single `offsetWidth` read in the menu bar. It makes the trace much bigger, so
  it is off by default.

Things that were found this way: the first layout of the page is cold (system font fallback lookups are slow on a
machine with thousands of fonts), so a text glyph the page font lacks (the old "more" dots) cost about 20 ms until it
became a drawn icon; the main thread waits for the whole entry script to be parsed in the background (about 20 ms per
MB), so every 100 kB kept out of the initial chunk is worth about 2 ms. Moving to a custom scheme to get V8's code
cache would change the page's origin and lose everyone's saved preferences (localStorage), so it is not done.

## The real main process

`run.cjs`, `brushsize.cjs` and `palettepic.cjs` start the app's own main process (`dist/main/main.cjs`) through
`realapp.cjs`, with only the window steered (parked, unfocusable, no background throttling) and the user-data folder a
temporary one, so a run never touches your real recent files, autosave or library. Every handler the page asks for is
the shipped one, so the harness cannot drift from the app. They used to make a bare window and answer four channels by
hand, which left `app:restore`, `plugins:setDiagnostics` and `update:facts` failing on every load.

If the main process fails a request (no handler registered, or a handler that throws) the run stops at once with
`HARNESS IS NOT THE APP` and a non-zero exit code, instead of printing the error and carrying on.

Two things moved when this changed, so older result files are not exactly comparable on them: the window is the real one
(content area 1400x900, where the bare window had a 27 px menu bar the app never shows, so 1400x873), and the real app
autosaves while you draw.

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
| `export` | The frames of a GIF export drawn and read back the way `run.ts` does it, on the kitchen sink at 3x (96 frames of 960 x 576) and on a 48 frame, 5 layer stroke document (1280 x 720), then the whole GIF export by the clock. Takes about a minute. Built for the `willReadFrequently` question below. | `drawMsPerFrame`, `readMsPerFrame`, `drawPlusReadMsPerFrame` (the number that counts), `wallMs`, and `readbackFlag` (which way the canvases were made). |

Every `stats` block is `{n, mean, p50, p95, p99, max}` in milliseconds.

## Export: does `willReadFrequently` pay?

Every export canvas is made with `willReadFrequently: true` (cheap to read back, but it can move the drawing from the card to
the processor). One switch, in `src/export/readback.ts`, decides it for all of them: start the app with
`FRAMELING_EXPORT_READBACK=0` and those canvases are made without the flag. Unset, nothing changes. The page reads the
setting once, from the preload (`window.frameling.tuning`), and the run records it as `export.readbackFlag` and
`env.exportReadbackEnv`.

Run the pair on the real card, on a quiet machine, one after the other (the flag only means something with the card drawing,
so not under `PERF_SOFTWARE_GL`):

```bash
npm run build
npx electron scripts/perf/run.cjs --only export --label flag-on  --out scripts/perf/results/export-flag-on.json
FRAMELING_EXPORT_READBACK=0 npx electron scripts/perf/run.cjs --only export --label flag-off --out scripts/perf/results/export-flag-off.json
node scripts/perf/compare.cjs scripts/perf/results/export-flag-on.json scripts/perf/results/export-flag-off.json
```

Read `drawPlusReadMsPerFrame` and `wallMs`. On a canvas the card draws, `drawFrame` only queues the work and the read is where it
is waited for, so `drawMs` and `readMs` move against each other and only their sum is a fair comparison. Run each side twice.

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

## Zooming a heavy drawing: zoomfile.cjs

`zoomfile.cjs` zooms a drawing with paper tooth on its lines (a real file with `ZOOM_DOC=/path/file.frameling`, or a stand-in) by
wheel notches and by a pinch, in and out, then stops at four depths and watches the frames while the sharp picture catches up.
`--check` fails when drawing a frame takes too long (p95, worst, long tasks), when the sharp picture does not land after a stop,
or when anything is still owed or drawn while idle; the limits scale with how slow the page's JavaScript measures at the start, so
a busy machine does not fail it (details in docs/testing.md). `ZOOM_HASH=1` hashes the settled picture at five views;
`ZOOM_PROFILE=1` prints a CPU profile; `ZOOM_DPR=2`, `ZOOM_THROTTLE=4` and `ZOOM_TOOTH_BUDGET=3000000` stand in for a sharper
screen, a slower machine and a drawing with more lines than the cache holds.

```bash
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/zoomfile.cjs --check --out scripts/perf/results/zoomfile.json
```

## Big brushes: brushsize.cjs

`brushsize.cjs` draws one stroke per tip and size with real pointer events and reports what each pointer move costs: the
overlay draw (`overlayDrawMs`), input to drawn (`latency`), the time between frames (`frameDeltaMs`), the time from lift to
settled and the longest long task. `vector` runs every tip on a big canvas at the old 120 px cap, the top of the slider
(the longer side plus a tenth) and well past it; `pixel` does the square and round pixel brush on a 2000 x 2000 pixel layer,
with a hover (no button) measurement of the footprint outline. Point `PERF_RENDERER` at a build of `development` to run the
before in the same session, then run the branch.

```bash
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/brushsize.cjs --only vector --out scripts/perf/results/brushsize-vector.json
```

`BRUSH_TIPS=chalk,nib`, `BRUSH_VSIZES=120,4400`, `BRUSH_PSIZES=24,2200`, `BRUSH_EVENTS=30` and `BRUSH_CANVAS=4000x3000` narrow it.
Under xvfb there is no card, so run it with `PERF_SOFTWARE_GL=1` and read the numbers as software drawing (on a machine with the card, the two
graphics variables at the top of `.claude/skills/perf/SKILL.md` bring it up). `BRUSH_PROFILE=1` prints a CPU profile of every stroke (the top functions
by self and inclusive time; point `PERF_RENDERER` at a `--minify false` build to read the names), and `firstLatencyMs` in each result is the
first three inputs raw, the first being the press itself.

## Gradients on a busy canvas: gradients.cjs

`gradients.cjs` answers one question: what do many angular or diamond shapes cost, next to the same scene in radial gradients,
which the canvas draws itself? A canvas has no diamond gradient, so `fillDiamond` and `strokeDiamond` in `src/core/gradient.ts`
paint one from pieces on spare canvases the size of the whole canvas. Angular uses the browser's own `createConicGradient`, so it
is not painted from pieces at all (the run records `conicGradient: "function"` to show it was there).

`render` draws one frame with the single renderer (what an export uses), `reps` times, and keeps the lowest: 1280x720, 1920x1080
and 3840x2160 canvases, 1, 10, 50 and 200 shapes each about a tenth of the canvas wide, painted solid, linear, radial, angular,
diamond, and as a diamond *line* round a plain fill. `live` plays 96 frames in the real app where every frame is a different drawing
full of such shapes, so no finished picture is reused, and counts late and skipped frames. Judge by the ratio to radial in the same
run, not the milliseconds: other work on the machine moves them together. Give it several runs and read the lowest of each case.

```bash
npm run build
__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia xvfb-run -a -s "-screen 0 1600x1000x24" \
  npx electron scripts/perf/gradients.cjs --out scripts/perf/results/gradients-after-1.json   # about 75 seconds; --quick, --only render|live, --reps N
node scripts/perf/gradients-summary.cjs scripts/perf/results/gradients-before-1.json scripts/perf/results/gradients-before-3.json
```

The result on 2026-11-16 (RTX 4080 Super, Ryzen 9 7900X, three runs, the lowest of each case; the machine was shared with other
agents, load average 3 in the cleanest run and 9 to 18 in the others; `gradients-before-busy.json` is a fourth, noisy run kept for
the record). Nothing was changed, so these are the numbers as the code stands:

| One frame, ms (ratio to radial) | 1280x720, 50 shapes | 1920x1080, 10 | 1920x1080, 50 | 1920x1080, 200 | 3840x2160, 50 |
|---|---|---|---|---|---|
| radial | 0.55 | 0.35 | 0.60 | 1.45 | 0.73 |
| angular | 0.60 (1.1x) | 0.38 (1.1x) | 0.57 (0.9x) | 1.45 (1.0x) | 0.77 (1.1x) |
| diamond fill | 4.5 (8.2x) | 1.2 (3.5x) | 4.9 (8.1x) | 11.5 (7.9x) | 7.2 (9.8x) |
| diamond line | 6.7 (12x) | 2.8 (7.9x) | 9.2 (15x) | 28.6 (20x) | 33.4 (46x) |

- **Angular costs the same as radial** (within a tenth, in every case): it is the browser's own gradient.
- **A diamond fill costs about 0.05 ms a shape at 1080p** (a spare canvas each, whatever the shape's size), so 10 of them are
  about a millisecond and 200 are about 11 ms. A diamond line costs about 0.14 ms a shape at 1080p and about 0.5 ms at 4K (it
  needs a second spare canvas and grows with the canvas: four times the pixels, 3.6 times the time).
- **Playing 96 different drawings at 24 fps** (main thread ms to paint one drawing, radial / angular / diamond): 20 shapes on 1080p
  0.08 / 0.11 / 0.7, no dropped frames; 100 shapes 0.28 / 0.26 / 2.5, diamond drops 2 of 96 and 9 are late; 250 shapes 0.63 / 0.65 /
  6.6, diamond drops 7 and 33 are late, the other two hardly any. On 4K, 50 diamonds is 1.3 ms a drawing and fine.
- **Where it starts to matter:** a sixty-frames-a-second frame is 16.7 ms. Diamond fills at 1080p pass that at about 300 shapes,
  diamond lines at about 100, and diamond lines at 4K at about 25. A single drawing holding that many diamond-painted shapes,
  new on every frame, is not something people draw, so nothing was changed. If it ever matters, caching a finished piece per shape
  would not help the animated case (each frame is a new drawing, and the whole drawing's finished picture is already kept); the
  win is in confining each piece to the shape's own box instead of the whole canvas.

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
stage), `history-deep` (a small document with 2000 real undo steps behind it) and `stress-vector-history` (the 40 x 240
document with 600 steps behind it). The last two are the deep-history corners: `window.__sw.pileHistory(n)` piles the
steps by adding a line to the drawing on the active layer n times, the shape of edit a person actually makes, and
reports the steps and the memory the history holds. `stress-pixel-hd` (twelve 1920 x 1080 frames, painted edge to
edge, so nothing is trimmed away on save) is only run when asked for with `--docs`.

Each result file also carries `pages`: how many elements each document puts on screen, how many of those are the
timeline's, and `parts`, which says what classes they are, biggest group first. The browser's own work (hit testing,
paint, layerizing) is most of what a click costs on a big document, so these numbers belong beside the timings. For
scale, the 40 layers by 240 keys document makes a page of 2954 elements with 2145 of them in the timeline, and 1540 of
those are the 385 drawing blocks on screen with their four elements each.

**But element count is not the lever it looks like.** Taking 385 of those elements out of that document (one per
drawing) moved no timing at all. What did move things was giving each row `contain: layout paint style`, so one block
repainting does not make the browser repaint and re-layer the whole timeline: moving the pointer along a row went 9.3
to 6.5 ms a move at 4x, a key delete 114 to 95, a layer delete 66 to 45.

**Undoing a structural change is not the timeline rebuilding, whatever the artboard rows suggest.** Putting three
deleted layers back on the 40 by 240 document measured 107 ms an undo at 4x, and 171 of its 176 ms were inside immer:
`applyPatches` runs patches in a `produce`, which drafts the document and then walks the whole result to turn drafts
back into values. That walk costs the same whether the step moved one number or put a whole layer back. Paint over the
same three undos was 49.7 ms, so the DOM was a fifth of it. `src/core/patch.ts` now runs the patches straight, copying
only the containers along each path, and the undo call went 176 to 48.7 ms inclusive, the action 322 to 184 ms busy
(reps 347/314/315/322 against 184/257/173/184). `undo-delete-key` did not move: one row's drawings are a small patch
either way. Results: `r2-undo-structural-1-4x.json` and `r2-undo-structural-2-after-4x.json`.

**How much a difference has to be before it means anything.** The busy-ms figures drift between whole runs, not just
between reps inside one: two full sweeps of the same build, 122 rows, came out a mean 3.4% apart with single rows as far
as 53% down and 50% up. `--reps` repeats the action inside one page session, which does not catch that. So a single
sweep pair cannot carry a claim under about 25%, and a smaller one needs several whole runs of each side, interleaved.
The `play` row is worse than the others: its busy ms is how much CPU the page used in a fixed 1.5 s, not how well it
played, so it rises when the warm-ahead manages more work. Judge playback on `latePaints` and the frame-delta tail from
`run.cjs` instead.

Actions (`--actions x,y`): `brush-stroke`, `pixel-stroke`, `scrub` (drag along the timeline ruler), `play`,
`select-click`, `select-move`, `add-layer`, `delete-layer`, `add-key`, `delete-key` (click the key, then Delete),
`hover-keys` (the pointer along a row, changing nothing, so the cost is purely what the browser does per move),
`pick-keys` (Shift and the right arrow, growing a picked block), `undo-redo`, `undo-delete-layer` and
`undo-delete-key` (undoing a structural change, with the delete that set it up left out of the timing),
`switch-artboard`, `export-dialog`
(warm), `save-file` (the path Save uses), `open-file`, `autosave`, `workspaces`. Saving has a warm and a first kind, and they are very different on a pixel document: `save-file` and
`autosave` are saves after an earlier save, where the encoded PNGs are cached by pixel array (so they cost almost nothing,
because the unmeasured warm-up run fills the cache), and `save-file-first` and `autosave-first` give every pixel drawing a
fresh pixel array before each run (as opening a file does), so the PNG encoding is paid. The saves also report `wall`, the
page's own clock for the whole awaited call: the CPU profile (and so `busy`) only sees the page's thread, so a wait on the
zip worker counts as idle there. An action only runs on a document it applies to (a pixel stroke needs a pixel layer). Each action
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


The second sweep round (`results/sweep-after-2.json`, compare it with `sweep-after.json` using `compare-sweep.cjs`) moved the
rest of file saving and opening off the page's thread: `save-file` and `autosave` hand a finished `doc.json` (kept per drawing
between saves) to a worker, and `open-file` of a pixel document decodes its pictures on workers (the harness calls
`openBytesAsync`, the path File > Open takes; `openBytes` is the plain synchronous reader, kept for older builds).

`open-file` of a big vector document (`stress-vector`, a 36 MB `doc.json`) reads and parses that JSON on a worker and hands the parsed object across (`readDocJsonInWorker`, only for a `doc.json` over 1 MB): the page's time drops from about 340 ms to about 195 ms, and the open itself takes about 250 ms longer by the clock (the hand-over is not free), with the page free to draw meanwhile.

## The second window

`popout.cjs` measures what the second window costs the drawing window, in the real app (two windows, the real message
port), in one run:

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/popout.cjs --rounds 7 --seconds 6 --out scripts/perf/results/popout.json
```

It plays a heavy drawing (240 frames, 5 layers, 50 strokes each) at a 24 and a 60 frames-per-second drawing rate, and
alternates four conditions round after round: the second window **closed**; an **animated control window** (a plain second
window that changes its whole picture every screen frame and does nothing else, so a cost that comes from the machine
presenting two windows shows up without our code in it); the real second window **open but never painting** (what the messages
alone cost); and the real second window **open**. For each it reports how many frames the drawing window painted a second, how
many it skipped, the time a paint takes and the gap between paints; for the second window, how many pictures it paints a
second and how long each takes. The summary is the median of each condition across the rounds, because on a shared machine one
round in three can be a different machine. Compare the rows of one run with each other, never with another run.

What the first run found (xvfb, software drawing, the machine shared with other agents, so rough; the numbers are in
`results/popout-second-window.json`): at 24 frames a second there is no difference at all (24 painted a second, 0 skipped, the
same paint gap, closed or open). At 60 frames a second, a drawing heavy enough to need most of the machine's software drawing,
the drawing window painted 53 a second closed, 51 with the messages alone, 47 beside the animated control window, and 28 with the
real second window painting every frame. So the messages cost about 4%, and the rest is the second window drawing its own copy of each frame
on the same software engine. Halving the picture's resolution while it played did not help (33 against 32), and neither did
painting every other frame, so neither was kept. Not measured: a real graphics card (none comes up under xvfb), where the second
window's drawing is on the card and should cost the drawing window much less.

## tooth.cjs: paper tooth on chalk and charcoal lines

Draws the same busy page (50, 150 and 400 charcoal lines, each about 280 px long and 22 px wide) three ways: plain lines, the older grain
made of tiny shapes, and paper tooth, at 1x and 2x, **cold** (every line worked out from scratch) and **warm** (a held drawing, the finished
pictures reused). Compare the three columns of one run with each other; the machine is shared, so never one run with another.

```bash
npm run build
__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/tooth.cjs --out scripts/perf/results/tooth.json
```
