# Testing and checks

Two kinds of check:

- **Vitest** (`npm test`): fast, headless, no Electron. Runs in CI on every pull request.
- **Electron harnesses** in `scripts/`: drive the real built app (real Chromium canvas, real input events, sometimes
  the real main process) for what jsdom can't do: pixels, video, iframes, workers, accessibility, timing. Run by hand.

## The display rule

Every screenshot, recording, Electron check and automated test runs inside xvfb (or a similar hidden session), never
on the desktop someone is working at, so neither gets in the other's way. Every Electron command below is written in
that form:

```bash
xvfb-run -a -s "-screen 0 1600x1000x24" <command>
```

`-a` picks a free display number; the screen is big enough for the 1400 x 900 and 1280 x 800 windows the scripts
open. Inside xvfb, `SHOT_SHOW=1` puts the shot window on the virtual screen rather than parked off it, which is what
we want there.

Most harnesses also keep their window off-screen or hidden on their own (see "The off-screen window" below), but that
is a fallback, not a reason to run them on a live display.

## Vitest

```bash
npm test                                   # vitest run: everything under test/
npx vitest run test/io/file.test.ts        # one file
npx vitest run test/timeline -t "retime"   # a folder, filtered by test name
npm run typecheck                          # tsc --noEmit (also part of npm run build)
```

`vitest.config.ts` picks up `test/**/*.test.ts` and `*.test.tsx`. Tests run in Node; UI tests opt into jsdom with
`// @vitest-environment jsdom` on their first line. There is no canvas in jsdom, so pixel checks live in the Electron
harnesses. Tests that need the whole app's registries import `src/renderer/features` (every feature registering its
commands, tools, panels and help).

What's in `test/`, by folder:

| Folder | Covers |
|---|---|
| `a11y/` | Contrast of theme tokens, the roving tab index helper, and the shortcut clash test (below). |
| `artboards/` | Artboard model (switching, content swap), per-artboard export, fitting shots of different sizes (`fit.test.ts`: the camera keys and bars of a joined film) and the press-to-open rule the timeline follows. |
| `audio/` | Sound clips, mixing, the audio engine. |
| `camera/` | Camera layer ops. |
| `canvas/` | View maths, input, grids, snapping, resize, pixel helpers, rulers, the lost-canvas hint, theme colours. |
| `core/` | Camera maths, ask-once choices, gradients, held frames, shape tweens (including text), symbols. |
| `effects/` | Effect model and how effects look inside symbols. |
| `export/` | Every writer (APNG, GIF, sheet, SVG and animated SVG, Lottie, PDF, PSD, ProRes, YUV, playable, Godot, Godot add-on, Godot bones), the plan, capabilities, engine presets and fidelity. `*-e2e.test.ts` load the output in a real Godot 4 and are skipped unless `GODOT_BIN` is set. |
| `geometry/` | Fill, flood, merge, morph, pen, raster, tracing. |
| `integration/` | Whole-feature runs: the kitchen sink document, selecting mid-tween, nested editing, tiles inside symbols. |
| `interactives/` | The .flplay round trip. |
| `io/` | The .frameling file, PNG, sound in files, recovery, kept work, versions, save-as history, the user library (main side), cross-platform paths, reference layers, and that `brand/mascot/*.frameling` still load. |
| `lipsync/` | Audio analysis, mouth charts, applying to a symbol. |
| `particles/` | Emitter maths and determinism. |
| `perf/` | Work counting against a fake canvas (`fakeCanvas.ts`): cache hits, bitmap builds, look-ahead depth. Never asserts on time. |
| `pixel/` | Pixel tools, maths, paths, the pixel workspace. |
| `platform/` | The web bridge (IndexedDB through `fake-indexeddb`). |
| `plugins/` | Manifest checks, manager, ops, runtime and sandbox (with `harness.ts`). |
| `quests/` | Quest engine, groups, hooks, predicates, the library and the runtime. |
| `rig/` | Bone maths, posing, caches, stretch, weights. |
| `select/` | Pixel selection, masks, vector lasso. |
| `symbols/` | Motions and symbol and shape ops. |
| `templates/` | Every starter template builds; community templates; setup. |
| `text/` | Text layout and animators. |
| `tiles/` | Tile model, copy with alpha, export and edit. `godot-tiles-e2e` needs `GODOT_BIN`. |
| `timeline/` | Timeline ops, geometry, playback, play range, hold until next, tween offer, the detailed timeline and both panels. |
| `tools/` | Brush, selection, shapes, merge mode, wells, hold drawing, drawing gaps, follow-ups. |
| `ui/` | Dock (model, live state and workspaces, floating windows and dragging), right dock, panelInfo, tab fitting, menus, keyboard and keys, palette, themes, sounds, onboarding, Quill (runtime, view, goodbye, lines), starters, example cards, and the help checks. |
| top level | `smoke.test.ts` (package targets), `core.test.ts` (store, undo, registries), `case-sensitive-imports.test.ts`. |

Godot checks inside vitest:

```bash
GODOT_BIN=/path/to/godot-4-editor npx vitest run test/export/godot-e2e
```

### Help audit

```bash
npm run help:audit
```

Runs `test/ui/help-audit.test.ts`, `help-media.test.ts` and `help-words.test.ts` (all three are part of `npm test`
too) and prints the full report. Fails when:

- a command has no help topic;
- a topic has no picture or clip, or names a file missing from `public/help/`: a topic names a base file (`select.png`)
  and both `select-dark.png` and `select-light.png` have to exist (a clip also needs `tour-dark-poster.png` and
  `tour-light-poster.png`);
- a file in `public/help/` isn't used by any topic (a video's poster counts as used);
- a `help:` link points at a topic or heading that doesn't exist;
- a topic names a shortcut no command has any more (keys from `KEYMAP_SETS` and a few browser keys are allowed);
- a topic is over 500 words (over 400 is listed in the report).

`help-words.test.ts` checks the plain words people type ("rubber", "lost my work") bring up the right topic in the
top three. Add a pair there when someone can't find something. The audit logic is `src/ui/help/audit.ts`.

### Shortcut clash test

`test/a11y/shortcuts.test.ts`: no two commands share a default shortcut where both can work (two tools may share a
letter when they belong to different layer kinds, like the Brush and the Tile brush on B), every command has a plain
name for the palette, and each shortcut set in `src/ui/keymapSets.ts` is clash-free, names only real commands, and
keeps the person's own changes on top. The clash logic is `allConflicts` and `sameContext` in `src/ui/keys.ts`.

### Case-sensitive imports

`test/case-sensitive-imports.test.ts` checks every relative import in `src/` and `test/` names the file with exactly
the letter case on disk. Windows and macOS don't care, Linux does, so this catches it before the Linux build breaks.

### Quill's lines

`test/ui/quill-lines.test.ts` checks every line in `src/ui/mascot/lines.json` is used, every id the code uses exists,
and placeholders match.

## Build first

Every Electron harness except `vector-check.cjs` loads `dist/`, so build first:

```bash
npm run build      # build:mascot, typecheck, vite build (dist/renderer), main and preload (dist/main, dist/preload)
```

## Export end to end: scripts/e2e/export.cjs

Starts the real main process (`dist/main/main.cjs`) with `FRAMELING_AUTOMATION_DIR` set, so save dialogs answer
themselves, loads the renderer with `?debug`, runs the same `exportDocument()` the Export dialog does, then checks every
output with real tools. Also saves, opens, autosaves and closes. Uses a throwaway user-data folder inside the output
folder, so it never touches real settings.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/export.cjs [outDir] [options]
```

| Option | |
|---|---|
| `outDir` | Where outputs and `report.json` go (default: a new folder in the system temp dir). |
| `--only=gif,mp4` | Only these formats: `png svg pngseq apng gif mp4 webm sheet interactives psd pdf ai prores godot-bones`. |
| `--templates=a,b` | Only these templates: `bouncing-ball hero-sprites blank-vector blank-pixel bouncing-logo stress kitchen-sink`. |
| `--skip=files` | Skip save/open/autosave/close. `--skip=godot` skips the Godot checks. |
| `--show` | Leave the window visible. |
| `GODOT_BIN=/path/to/godot-4-editor` | Also load the sprite sheet exports and the Godot bones export in Godot and compare frames. |
| `UNITY_BIN=/path/to/Unity/Editor/Unity` | Also compile the Unity importer script and import the Unity sprite sheet in a throwaway project (see below). `--skip=unity` skips it. |

Each format runs with defaults, see-through, and (for animated ones) a clip range; PSD, PDF, `.ai` and ProRes also run
their layered cases. Needs `ffprobe`, `ffmpeg`, ImageMagick (`convert`, `compare`), `rsvg-convert`, `xmllint` and
`unzip` on PATH; a missing tool skips its checks and says so. Exits non-zero on any failure. Gives up after 55 minutes.

### Unity check

```bash
UNITY_BIN=/mnt/109313D2109313D2/unity-editors/6000.6.4f1/Editor/Unity \
  xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/export.cjs --only=sheet --templates=hero-sprites,bouncing-ball --skip=files
```

For the `unity` sheet case of `hero-sprites` and `bouncing-ball`, it makes a throwaway project in the output folder
(`_unity-project`, with the 2D Sprite package added), drops the exported picture, json and `FramelingSheetImporter.cs`
into its Assets plus the test script `scripts/e2e/unity/FramelingSheetCheck.cs`, and runs Unity in batch mode. Unity
compiles the importer and imports the sheet, then the test script checks the texture settings (sprite mode, pixels per
unit, no resize), every sprite's rect and pivot, and every animation clip (key count, key times, frame rate, loop, length).
It also plays each clip on a real Animator and checks which sprite shows on every tick, then changes the json, imports the
picture again and checks the clips follow and the sprite ids stay the same. Logs and reports are in the case's folder
(`unity-*.log`, `unity-report-*.txt`). Takes a few minutes, mostly Unity starting up. The Unity editor must be
installed and licensed for the user running the check.

## Effects pixels: scripts/e2e/effects.cjs

Renders tiny documents through the single renderer in a real Chromium canvas and compares pixels with values worked
out by hand: blend modes, clipping, masks, folders, effects.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/effects.cjs
```

## Vector exports against the renderer: scripts/e2e/vector-check.cjs

Renders test documents (Bouncing logo, a shape tween with hints, a camera move with parallax, the Bouncing ball, a pixel
layer) three ways: `renderFrame`, lottie-web from `docToLottie`, and Chromium's SVG from `animatedSvg`. Prints the mean
difference and the share of pixels off by more than 48, and fails when a frame is far off. Needs no build: the page
(`vector-check-page.ts`) is bundled with esbuild on the spot. `ONLY=a,b` limits the cases.

```bash
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/vector-check.cjs [outDir]
```

## Artboards end to end: scripts/e2e/artboards.cjs

Builds a two-artboard document of different sizes (320 x 180 red and 200 x 200 green, with a shape hanging off the
stage) and runs every artboard export through the real app: this artboard, each into a folder, each into one zip, a
subset, the sprite sheet atlas, and all in order as one with Fit and with Fill (PNG sequence, GIF, MP4, WebM). Outputs
are read back with ImageMagick, ffprobe and unzip: sizes, zip contents, atlas JSON, and pixel colours (the bars, the
crop, what is hidden off the stage). Then it clicks with real mouse events (Select and Brush, and a name label) to
check the open artboard, the stage and the Timeline panel follow, and that Undo goes back.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/artboards.cjs [outDir]
```

## Plugin sandbox: scripts/e2e/plugins.cjs

Checks the sandbox page blocks network and storage, the frame can't reach the app, and both example plugins in
`plugins/examples/` install, run, edit with undo, and export.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/plugins.cjs
```

For the web build, serve it and point the harness at it:

```bash
npm run build:web && npm run preview:web      # serves http://localhost:5198
PLUGINS_URL=http://localhost:5198/ xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/plugins.cjs
```

## Accessibility: scripts/a11y.cjs

Opens every panel, every tool's options and every dialog, runs axe-core on each, and checks the keyboard (Tab reaches
things with a visible focus ring, Escape closes dialogs and focus goes back). Fresh profile per run. Exits 1 on any
axe "serious" or "critical" result or a keyboard failure.

```bash
xvfb-run -a -s "-screen 0 1600x1000x24" npm run a11y          # builds, then runs
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/a11y.cjs [--json out.json] [--themes] [--only name,name]
```

`--themes` also runs axe's colour contrast rule in every built-in theme. `A11Y_SHOW=1` puts the window on screen
(the virtual one, under xvfb). `AXE_CORE=<folder>` points at an axe-core install elsewhere.

## Performance: scripts/perf/

Full details, options and how to read the numbers are in `scripts/perf/README.md`. Results go in
`scripts/perf/results/`.

`run.cjs`: real input events, real GPU canvas, numbers as JSON. Tests: `draw`, `playback`, `rigfx`, `templates`,
`zoompan`, `memory`, and `soak` (only when named in `--only`; about four minutes, `PERF_SOAK_ROUNDS` sets the rounds).

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/run.cjs --label after --out scripts/perf/results/after.json [--only draw,playback]
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/run.cjs --only soak --out scripts/perf/results/soak.json
node scripts/perf/compare.cjs scripts/perf/results/before.json scripts/perf/results/after.json
```

Environment: `PERF_RENDERER=<dir>` (measure a renderer built elsewhere with `npx vite build --outDir <dir>`),
`PERF_CPU_SLOWDOWN=4`, `PERF_SHOW=1`, `PERF_HIDDEN=1`.

`startup.cjs`: launches the built app as a fresh process again and again and times launch to the
`frameling:interactive` mark (set in `src/renderer/App.tsx`), plus the JS needed before start. It starts Electron
through `launch.cjs`, which parks every window off-screen.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/perf/startup.cjs --out scripts/perf/results/startup-desktop.json
npx vite build --config vite.web.config.ts
xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/perf/startup.cjs --web --out scripts/perf/results/startup-web.json
```

Options: `--runs N` (default 7), `--cpu N` (default 4). `--web` serves `dist/web` from a sub-path, then reloads offline
through the service worker.

## Screenshots: scripts/shoot.cjs

Screenshots of the built app for A/Bs, docs and checks. It answers the main process's file, autosave, recent and
library calls itself, so no real main process runs and nothing on disk changes.

```bash
npm run build
SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/shoot.cjs <outDir> [variant ...]
```

A variant is `name:look:theme[:steps.json]`, for example `cosy-dark:cosy:dark`. With none, one `default` shot. The steps
file is a JSON array run in order with real input events:

| Step | |
|---|---|
| `{"eval": "js"}` | Run JavaScript in the page. |
| `{"click": [x, y]}` | Left click at window coordinates. |
| `{"drag": [[x, y], ...], "steps": 6}` | Press, move through the points, release. |
| `{"down": [x, y]}`, `{"move": [x, y]}`, `{"up": [x, y]}` | For shots mid-drag. |
| `{"key": "g", "mods": ["control"]}` | A key press (Electron keyCode names). |
| `{"wait": 300}` | Milliseconds. |
| `{"shot": "name"}` | An extra screenshot part way. |

Environment: `SHOT_SHOW=1` puts the window on the screen (use it under xvfb); `SHOT_SCALE=2` shoots at twice the
pixel density; `SHOT_LOG=1` prints console errors as they happen; `SHOT_W`, `SHOT_H` set the window size (default 1400
x 900). Console errors are printed after each shot anyway. A step can open a real file with
`{"eval": "__framelingIo.openPath('/abs/path.frameling')"}`.

## Help pictures and clips: scripts/docs/record.cjs and encode.sh

`record.cjs` captures the pictures and short clips for the in-app help, from the built renderer, with the same steps
as `shoot.cjs` plus cropping and frame recording.

```bash
npm run build
SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/record.cjs <outDir> <steps.json> \
  --prefs '{"showWelcome":false,"reduceMotion":true}' [--renderer <dir>] [--look cosy] [--theme dark]
scripts/docs/encode.sh <outDir>/<clip> <name> [posterFrame] [width]
```

Extra steps: `{"log": "js"}` prints a result; `{"drag": ..., "delay": 8, "mods": ["shift"]}` draws slowly with keys held;
`{"shot": "name", "crop": [x, y, w, h]}` or `"el": "css selector", "pad": 12`; `{"type": "text"}` sets the focused
input; `{"rec": "name", "crop": [...], "every": 60}` starts recording frames and `{"rec": "stop"}` writes them with a
timing list into `<outDir>/<name>/`. `--renderer` points at a private `vite build --outDir` so a capture never races
someone else's build. Preferences go into `localStorage` (`frameling.prefs.v1`) and the page reloads. `SHOT_W`,
`SHOT_H` (default 1280 x 800) and `SHOT_WAIT` (ms before the steps, default 3000) apply. Its window is hidden
(`show: false`, painting anyway), so it doesn't read `SHOT_SHOW` today; the variable is in the command for consistency.

`encode.sh` turns a recorded folder into `public/help/<name>.mp4` (H.264, yuv420p, 30 fps, at most 800 px wide by
default, at the real pace from the timing list) and `public/help/<name>-poster.png` (the last frame unless one is
given). Always H.264: the people this is for can't play AV1. Needs `ffmpeg` and ImageMagick.

Then register the file on the topic (`media:` in its `registerHelp`) and run `npm run help:audit`. (For help media use
`help-media.cjs` below instead of running these two by hand: it makes both the dark and the light files.)

### Help media in dark and light: scripts/docs/help-media.cjs

Every help picture and clip exists twice, `<name>-dark.<ext>` and `<name>-light.<ext>` (a clip's poster is
`<name>-dark-poster.png` and `<name>-light-poster.png`). A topic's `media` names the base file (`select.png`,
`tour.mp4`); there are no base files in `public/help/`. The help browser (`src/ui/help/media.tsx`) adds the suffix for the
mode the app is in (`effectiveTheme()`), and switches live: when the Dark / Light / Auto setting changes, and when Auto
follows the computer going dark or light.

One command regenerates all of them, both themes:

```bash
npm run help:media                        # npm run build, then every entry in dark and light, inside xvfb
npm run help:media -- --only select,tour  # just those names (base names, no extension)
npm run help:media -- --theme light       # one theme only
npm run help:media -- --list              # every entry and whether it is a picture or a clip
```

It runs the steps in `scripts/docs/help/*.cjs` (one file per area; files starting with `_` aren't entries). Each entry is
`{ name, steps, prefs?, size?, width?, poster?, wait? }`: `name` is the topic's media base name, `steps` are the
`record.cjs` steps (`{"shot": "@"}` saves the picture, `{"rec": "@", "crop": [...], "every": 60}` ... `{"rec": "stop"}`
records the clip; `@` means the entry's name). The same steps run once per theme in a fresh page, with that mode's default
theme (Midnight sketchbook for dark, Paper and honey for light), the welcome sheet off, and everything else as a new
person has it, so the pair differs only in colour. Pictures and posters are scaled to 800 px wide at most (`width` changes it) and saved as 256 colour PNGs (a third the size, no visible loss on UI),
clips go through `encode.sh` (H.264, yuv420p, under 1 MB each). Run the script under xvfb like everything else: the npm
script already does. `--renderer <dir>` uses a private `vite build --outDir`; `--out <dir>` writes elsewhere.

`test/ui/help-media.test.ts` fails when a topic's media has no entry (so it can't be shot again), when an entry is for no
topic, or when a file is missing, unused or too big. To add help media for a new topic: write the entry, run
`npm run help:media -- --only <name>`, look at both files, then set `media: '<name>.png'` on the topic.

## Quill's dialogue

```bash
npm run dialogue:page                                   # rebuild brand/dialogue/index.html from lines.json
xvfb-run -a -s "-screen 0 1600x1000x24" npm run dialogue:shots    # build, retake every shot, rebuild the page (~2 min)
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/dialogue/shots.cjs [group ...]   # some groups, current build
npm run dialogue:apply <changes.json> [--check]         # merge edits from the review page into lines.json
```

`shots.cjs` saves one cropped shot per line id into `brand/dialogue/shots/` and notes into `manifest.json` there.
It honours `SHOT_SHOW=1`. `apply.mjs` refuses the whole file if a line lost or gained a `{placeholder}` or names a line
that doesn't exist. The workflow is in the README.

## The mascot build

```bash
npm run build:mascot
```

Reads `brand/mascot/mascot.frameling` and `mascot-icon.frameling` with the app's own reader and writes
`public/mascot/mascot.png` + `mascot.json`, `build/icon.png`, `build/icon.svg`, `build/icons/` and
`public/mascot/logo.png`, touching only files whose bytes changed. `npm run build` and `npm run build:web` run it first.
`test/io/mascot-source.test.ts` checks the source files still load.

## The off-screen window and ?debug hooks

A truly hidden Electron window only gets about one animation frame a second, so the canvas and React lag and shots
go stale. `shoot.cjs`, `dialogue/shots.cjs` and `perf/launch.cjs` open a real, unfocusable window parked at x = -4000
instead (`SHOT_SHOW=1` or `PERF_SHOW=1` puts it on screen), with `backgroundThrottling: false`. `record.cjs` uses a
hidden window with `paintWhenInitiallyHidden`. Under xvfb none of this matters to anyone's desktop, which is the point
of the display rule.

Harnesses load the renderer with `?debug`. `src/renderer/main.tsx` then loads `src/renderer/debug.ts` and each area's
own `debug.ts`, which put test hooks on `window`. None of it is in the normal start-up download.

| Global | From | What |
|---|---|---|
| `__frameling` | `src/renderer/debug.ts` | `store`, `run(commandId)`, `template(id)`, `prefs`, `commands()`, `panels()`, `tools()`, `showPanel`, `quests`, `quill`, `toast`, `recovery`, `overlays`, `rightStyle`, `themes()`, `anim` (grids, light table, tween offer), `tiles`, and more. |
| `__framelingExport` | `src/export/debug.ts` | Drives exports for `e2e/export.cjs` and `e2e/artboards.cjs`. |
| `__framelingIo` | `src/io/debug.ts` | Open a path, file helpers. |
| `__framelingEffects`, `__framelingTemplates`, `__framelingPlugins`, `__framelingArtboards`, `__framelingAudio` | each area's `debug.ts` or `index.ts` | Area hooks for its harness and help shots. |
| `__framelingCameraLook`, `__framelingRulerLook`, `__framelingGradientLook`, `__framelingHandleLook` | `src/camera/canvas.ts`, `src/canvas/Rulers.tsx`, `src/canvas/panels/GradientEditor.tsx`, `src/tools/point-handles.ts` | Swap a look for A/B shots. |
| `__framelingPerf` | `src/canvas/perf.ts` | Timings, only with `?perf`. |

`?debug` also keeps onboarding from opening on its own (`src/ui/onboarding/index.ts`).

## Installing on this Linux machine

```bash
npm run install-local                 # npm run dist:linux, then copy the AppImage
npm run install-local -- --no-build   # copy the last build
```

Copies the newest `release/*.AppImage` to `/mnt/109313D2109313D2/lutris-applications/frameling/frameling.AppImage`
(`FRAMELING_INSTALL_DIR` overrides), closing a running copy first if the file is busy. Linux only.

## CI

`.github/workflows/build.yml`, on every pull request into `main` and on demand:

- `build` (Linux, Windows, macOS): `npm ci`, `npm test`, `npm run build`, then `electron-builder` (AppImage; NSIS and
  portable; dmg for arm64 and x64), with Windows signed when `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` are set.
  Uploads `frameling-<OS>` artifacts, kept 14 days.
- `web`: `npm ci`, `npm test`, `npm run build:web`, uploads `frameling-web`.

CI runs vitest only. The Electron harnesses are run by hand, under xvfb, before merging work they cover.
