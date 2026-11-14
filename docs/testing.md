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
| `clips/` | How a clip plays (`src/core/clipPlay.ts`): the order of one pass, stepping, repeat counts, baking for formats without direction, reading a clip from a file. Exporters are in `export/clip-play.test.ts`. |
| `export/` | Every writer (APNG, GIF, sheet, SVG and animated SVG, Lottie, PDF, PSD, ProRes, YUV, playable, Godot, Godot add-on, Godot bones), the plan, capabilities, engine presets and fidelity. `*-e2e.test.ts` load the output in a real Godot 4 and are skipped unless `GODOT_BIN` is set. |
| `geometry/` | Fill, flood, merge, morph, pen, raster, tracing. |
| `integration/` | Whole-feature runs: the kitchen sink document, selecting mid-tween, nested editing, tiles inside symbols. |
| `interactives/` | The .flplay round trip. |
| `io/` | The .frameling file, PNG, sound in files, recovery, kept work, versions, save-as history, the user library (main side), cross-platform paths, reference layers, and that `brand/mascot/*.frameling` still load. |
| `lipsync/` | Audio analysis, mouth charts, applying to a symbol. |
| `particles/` | Emitter maths and determinism. |
| `perf/` | Work counting against a fake canvas (`fakeCanvas.ts`): cache hits, bitmap builds, look-ahead depth. Never asserts on time. |
| `pixel/` | Pixel tools, maths, paths, the pixel workspace. Picture import: `import-gif.test.ts` (the GIF reader against real GIFs in `test/fixtures/gif`, made by `scripts/fixtures/make-gif-fixtures.py` with Pillow, ImageMagick and ffmpeg, next to what Pillow says each frame is), `import-apng.test.ts` (the animated PNG reader against real files in `test/fixtures/apng`, made by `scripts/fixtures/make-apng-fixtures.py` with Pillow and ffmpeg, plus a hand-made file for blend-over and dispose-previous; interlaced (Adam7) APNG and still PNG files are in the same folder; animated WebP needs a real Chromium and is checked with and without ImageDecoder: `xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/webp-import.cjs`; `import-webp.test.ts` covers the pure-JS WebP demuxer and the frame compositing), `import-trim.test.ts` and `commit-rect.test.ts` (trimmed on build, dirty-rectangle commit; `test/perf/pixel-commit.test.ts` prints the 4000 x 4000 numbers), `session-tiles.test.ts` (the pixel session copies tiles on first touch and matches a whole-grid edit), `slice-keys.test.ts` (slices that change between frames), `slices-boards.test.tsx` (slices on every board and layer), `import-sheet.test.ts` (grid and gap slicing, sheet JSON, the four ways, adding to a drawing), `import-dialog.test.tsx`; slices: `slices.test.ts` (maths, file, Aseprite, the export text), `slices-ui.test.tsx` (tool and panel); `import-aseprite-bin.test.ts` needs `ASEPRITE_BIN`. `way.test.ts` (the four ways, conversions both directions, the file's `sprite.way`), `wells.test.ts` (Paint and Back, the Spray), `ways-flow.test.tsx` (Quill's chooser and starter cards, the Aseprite keys ask, the change dialog, the layout that follows the way, moments), `sheet-mode.test.ts`, `quests-ways.test.ts`. Under `?debug` the "ask once" pixel questions and Quill's moments are skipped so scripts are not blocked; `__framelingPixel.ask(true)` turns them back on for a picture of them (`src/pixel/harness.ts`). |
| `platform/` | The web bridge (IndexedDB through `fake-indexeddb`). |
| `plugins/` | Manifest checks, manager, ops, runtime and sandbox (with `harness.ts`). |
| `quests/` | Quest engine, groups, hooks, predicates, the library and the runtime. |
| `rig/` | Bone maths, posing, caches, stretch, weights. |
| `select/` | Pixel selection, masks, vector lasso. |
| `symbols/` | Motions and symbol and shape ops. |
| `templates/` | Every starter template builds; community templates; setup. |
| `text/` | Text layout and animators. |
| `aseprite/` | The Aseprite reader and importer: `writer.ts` writes .aseprite files chunk by chunk (every colour depth, cel type, palette chunk, tags, slices, user data, tilesets) and `import.test.ts` checks every pixel of the imported frames. `aseprite-bin.test.ts` needs `ASEPRITE_BIN`. |
| `tiles/` | Tile model, copy with alpha, export and edit. `godot-tiles-e2e` needs `GODOT_BIN`. |
| `timeline/` | Timeline ops, geometry, playback, play range, hold until next, tween offer, the detailed timeline and both panels. |
| `tools/` | Brush, selection, shapes, merge mode, wells, hold drawing, drawing gaps, follow-ups. |
| `nudge/` | The empty-page line and Quill's tip after the first drawing: when each shows, when it goes, when it stays quiet (Show Quill off, choice off, harness, playing, mid stroke), the three-times cap, Not now being remembered. Under `?debug` both stay quiet so existing pictures are unchanged; a capture turns them on with `window.__framelingAsk = true`. |
| `ui/` | Dock (model, live state and workspaces, stacked tab groups, floating windows and dragging, tool group names), right dock, panelInfo, tab fitting, menus, keyboard and keys, palette, themes, sounds, onboarding, Quill (runtime, view, goodbye, lines), starters, example cards, and the help checks. `ui/css-vars.test.ts` fails when a `var(--x)` in the CSS or in an inline style is not defined anywhere (a theme token, a stylesheet or a style prop), because an undefined one just takes its fallback. |
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
too) and prints the full report. The topics' words load on demand, so these tests `await loadHelpBodies()` first (do the
same in any test or script that reads `helpBody()` or runs `searchHelp`). Fails when:

- a command has no help topic;
- a topic has no picture or clip, or names a file missing from `public/help/`: a topic names a base file (`select.png`)
  and both `select-dark.png` and `select-light.png` have to exist (a clip also needs `tour-dark-poster.png` and
  `tour-light-poster.png`);
- a file in `public/help/` isn't used by any topic (a video's poster counts as used);
- a `help:` link points at a topic or heading that doesn't exist;
- a topic names a shortcut no command has any more (keys from `KEYMAP_SETS` and a few browser keys are allowed);
- a **Menu > Item** path in a topic's words isn't in the menus (the bar's own titles, submenus and **Preferences > Page >
  Row** all count; `Window` and the panel row's `⋯` button are left alone). `test/ui/menu-paths.test.ts` runs the same check over
  every topic, including hidden Interactives ones, and over every other string in `src/` (tips, quests, hints), with
  Interactives on. Write a path in bold with ` > ` between the parts, spelled as the menu says it (a trailing `...` and a
  bracketed aside are optional). The failure says where the thing moved to. Logic: `src/ui/help/menuPaths.ts`;
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

### Random operations (fuzz): test/artboards/fuzz.test.ts

Runs seeded random lists of 22 operations (variations made, opened, detached, resized and recoloured, artboards
duplicated and deleted, keys added, moved and painted, palette colours changed, timeline edits, undo and redo) and
checks three things after each list: undo and redo round-trip back to the start and the end, saving and reopening
gives the same pictures on every artboard, and editing a variation never changes its original (the variations are
also checked to be in step after every operation). The seeds are fixed, so a failure repeats; the message names the
seed and a shrunk list of operations. `npm test` runs 1000 lists (about 3 seconds). The big run:

```sh
FUZZ_RUNS=25000 npx vitest run test/artboards/fuzz.test.ts   # about a minute
FUZZ_SEED=2211 npx vitest run test/artboards/fuzz.test.ts    # repeat just one seed
```

The shrunk list reads `name(n,m)`, one step each: `apply` in the same file shows what each does.

## Lip sync accuracy: scripts/lipsync/

Measures the mouth guesser against speech with known phoneme timing, offline. Nothing here is part of `npm test` (the
tests use two small committed fixtures in `test/lipsync/fixtures/`).

```bash
python3 scripts/lipsync/make_refs.py /tmp/refs        # libespeak-ng + libflite via ctypes: wavs and phoneme timing
node scripts/lipsync/eval.mjs /tmp/refs [--fps 24] [--text] [--src old/analysis.ts] [--confusion] [--voices slt,kal]
node scripts/lipsync/train.mjs /tmp/refs --hidden 128 --epochs 25   # rewrites src/lipsync/model.ts
```

`eval.mjs` reports frame accuracy, shape accuracy on spoken frames, rest/speech agreement, how close each mouth change
is to the true one, flicker (changes per true change) and lip-closure recall and precision, on the training lines, the
held-out lines and a noisy copy of those. `--src` scores another copy of `analysis.ts` (for before and after).
The model is trained only on the `train` split, so the `held` split stays honest; `--exclude-voices` on train.mjs plus
`--voices` on eval.mjs measures voices it has never heard. `ab_data.mjs` and `ab_clip.py` make the before/after clip.
`eval.mjs --text` hands over the typed words too, read with the pronunciation list (`--no-dict` for the spelling guide alone;
`--tune textWeight=0.3` tries another blend weight). The synthetic references share their pronunciations with the list
(flite's are the same CMU entries), so read the espeak rows for the fairest typed-words numbers.

### Pronunciation list for typed words

`src/lipsync/dict-data.ts` is generated, never edited: `python3 scripts/lipsync/make_dict.py /usr/share/dict/american-english /tmp/full.json`
(CMU Pronouncing Dictionary as compiled into libflite, BSD-style licence, mapped to the ten mouths; lower-case words up to
11 letters and capitalised names up to 6), then `node scripts/lipsync/pack_dict.mjs /tmp/full.json`, which keeps only the words the
spelling guide plus the endings rules (`src/lipsync/words.ts`) get wrong (about 47%, 296 KB). Rerun both when the guide in
`text.ts` or the rules in `words.ts` change. It is loaded with `import()` only when words are typed (`dict.ts`), so it is its own chunk.
espeak-ng was not used for the list: its dictionary data is GPL-3 and whether generated tables are free of that is unclear.

`real_refs.py <out> <recording.wav> "words" ...` builds reference timing for a real recording by warping an espeak
reading of the transcript onto it (DTW on mel features; good to a few frames). Keep recordings out of the repository;
`eval.mjs <out> --text` scores them under "real speech".

## Build first

Every Electron harness except `vector-check.cjs` loads `dist/`, so build first:

```bash
npm run build      # build:mascot, typecheck, vite build (dist/renderer), main and preload (dist/main, dist/preload)
```

## Artboard drags: scripts/e2e/artboard-drag.cjs

Real mouse events with the Artboard tool (move, resize from a corner, drag out a new artboard) on the demo documents,
checking mid-drag and after the drop that nothing but the artboards, their names and the tool's own ghost box is painted on
the pasteboard (no stale stage-coloured rectangle). Needs `npm run build` first.

```
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/artboard-drag.cjs
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
| `--only=gif,mp4` | Only these formats: `png svg pngseq apng gif mp4 webm sheet interactives psd pdf ai prores godot-bones svganim`. |
| `--templates=a,b` | Only these templates: `bouncing-ball hero-sprites blank-vector blank-pixel bouncing-logo stress kitchen-sink`. |
| `--skip=files` | Skip save/open/autosave/close. `--skip=godot` skips the Godot checks. |
| `--show` | Leave the window visible. |
| `GODOT_BIN=/path/to/godot-4-editor` | Also load the sprite sheet exports and the Godot bones export in Godot and compare frames. |
| `WEB_ENGINES=1` | Also load the Phaser, PixiJS and CSS sprite sheet exports in the real engines (see below). `--skip=web` skips it. |
| `--cases=phaser,css-grid` | Only cases with these labels (the word after the format in the report). |
| `UNITY_BIN=/path/to/Unity/Editor/Unity` | Also compile the Unity importer script and import the Unity sprite sheet in a throwaway project (see below). `--skip=unity` skips it. |

Each format runs with defaults, see-through, and (for animated ones) a clip range; PSD, PDF, `.ai` and ProRes also run
their layered cases. Needs `ffprobe`, `ffmpeg`, ImageMagick (`convert`, `compare`), `rsvg-convert`, `xmllint` and
`unzip` on PATH; a missing tool skips its checks and says so. Exits non-zero on any failure. Gives up after 55 minutes.

### Web engines check (Phaser, PixiJS, CSS)

```bash
WEB_ENGINES=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/export.cjs --only=sheet --templates=hero-sprites,bouncing-ball --skip=files
# or just the web cases:
WEB_ENGINES=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/export.cjs --only=sheet --templates=hero-sprites,bouncing-ball --skip=files \
  --cases=phaser,pixi,css,phaser-grid,pixi-grid,css-grid,phaser-clips,pixi-clips,css-clips,css-names,phaser-names,pixi-names,css-separate
```

Loads the exported sheets in the real thing, in a window on the virtual display (it has to be shown: a hidden window stops
WebGL animation frames). Phaser 3.90.0, Phaser 4.2.1 and PixiJS 8.23.0 are pinned in `scripts/e2e/web-engines/engines.cjs`. The first run
downloads each package from the npm registry, checks it against the pinned sha512, and unpacks its browser build into
`~/.cache/frameling-web-engines` (override with `WEB_ENGINES_DIR`), so nothing goes into `package.json`. The check
serves the export folder over http on 127.0.0.1 and loads it the way a web page would, with the code from the help topics.
Chromium needs `ignore-gpu-blocklist`, or WebGL is refused on a virtual display; `enable-unsafe-webgpu`
adds WebGPU, which Electron 45 (Chromium 156) then has on the software Vulkan driver. Both come from
`gpu.use('software', { webgpu: true })` (scripts/lib/gpu.cjs), which leaves out `use-angle swiftshader` and `use-gl angle`:
with them the GPU process drops the WebGPU device.

Cases that set `allRenderers` (`play-*`, `hero-sprites` `*-grid`, `scaled*`, the plain `phaser` and `pixi` cases) load the sheet in
every renderer: Phaser 3.90 and 4.2.1, each in WebGL and canvas, and PixiJS 8 in WebGL and WebGPU. WebGPU is probed in the
page first; with no adapter the run says "PixiJS WebGPU skipped: ..." and goes on. Phaser's canvas renderer is checked with a
looser limit (mean under 10 of 255) and the report says how many frames were not pixel-exact: a plain `drawImage` of the same
atlas is exact, so the difference is in the engine's canvas drawing (scaled and trimmed sprites). Looked into (`scaled2x-phaser`, Phaser 3.90 and 4.2.1): the canvas picture of a trimmed sprite shown at 2x is one pixel wider and taller
than Frameling's (about 260 of 4096 pixels per frame, 0.5x is within 25 levels). `roundPixels`, `pixelArt` off and `antialias` off change
nothing, so there is no game setting for it and the Phaser help recommends WebGL for pixel art. To try a setting on the harness:
`PHASER_RENDER='{"roundPixels":true}' PHASER_STRICT=1` (adds to the game's `render` config and holds the canvas renderer to the exact limit,
saving the failing pictures as `_web-fail-*.png`).

| Engine | What is checked |
|---|---|
| Phaser | `load.atlas` and `load.animation` finish with no missing file; the texture's frame names are the atlas's; every animation exists with the right frame count, `frameRate`, `repeat` (-1 or 0), and length; each frame's pixels (sprite at 0,0 in a canvas of the export size) equal Frameling's own PNG of that document frame; then each animation is really played: frames come in order, one pass takes frames / fps (within 60 ms or 8%), a loop repeats, a clip that does not loop completes and stays on its last frame. |
| PixiJS | `Assets.load` of the json gives the same frame names and animations; `meta.frameling.animations` has the fps, loop and `animationSpeed` (fps / 60); the AnimatedSprite frames equal Frameling's PNGs; played from PixiJS's shared ticker for order, one-pass time, loop, and stopping on the last frame when it does not loop. |
| CSS | The css loads, with the class and keyframes names the first line of the file promises; each animation is paused and set to the middle and the very start of every frame with the Web Animations API (`currentTime`), screenshotted and compared with the PNG; duration, iterations and `fill` are read back; past the end a loop starts again and a clip that does not loop holds its last frame; the exported html page runs the same animations. Separate sprites: each class is screenshotted. |

Pixel samples are compared over mid grey, and pass with a mean difference under 0.3 of 255 and (almost) no pixel off by
more than 8. All three engines are held to the same standard: a worst mean of 0.000 to 0.006 was measured. Every check reads
back what it loaded, so a problem in the export shows as a named failure (`idle[2]: drew 512x512 ...`). A page asking for a
file the export did not write is a failure too. On failure the picture the engine drew is saved next to the export as
`_web-fail-*.png`. The cases per template are the engine defaults (`phaser`, `pixi`, `css`: packed, trimmed), `-grid` (no trim, no dedupe, power of
two, see-through), `-clips` and `-names` (extra clips, one that does not loop, awkward names), and `css-separate`. Timing is
real time, so each animation gets three goes and passes if one is within the limits.

Two more groups of cases (hero and bouncing ball, in all three engines):

- `scaled2x-<engine>` (art-size sheet) and `scaled0.5x-<engine>` (full-size sheet): the sprite is drawn at 2x and 0.5x with
  nearest-neighbour filtering (Phaser `pixelArt`, PixiJS `scaleMode = 'nearest'`, CSS `image-rendering: pixelated` with
  `zoom`) and compared with the frame scaled by ImageMagick's point filter. Packed, trimmed, padding 2, extrude 1.
- `fps12.5-<engine>` and `fps23.976-<engine>` (with the play clips): the document's frame rate is not a whole number (the
  Settings box only takes whole ones; a file or a plugin can carry any). Phaser's `frameRate`, PixiJS's `animationSpeed` and
  the CSS durations must still give frames / fps. `gif`, `apng`, `mp4` and `webm` have `fps12.5` and `fps23.976` cases too
  (GIF keeps the total time with whole 1/100 s delays, APNG with whole milliseconds, video stores the rate).

### Clips that play another way (direction and repeat)

`export.cjs` adds these cases for `bouncing-ball` (its own clips are cleared first; the clips are `PLAY_CLIPS`: `swing`
back and forth and looping, `thrice` forward 3 times, `back` backward once, `plain` a loop):

- `sheet`: `play-godot` (real Godot with `GODOT_BIN`: every animation's frames and `loop`), `play-json`, `play-unity` (the
  json's picture order, loop and direction; with `UNITY_BIN` the clips are imported and played on a real Animator, and
  `FramelingSheetCheck.cs` also checks the wrap mode), and with `WEB_ENGINES=1` `play-phaser`, `play-pixi`, `play-css`.
  Phaser must read `repeat` 2 for `thrice` (one pass, N - 1), CSS `iteration-count` 3, and every frame of every
  animation is compared with the app's own PNG of the document frame the rules say it shows.
  `play-godot` also plays every animation on an AnimatedSprite2D in real Godot (`--fixed-fps`, one run per animation) and
  compares the picture at each tick with the order the clip should play.
- Back and forth counts each direction as one repeat, so `BOUNCE_CLIPS` (16 frames, one clip each, no overlap) has `swing`
  (loops), `swingback` (loops from the end), `bounce2` (there and back) and `bounce3` (there, back, there): cases
  `bounce-godot`, `bounce-unity`, `bounce-phaser`, `bounce-pixi`, `bounce-css`, and with the preference "Back-and-forth
  clips in game engines" set to the engine's own ping-pong (`setChoice('export.clipEngineBounce', 'engine')`)
  `bounce-godot-native` (SpriteFrames `"loop": 2`: one direction listed, and real Godot shows the end frames twice) and
  `bounce-phaser-native` (`yoyo`: one direction listed, `repeat` N - 1 round trips, and real Phaser 3.90 plays the same
  order as the baked list). `--only=godot-bones-bounce` loads the skeleton export in Godot and reads the
  AnimationPlayer: baked is a loop of 2n - 2 frames (mode 1), native is `loop_mode = 2` over n frames and the animation
  time goes up and back down; a clip with a set number of directions stays baked.
- `godot-bones`: loads each Godot bones case in real Godot and compares five frames with Frameling's PNG (rmse) plus single-pixel
  probes. `--section=bones-nested-fade,bones-blend-subtract` runs just those cases (`bones-blend-linear-dodge`, `-subtract` and
  `-divide` check the blend shader; `bones-nested-fade` the fade inside a tinted fade). Probes with `compatTol` run twice: on the
  Compatibility renderer (OpenGL) with that looser tolerance, because its CanvasGroup buffer keeps alpha in 4 steps (RGB10_A2) while
  the window is opaque, and on the Mobile renderer (Vulkan, skipped with a note when it cannot start) with `tol`.
- `gif`, `apng`, `mp4`, `webm`: `clip-pingpong`, `clip-pingpong-reverse`, `clip-bounce2`, `clip-bounce3`, `clip-repeat3`,
  `clip-backward` export one clip and check that picture k is the document frame the order rules give. `pngseq` runs the
  same cases and holds each frame once, in the order the clip starts (`stillOrder`), whatever the repeat. The loop flag of a
  GIF or APNG follows the clip unless the box was changed by hand.

- `svganim` (the Moving SVG): `clip-pingpong`, `clip-repeat3`, `clip-backward`, `defaults` for bouncing-ball, and `defaults`
  for the Explosion template, played for real. The SVG is put in a web page over white in a Chromium window, its CSS animations
  are paused and set to the middle of each moment with the Web Animations API, and the window is photographed. Each picture
  must match the app's PNG of the document frame that moment shows (so the clip is checked in play order, rmse under 0.02,
  and nearer its own frame than the ones next to it); after the end a loop starts over and anything else holds its last
  frame; durations and iteration counts are read back. Smoke puffs are radial gradients in SVG, matching the app's soft falloff,
  so the Explosion uses the same limit.

The expected order is written out again in `export.cjs` (`oracleOrder`, from `docs/format.md`), not taken from the
app's code, and the app's own export plan has to agree with it.

### Unity check

```bash
UNITY_BIN=/mnt/109313D2109313D2/unity-editors/6000.6.4f1/Editor/Unity \
  xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/export.cjs --only=sheet --templates=hero-sprites,bouncing-ball --skip=files
```

For the `unity` sheet case of `hero-sprites` and `bouncing-ball` (and a `unity-noclips` case, separate sprites with no
animations, on `bouncing-ball`), it makes two throwaway projects in the output folder: `_unity-project-older`, the default
3D template as Unity makes it (no 2D Sprite package), and `_unity-project`, a copy with the 2D Sprite package added.
In each it drops the exported picture and json in `Assets/Frameling`, and `FramelingSheetImporter.cs`, its `.asmdef` and the
test script `scripts/e2e/unity/FramelingSheetCheck.cs` in `Assets/Importer`, and runs Unity in batch mode. Unity
compiles the importer (which must work with and without the package, and the test checks which cutting path it took)
and imports the sheet, then the test script checks the texture settings (sprite mode, pixels per
unit, no resize), every sprite's rect and pivot, and every animation clip (key count, key times, frame rate, loop, length);
a sheet with no animations must leave no `.anim` files.
It also plays each clip on a real Animator and checks which sprite shows on every tick, then changes the json, imports the
picture again and checks the clips follow and the sprite ids stay the same. Logs and reports are in the case's folder
(`unity-*.log`, `unity-report-*.txt`). Takes several minutes, mostly Unity starting up. The Unity editor must be
installed and licensed for the user running the check.

## Illustrator end to end: scripts/e2e/illustrator.cjs

Opens Frameling's `.ai` exports in a real Adobe Illustrator and compares what Illustrator finds with what Frameling
wrote and with Frameling's own PNG of the same frame. Opt in: it needs Illustrator installed under Wine, so it only runs
the Illustrator half when `ILLUSTRATOR_PREFIX` is set (without it, it writes the `.ai` files and PNGs and stops).

```bash
npm run build
ILLUSTRATOR_PREFIX=/path/to/wine/prefix xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/illustrator.cjs [outDir] [--only=a,b]
```

| | |
|---|---|
| `ILLUSTRATOR_PREFIX` | The Wine prefix Illustrator is installed in (the folder with `drive_c`). |
| `WINE_RUNNER` | The Wine build to run it with (a folder with `bin/wine`). Found from the Lutris game file for the prefix when not set. |
| `--only=a,b` | Cases: `layers-folders nested-folders hidden-layers hidden-in-effect-folder paths gradients gradients-pdf masks text text-live text-big symbols frames frames-files frames-artboards frames-one scale2-transparent artboards stress kitchen-sink bouncing-ball bouncing-logo`. |
| `--keep-going` | Run even if something already runs in the prefix (never when someone may be using Illustrator). |

It refuses to start when any process has the prefix as its `WINEPREFIX`. Illustrator runs in a Wine virtual desktop
inside the xvfb screen, started the way Lutris starts it (DXVK in the prefix, `dxgi` native then builtin), with an
ExtendScript (`illustrator-check.jsx`) passed as the file to open. A screenshot loop presses the two boxes that would
block it (the "quit unexpectedly" box after an unclean exit, and "You are about to run the script": Continue). The
script opens each file (through Illustrator's PDF import settings for the page, which it puts back afterwards),
records artboards, layers (with sublayers and opacity), groups, item counts, fills and strokes, exports a PNG of the
artboard asked for and quits. Outputs in `outDir`: the `.ai` and PNG files per case, Illustrator's PNGs,
`side-by-side/*.png` (Frameling left, Illustrator right) and `report.json`. A case fails when the artboard count or size
is wrong, a layer name, a folder's layers or a layer opacity is not there, a hidden layer shows, too few paths arrive, or
the picture is further from Frameling's than the case allows (RMSE). It takes about 10 minutes for every case;
Illustrator takes about 20 seconds to start. Cases with `expect.pdfReader` also draw the file's PDF part with `pdftoppm` (poppler) and compare it with Frameling's picture, which shows that layers switched off in the PDF part stay off in a reader that is not Illustrator (`hidden-layers`: hidden layers and folders must be hidden in Illustrator with their art in them, and absent from both pictures).

The cases cover the four ways an animation goes into `.ai` (`aiFrames` in the export settings): `frames-one` (this frame),
`frames-files` (a zip of one file per frame, each opened), `frames-artboards` (one file with an artboard per frame, each
artboard exported and compared), and `frames` / `gradients-pdf` (pages: a plain PDF, which Illustrator imports as groups
without layer names, so only the pictures are compared). Text is live Illustrator text in the data: `text-live` (Arial, which the Wine prefix has) checks each text frame's words, font, size, colour, tracking, alignment and place, and `text` does the same for Nunito, which Illustrator does not have (it keeps the font name and shows another font, so its picture limit is looser). `text-big` draws text at 4 times the size as "Pages" (a plain PDF, no live text) to show the letter outlines of the PDF part. `gradients` checks that a line painted with a gradient is a real gradient stroke, and `hidden-in-effect-folder` that hidden layers inside a folder with an effect stay as hidden layers.

What Illustrator does with the file: it holds Illustrator's own data (the page's `/PieceInfo /Illustrator /Private`
streams, written by `src/export/ai-native.ts`), so Illustrator opens it as its own document, with layers, sublayers,
artboards, gradients and opacity as real ones. Without that data (the "Pages" way) Illustrator reads it as a PDF import:
layer names are dropped (one "Layer 1", with a group per Frameling layer or folder keeping opacity and blend) and a file
with several pages asks "PDF Import Options". Probing the format: save a small file from Illustrator itself with an
ExtendScript (`doc.saveAs` with `Compatibility.ILLUSTRATOR17` and `compressed = false`) and read its `AIPrivateData`
streams; the layer, path, gradient and raster operators in `ai-native.ts` were worked out that way.

Live text (`ai-text.ts`) is in the setup part of the data, as `%AI11_BeginTextDocument` with one `/AI11TextDocument : /ASCII85Decode` block: the text engine's document, nested dictionaries with numbers for keys. Facts found by saving texts from Illustrator and decoding that block: whole numbers and reals are different types (a size written `36` is read as 36/65536, write `36.0`); the fill is a `/SimplePaint` with `[alpha r g b]` (a `/CAITextPaint` without its id string is ignored); each story has a text ending in a return, a character run, an optional paragraph run (`/0` is 0 left, 1 right, 2 centre) and a layout cache that may be an empty list (Illustrator lays the text out itself, but a missing cache key hangs it); each frame has an origin and a matrix `[a b c d tx ty]` in a y down space whose (0, 0) is the file's (0, 0) moved by the ruler origin (8191 less half the artboard, plus a half point). The layer item only says which story it is (`/AI11Text` with `/StoryIndex`). Probe by decoding with a small script: ASCII85 the lines after `/AI11TextDocument`, each with its leading `%` taken off.

## Colour and the engine: scripts/lib/gpu.cjs and scripts/e2e/colour.cjs

Every Electron harness picks its engine through `scripts/lib/gpu.cjs` (`gpu.use('software')` or `gpu.use('card')` before
ready, `gpu.confirmOrExit()` after), pins the colour profile to sRGB, and prints which engine it really got; a run that
asked for the card and got software fails. Speed claims (`perf/`) use the card, pixel comparisons use software.
`GPU_MODE=card|software` overrides. The colour proof is `scripts/e2e/colour.cjs`. Everything, with the numbers, is in
[colour-and-gpu.md](colour-and-gpu.md).

```bash
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/colour.cjs
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/lib/gpu-check.cjs card
```

## Effects pixels: scripts/e2e/effects.cjs

Renders tiny documents through the single renderer in a real Chromium canvas and compares pixels with values worked
out by hand: blend modes, clipping, masks, folders, effects.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/effects.cjs
```

## Shadow and glow softness per format: scripts/e2e/shadow-sigma.cjs

Draws a box with a Shadow or a Glow of several softness values in the editor (native canvas filter and the JS fallback)
and in SVG, Moving SVG, Lottie (lottie-web's SVG player, and the dotLottie player when `DOTLOTTIE_DIR` is set, see
dotlottie-check.cjs), PDF, .ai and PSD, then fits the blur's gaussian sigma from the pixels and prints one table. Fails when a
format is more than 0.6 px (or 12 percent) of sigma away from the editor. Needs no build. The mapping it found, pinned in
`test/export/shadow-sigma.test.ts`: Chromium's canvas `drop-shadow(x y b)` blurs with a sigma of b (not the CSS spec's b / 2),
Shadow softness is that sigma in SVG, Lottie's Softness is four times it (lottie-web and ThorVG use Softness / 4), Glow uses
size / 2 everywhere. Formats that bake the layer (PDF, .ai, PSD, PNG, video, sheets, Godot, Unity, Interactives) use the editor's
own renderer.

```bash
DOTLOTTIE_DIR=$PWD/pkg/package AMOUNTS=4,8,12,16 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/shadow-sigma.cjs [outDir]
```

## Shadow room in Lottie players: scripts/e2e/shadow-clip.cjs

lottie-web's SVG player cuts a Drop Shadow off at the layer's own box (its filter region is the bounding box of what the layer
draws), so a shadow thrown past a small drawing used to vanish; the dotLottie player (ThorVG) never had the problem. The writer
now gives a shadowed layer an invisible rectangle (`Shadow room`, fill opacity 0) the size of what the layer draws over the
frames plus the shadow's reach (`effectReach`, in `layersBox` and `shadowRoom` in `lottie.ts`); shape layers carry it inside,
pictures and symbol copies go in a precomp with a room layer (one per camera depth, so it moves with them). Pinned in
`test/export/lottie-shadow-room.test.ts`. The script plays small documents (a box, a dot, held drawings, a folder, a symbol copy, a pixel
layer, shadow with soften both ways round, a panning camera, zoomed and turning cameras) in the editor, lottie-web's SVG and canvas players and (with
`DOTLOTTIE_DIR`) the dotLottie player, saves a PNG of each, and prints the share of the editor's shadow ink each shows and the
RMSE against it. It fails when the SVG or dotLottie player shows under 85 percent or is more than 6 away. lottie-web's canvas
player ignores effects, so a shadow never shows there (reported only; "Draw Soften and Shadow as pictures" is the way).

Two more things it found. Behind a zooming or turning camera, both players scaled a shadow's distance and softness with the
layer's zoom (the editor's stay in stage pixels, since it applies the effect to what the camera sees) and the direction turned
with the camera: RMSE 12 to 18 against the editor. A layer hangs off the camera null, a precomp over the stage does not, so
`withLook` (`cameraBendsEffects` in `lottie.ts`) puts effects on such a precomp whenever the camera zooms, turns or fits a shot
(a pan alone keeps them on the layer); the numbers are the editor's own, nothing is divided by the zoom. RMSE after: 0.1 to 1.5 in
the SVG player, 2.5 to 3.2 in ThorVG (a plain shadow is 1.2 to 1.7 there; its shadow is about 5 percent lighter once scaled).
Checks `zoom`, `zoomMove`, `zoomStack`, `zoomFolder`, `pixelZoom`; `test/export/lottie-camera-effects.test.ts`.
And a pixel layer's shadow that "looked hard-edged and clipped to the picture" was not about pictures: ThorVG cuts a shadow's
source at the canvas edge before it shifts it, so a sprite (or a vector box, same RMSE) touching the top or left edge of the stage
throws a shadow with a cut line at the offset (RMSE 3.6 for a 24 px sprite at the corner, 5.8 for a box; the SVG player is exact).
A sprite inside the stage is 0.3 to 1.9 off. A transparent border round the picture and the room layers change nothing there.
It can't be fixed in the file; "Draw Soften and Shadow as pictures" is exact.

```bash
DOTLOTTIE_DIR=$PWD/pkg/package xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/shadow-clip.cjs [outDir]
```

## Vector exports against the renderer: scripts/e2e/vector-check.cjs

Renders test documents (Bouncing logo, a shape tween with hints, a camera move with parallax, the Bouncing ball, a pixel
layer) three ways: `renderFrame`, lottie-web from `docToLottie`, and Chromium's SVG from `animatedSvg`. Prints the mean
difference and the share of pixels off by more than 48, and fails when a frame is far off. Needs no build: the page
(`vector-check-page.ts`) is bundled with esbuild on the spot. `ONLY=a,b` limits the cases.

```bash
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/vector-check.cjs [outDir]
```

It also prints one summary line per document: RMSE (0 to 255, both over white) against `renderFrame` for lottie-web's canvas
and SVG players, the Lottie file size and where the bytes go (baked effect pictures, pixel-layer pictures, keyframes,
shapes, other; see `src/export/lottie-size.ts`). Every built-in template is included as `tpl:<id>` (reported, but a
mismatch there doesn't fail the run), plus `overlap` (faded layer, folder and symbol copy with overlapping shapes) and
`heavy-effects` (moving Glow and Outline over 36 frames). `QUIET=1` leaves out the per-frame lines. The size is taken before lottie-web plays the file (it adds fields to the data it is given). Small RMSE changes
between runs of a size or tolerance change (a few hundredths) are pixel rounding; the tolerances in `lottie.ts` (`FIT_TOLERANCE`, `*_TOL`) were chosen so
they stay at that level, so re-run this and compare the table before and after changing one.
The camera's anchor, zoom and turn are fitted with eased keys (`cameraNulls` in `lottie.ts`: one shared ease per segment, within 0.1 px on screen at the far corner; check `camera`, `tpl:camera-parallax` and `tpl:title-card`: a few hundredths of RMSE more than one key per frame, because lottie-web's own easing is only approximate, and the keyframes drop from 33 KB to 4 KB in the camera template). `symbol-gravity` (symbol sprites with drag and gravity: separated x/y position on layers) and `puppet-skin` (the puppet with a squashed chest, a stretched thigh and a skinned body: parts that bend, not only turn) are in the list for the motion code (`positionTrack`, the nested move groups and `rigidMoves` in `lottie.ts`). Group transforms can't use Lottie's separated position (lottie-web ignores it there), so particles use two nested groups instead. For a before and after run, add a worktree at the old commit, copy `vector-check-page.ts` into it and run the same command in both.

### dotLottie in the dotLottie player: scripts/e2e/dotlottie-check.cjs

Plays a document as plain JSON and as a `.lottie` (layout 2, then layout 1; `DOTLOTTIE_VERSION=2` or `1` picks one) in the dotLottie web player (ThorVG, run in Chromium) and prints the sizes, the RMSE of each
against Frameling's frames and how far the two players are from each other (0 means the zip carries everything, pictures included). The
player isn't a dependency: unpack a pinned copy (`npm pack @lottiefiles/dotlottie-web@0.83.1`) and point `DOTLOTTIE_DIR` at its `package` folder.

With layout 2 it also checks the loop setting: a half-second animation is written with loop on and off, started the way a site starts a file's state machine (`stateMachineLoad` and `stateMachineStart`, or the `stateMachineId` option), and must keep playing and wrap around (on) or end on its last frame (off). Layout 2's manifest has no loop field, so `dotlottie.ts` writes a one-state state machine (`s/loop.json` or `s/once.json`, a `PlaybackState` with `loop` and `autoplay`). The web player does not start a state machine by itself from the manifest's `initial`, and it ignores layout 1's manifest `loop` and `autoplay` (the page's own options decide), so the unit tests (`test/export/dotlottie.test.ts`) check what is written and this script checks that dotlottie-web plays it. Repeating a clip N times isn't carried: a Lottie file has no repeat count and the exporter doesn't bake the passes in.

```bash
DOTLOTTIE_DIR=$PWD/pkg/package ONLY=tpl:hero-sprites,heavy-effects xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/dotlottie-check.cjs
```

### Lottie picture looks: scripts/e2e/lottie-bake.cjs

Bakes a document with each "Pictures from effects" look and some single settings, and prints the file size, the part that is
pictures and the RMSE against Frameling's own frames (lottie-web canvas), so the size and quality trade-off can be read off. The last row bakes Soften and Shadow too ("Draw Soften and Shadow as pictures").
`AB=<dir>` also writes one frame per look at twice the stage size, to compare by eye (used for brand/ab/lottie-size/).

```bash
ONLY=heavy-effects,tpl:explosion-fx xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/lottie-bake.cjs [outDir]
```

## Artboards end to end: scripts/e2e/artboards.cjs

Builds a two-artboard document of different sizes (320 x 180 red and 200 x 200 green, with a shape hanging off the
stage) and runs every artboard export through the real app: this artboard, each into a folder, each into one zip, a
subset, the sprite sheet atlas, and all in order as one with Fit and with Fill (PNG sequence, GIF, MP4, WebM). Outputs
are read back with ImageMagick, ffprobe and unzip: sizes, zip contents, atlas JSON, and pixel colours (the bars, the
crop, what is hidden off the stage). Then it clicks with real mouse events (Select and Brush, and a name label) to
check the open artboard, the stage and the Timeline panel follow, and that Undo goes back. Last it exports four pixel boards as the
frames of one sprite, as a sprite sheet for every engine, and reads each engine's files back to one animation with the
frames in board order. `GODOT_BIN` also loads it in Godot and `WEB_ENGINES=1` in Phaser, PixiJS and CSS; `--only=frames-sheet`
runs just this part.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/artboards.cjs [outDir]
```

## Variations end to end: scripts/e2e/variations.cjs

Loads the variations demo (a ball, a recoloured variation and a square cut framed by a camera) and exports the family
through the real app: each as its own file (sizes, and pixel colours: the recolour, the crop), the atlas (an animation per
artboard), all in order as one MP4 (frame count), then saves the document, opens it again and exports once more to check
the variations are still linked and still resolve. It also drives the real "Recolour the whole animation" dialog inside a variation (pink to blue) and checks that only the variation changes. Logic is covered by `test/artboards/variations.test.ts`.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/variations.cjs [outDir]
```

## Selection end to end: scripts/e2e/selection.cjs

Picks shapes with real mouse clicks (Select, and Shift for several) and scrubs the playhead across keys made by the real
Duplicate key command: the selection must follow the same shapes by lineage, and come back on return. Then it opens an old
file (no `lineage` flag, no `origin`s) through the real open path and checks it is upgraded with no undo step and still
follows; checks Undo and Redo keep the selected shapes that still exist; opens and undoes an artboard switch and checks no
stale ids stay selected (the app clears the selection when the open artboard changes); and times a 2000-key timeline: every
frame in order, long jumps, and 600 painted steps (one animation frame each). Prints the timings; fails when a step is
slow (2000 frames in order over 2 s, or a painted step p95 over 100 ms) or a shape is lost.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/selection.cjs [outDir]
```

## Layers panel end to end: scripts/e2e/layers-panel.cjs

Opens a document of five layers and two folders (shown top first: e, folder Q holding d, c, folder P holding b, a) and
drives the nested Layers panel in the real window. Each move is checked in the panel (the row order and every row's
`aria-level`) and in the document (which folder each layer is in), then undone with a real Ctrl+Z (exactly one undo step,
back to the same layers and rows) and redone. Drags: a layer into a folder (the middle of the folder row), into a folder inside
a folder, above and below a layer (the edges of its row), onto a layer inside a folder (it joins that folder), a folder into a
folder, above a folder, below a layer, a folder dropped inside itself and a layer dropped on itself (both do nothing and make no undo
step). Keys: Alt+Up, Down, Left and Right on layers and on folders (the keyboard focus stays on the row; moves that cannot happen do
nothing). Fold and unfold with the twisty button and with Left and Right (the rows leave and return, `aria-expanded` follows, the
document and the undo history are untouched), Left on a layer goes to its folder, a drop on a folded folder's bottom edge goes below
it. Last, the three-level `aria-level` values and that levels never jump by more than one.

Keys, clicks and undo are real input events. A drag is not: Chromium starts a drag through the operating system, which does not
finish when the mouse is synthesised, so the script dispatches the same DragEvents (dragstart, dragover at a real point inside the
row, drop, dragend) on the real rows; the panel's own handlers and the Move command run as for a person's drag.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/layers-panel.cjs [outDir]
```

## Pixel drawing through a turned camera: scripts/e2e/pixel-camera.cjs

Looks through a zoomed and turned camera (30 degrees, 90 degrees, and a layer at another depth) and draws a rectangle,
ellipse, line, star and pencil stroke on a pixel layer with real mouse events, aimed at the middle of art pixels as the
picture shows them. The cells that land in the layer must be exactly the ones the same drag makes with no camera, and the
screen is read back at those cells to prove the picture and the pointer agree. Also shoots the pixel grid turned with the
picture.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/pixel-camera.cjs [outDir]
```

## Live pixel stroke preview: scripts/e2e/pixel-live.cjs

While a pixel stroke is held down the canvas shows the old drawing with only the touched 128 x 128 tiles drawn live
(`src/canvas/livePixels.ts`, `src/tools/pixelSession.ts`). The script draws strokes (pencil and eraser) over a drawing that
fills the grid, at ten zoom levels, takes the canvas while the stroke is held and again after it is let go, and the two
must be pixel for pixel the same (at 33% and below the odd screen pixel may differ, and is only listed). At pen-up the
finished drawing's cached picture is the old one with only the touched tiles put on it (`seedPicture` in
`pixelSession.ts`, so pen-up uploads nothing big); the script also checks it against a picture rebuilt from the pixels,
and that undo and redo (at 100% and up) give back the same screen.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/pixel-live.cjs [outDir]
```

## What is remembered between launches: scripts/e2e/remember.cjs

The brush, the stroke and fill colours, loop playback and the onion skin are kept between launches (src/core/uiMemory.ts
and src/tools/rememberUi.ts, saved inside the tool settings). This runs the real app twice on one profile on disk: the
`set` launch changes each setting (the options through the real panels, by clicking a value and typing a number), and the
`check` launch reads each one back and prints `kept` or `forgotten`, plus the things that should not stick (playhead, zoom,
tool).

```bash
npm run build
REMEMBER_PHASE=set   REMEMBER_DIR=/tmp/profile xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/remember.cjs
REMEMBER_PHASE=check REMEMBER_DIR=/tmp/profile xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/remember.cjs
```

`REMEMBER_ROOT=<another checkout>` runs the same check against that checkout's `dist/` (for a before and after).
`scripts/shoot.cjs` now starts from a throwaway profile, so what one run set does not show up in the next.

## Plugin sandbox: scripts/e2e/plugins.cjs

Checks the sandbox page blocks network and storage, the frame can't reach the app, and both example plugins in
`plugins/examples/` install, run, edit with undo, and export.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/plugins.cjs
```

## Accessibility: scripts/a11y.cjs

Opens every panel, every tool's options and every dialog, runs axe-core on each, and checks the keyboard (Tab reaches
things with a visible focus ring, Escape closes dialogs and focus goes back). Fresh profile per run. Exits 1 on any
axe "serious" or "critical" result or a keyboard failure.

```bash
xvfb-run -a -s "-screen 0 1600x1000x24" npm run a11y          # builds, then runs
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/a11y.cjs [--json out.json] [--themes] [--only name,name] [--theme dark|light] [--shots dir]
```

A full run is about 120 views and takes 4 to 6 minutes (more when the machine is busy), and prints nothing new when piped
into `tail` until it ends, so give it time before calling it stuck. It always exits: 0 clean, 1 problems found, 2 when the
run itself failed (an error, or no end after `A11Y_TIMEOUT` minutes, 30 by default). Without `--theme` it follows the
system, which is light under xvfb, so run it once with `--theme dark` too: colour contrast problems differ by theme.
`--shots <dir>` saves a picture of each dialog as it is checked (it puts the window on the virtual screen).

Popups (`popup ...`) also check that Tab and Shift+Tab out of one close it and land on another control, and so does
focus moving elsewhere. Every scenario sets up its own state, so any `--only` subset works on its own;
`npm run a11y:selftest` (under xvfb, after a build) runs two scenarios alone to prove it.

`--themes` also runs axe's colour contrast rule in every built-in theme. `A11Y_SHOW=1` puts the window on screen
(the virtual one, under xvfb). `AXE_CORE=<folder>` points at an axe-core install elsewhere.

## The ring round a dialog: scripts/e2e/dialog-ring.cjs

Presses just outside every modal with a real mouse, with "Pressing beside a dialog" set to Close. A press within 24 pixels of a
dialog's edge (`NEAR_MISS` in `src/ui/backdropClick.ts`) must do nothing; one well clear must close it. The save question
ignores the dim area, so a far press must leave it open, and the quest cards are not modals at all. It also reports any part of a
dialog that sticks out past the box the ring is measured from. Walks Preferences, Help, the palette, the welcome and new
sheets, New pixel art, About, Quill's hello, Export, the settings dialogs, Versions, Recover, the pen check, a choice question,
the crash offer and the save question.

```bash
npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/dialog-ring.cjs
```

`DIALOGRING_ONLY=<text>` runs only dialogs whose name starts with it. Exits 1 on any wrong press. The same rule is held in
vitest by `test/ui/dialog-ring-everywhere.test.tsx`, which also fails if a file other than the two dialog shells builds a dim
area of its own (it would skip the ring).

## Words on one line: scripts/e2e/no-wrap.cjs

The rule: a control's words stay on one line. Every `button`, `summary` and `role=tab|radio|switch|checkbox|menuitem|option`
gets `white-space: nowrap` from `src/renderer/theme.css`. Where there is not room, the row answers in one of these ways, and
never by breaking a label in two:

- **stack one per line** on purpose: `useStackWhenTight` (`src/ui/fitRow.ts`) sets `data-stacked` on a pick-one row that does
  not fit side by side (the tool options' `Choice`), measured before paint so nothing flickers; Preferences' pick-one rows keep their size (`flex: none`) and the description beside them wraps instead;
- **flow onto the next line**: a `flex-wrap` row or grid of whole buttons (effects tiles, tile sizes, layer kind buttons);
- **shorter words**: a container query swaps a name for a shorter one (`cv-words-long` and `cv-words-short`), the full
  name stays in the tooltip and the accessible name;
- **scroll sideways** on purpose: mark the row `data-scrolls` (tab strips, the timeline);
- **cut with an ellipsis** for a name that comes from the person (the Preview panel's frame line, the pixel bar's chip).

Words that are a sentence (a card's blurb, a row in a list of help topics) say so with `data-wraps`, which turns the rule
off for that control and what is inside it. A switch or tick box keeps its knob in place and its words may wrap beside it.

The harness opens the built app at the narrow sizes people use, in five passes: a 1280 laptop with the right side at its smallest
(200 px) and at its usual width, the interface size slider at 150% and at 200% (1280 pixels becomes 640 and 853 of the app's
own pixels), and a wide 1920 screen. In each it walks the main window (vector and pixel drawing), every panel, every tool's
options (on a vector and a pixel drawing), every dialog and every Preferences page, and reports any control that:

- has a short piece of text on two or more lines (a wrap), or
- keeps its words on one line but sticks out of the box that holds it, or makes a panel scroll sideways when it should not, or
- **sits on top of another control** (an overlap is not a wrap, and it is what a missing `data-wraps` looks like: a card's
  sentence that will not wrap runs under the column beside it). Every pair of visible controls that do not contain each other is
  compared, using the box their words fill, cut to any scrolling or clipping box round them (so a control scrolled out of sight
  is not "under" anything). Mark a stack that is meant (the fill and stroke wells, a badge on a thumbnail) with `data-overlaps`
  on it or a box round it. A sticky or fixed heading is left to lie over what scrolls under it. The finding reads `[overlaps] a <> b`.

It also drags the right side from 200 to 480 px in steps of 10 on a few busy panels, and fails when a wrap shows up on the way
or the content grows taller as the panel gets wider (the layout jumping about). On the Preview panel it steps the frame
through 1, 9, 10, 99, 100 and 150 at every width and fails if the panel's height changes with the digits.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/no-wrap.cjs
```

About 4 minutes a pass, 15 for all five. `NOWRAP_PASSES=a,b` runs only the passes whose name contains a or b (`smallest`,
`usual`, `150`, `200`, `wide`), `NOWRAP_ONLY="tool select"` only the views whose name starts with that, `NOWRAP_JSON=<file>`
saves every finding, `NOWRAP_SHOTS=<dir>` a picture of each view with a wrap, `NOWRAP_DIST=<dir>` checks another copy of `dist/`
(copy it before a change to get the before numbers). It exits 1 when anything wraps or jumps. The edge of the window itself
is left to the dock's layout, not judged here: at 200% on a 1280 screen the app has only 640 pixels to share.

## Performance: scripts/perf/

Full details, options and how to read the numbers are in `scripts/perf/README.md`. Results go in
`scripts/perf/results/`.

`run.cjs`: real input events, real GPU canvas, numbers as JSON. Tests: `draw`, `playback`, `rigfx`, `pixellive` (the first
dab of a stroke on a 2048 and a 4096 pixel drawing that fills the grid: pointer to picture, and what is uploaded), `templates`,
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
through `launch.cjs`, which keeps every window unfocusable. Under xvfb (the way to run it) the window stays on-screen in
the virtual display, because an off-screen window is never drawn there and the launch never gets interactive; on a real
desktop it is parked off-screen so nothing shows. `scripts/perf/display.cjs` decides; `PERF_ONSCREEN=1` or `0` forces it.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/perf/startup.cjs --out scripts/perf/results/startup-desktop.json
```

Options: `--runs N` (default 7), `--cpu N` (default 4).

`sweep.cjs`: everyday actions (brush and pixel strokes, scrubbing, playing, selecting and moving, adding and deleting
layers and keys, undo and redo, switching artboards, the Export dialog, saving, opening, autosave, switching workspaces)
on built-in templates and on big stress documents (40 layers x 240 keys in folders, a 2000 x 2000 pixel sprite with 100
frames, four variations, 60 symbols), with a CPU profile around each. Prints a table and the hottest functions;
`compare-sweep.cjs` lines two result files up. Details and options in `scripts/perf/README.md`.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/sweep.cjs --reps 3 --top 6 --out scripts/perf/results/sweep.json
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/perf/sweep.cjs --docs stress-vector --actions undo-redo,add-key --trace
```

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
| `{"dblclick": [x, y]}` | Double-click at window coordinates (`record.cjs` and the help clips only). |
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
`{"wheel": [x, y], "dy": -100, "count": 4, "mods": ["shift"]}` turns the mouse wheel (page deltas, negative = up = zoom in) and
`{"pinch": [x, y], "dy": -6, "count": 12}` does a trackpad pinch (Ctrl + small wheel steps, as Chromium delivers it);
`{"rdrag": [[x, y], ...]}` and `{"rclick": [x, y]}` are the same with the right mouse button (a right-click paints with Back in the Pixel workspace);
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
Every entry starts with the first-time question "Workspace follows the drawing" answered Never (so it never covers pixel art);
an entry can give other answers, or change that one, with `choices: { 'workspace.follow': 'always' }`. Steps can click by selector
instead of by position with `{"clickOn": ".ui-menubar [role=menuitem]", "text": "Frames and motion", "after": 900}` (`"hover": true` only moves
there, `"dx"`, `"dy"` shift the point), which keeps a clip working when a menu or button moves. Each capture looks for a question
left open or a loading state in the frame and prints `[LOOK: ...]` after the entry's `ok` line: look at those files.

`test/ui/help-media.test.ts` fails when a topic's media has no entry (so it can't be shot again), when an entry is for no
topic, or when a file is missing, unused or too big. To add help media for a new topic: write the entry, run
`npm run help:media -- --only <name>`, look at both files, then set `media: '<name>.png'` on the topic.

## Picture import and slices against the real tools

All opt-in; run what you touch, under xvfb.

```bash
ASEPRITE_BIN=/path/to/aseprite npx vitest run test/pixel/import-aseprite-bin
GODOT_BIN=/path/to/godot xvfb-run -a -s "-screen 0 1600x1000x24" npx vitest run test/export/slices-godot-e2e
UNITY_BIN=/path/to/Unity/Editor/Unity xvfb-run -a -s "-screen 0 1600x1000x24" npx vitest run test/export/slices-unity-e2e   # about 90 seconds
WEB_ENGINES=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx vitest run test/export/slices-web-e2e
```

- `import-aseprite-bin`: Aseprite (batch mode) makes a sprite with delays, tags and slices (`test/pixel/lua/sheet.lua`),
  exports a trimmed sheet with JSON and every frame as a picture. Frameling's sheet import must give the same frames,
  delays and tags, and its slices must equal both Aseprite's JSON and the slices read from the .aseprite file.
- `slices-godot-e2e`: the `-slices.tscn` loads in Godot 4: a NinePatchRect with its margins and region, a Sprite2D on an
  AtlasTexture with the pivot as its origin, and the pixels of each region.
  A second test plays a slice that moves: the AnimationPlayer (one animation per document clip, named after it) is sought to
  several times, also in a clip that plays backward, and the region, offset, borders and the colour in each region are read
  back. A slice whose first key has no 9-patch middle and a later one does must be a NinePatchRect with borders of 0 until
  that key.
- `slices-unity-e2e`: a throwaway Unity project, with and without the 2D Sprite package, imports the sheet through the
  importer script; each sprite's rect, pivot and border are read back (`scripts/e2e/unity/FramelingSliceCheck.cs`).
  A moving slice is checked too: a sprite per key with its own pivot and the colour in its middle, and a clip per document
  clip (`slice_<slice>_<clip>`, in that clip's order, backward included) that the importer makes for it.
- `slices-web-e2e`: Phaser 3 and 4, PixiJS 8 load the atlas (frame regions, pivot, anchor) and Chromium draws the CSS
  9-patch stretched (`scripts/e2e/web-slices.cjs`).
  The moving slice is loaded there as well: a frame with its own pivot or anchor per key, and an animation per document clip
  that plays them in that clip's order.
- `test/export/slices-moving.test.ts` (no engine needed) checks the same exports as text and reads the sheet picture to
  prove each key's region holds the colour that frame drew there.

## Aseprite import against the real Aseprite

```bash
ASEPRITE_BIN=/path/to/aseprite npx vitest run test/aseprite/aseprite-bin
```

Opt-in, like `GODOT_BIN`. `test/aseprite/lua/gen.lua` runs in `aseprite -b` (batch mode, no window; settings go to a
throwaway folder through `XDG_CONFIG_HOME`, so your own Aseprite settings are never touched) and makes real files:
RGBA, grayscale and indexed colour, groups, every blend mode, linked cels, tags in every direction, a tilemap with
flips, slices, user data and a reference layer. For every layer of every frame it also saves Aseprite's own picture
of that layer alone. The test opens each file with the importer and compares pixel by pixel, plus the settings,
timing, tags and notes. Reference layers are checked by value, since Aseprite leaves them out of its own render.
`test/aseprite/import.test.ts` runs without Aseprite, on files made by the test writer. The help picture sample
`scripts/docs/help/assets/slime-bounce.aseprite` is made by `make-slime.lua` next to it.

`xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/aseprite.cjs [file.aseprite ...]` opens real files in the real app through
`openPath` (the double-click and recent-files path), adds one to the open drawing, undoes it, and fails on any page error. With no
files it uses the sample. It only reads the files you give it.

Blend modes: `ASEPRITE_BIN=... xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/blend-aseprite.cjs [outDir]` (after
`npm run build`) has Aseprite composite every blend mode at four opacities over solid and see-through backdrops
(`blend-aseprite.lua`), opens the same files in the real app, renders them with the real renderer and compares per pixel,
against Aseprite and against the W3C maths in floats (`blend-reference.cjs`). It writes `blend-report.md` and `.json`.
Result: Frameling matches the W3C maths within rounding in every mode; Aseprite matches it over solid backdrops but mixes
see-through backdrops its own way (up to 64 of 255 off). `test/aseprite/blend-bin.test.ts` checks the pixel modes against it.

## Quill's dialogue

```bash
xdg-open /mnt/109313D2109313D2/projects/frameling/brand/dialogue/index.html   # open the review page itself
npm run dialogue:page                                   # rebuild brand/dialogue/index.html from lines.json
xvfb-run -a -s "-screen 0 1600x1000x24" npm run dialogue:shots    # build, retake every shot, rebuild the page (~2 min)
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/dialogue/shots.cjs [group ...]   # some groups, current build
npm run dialogue:apply <changes.json> [--check]         # merge edits from the review page into lines.json
npm run dialogue:apply -- --board [--check]             # the same, from the edits saved on the board (pb must be signed in)
npm run dialogue:publish                                # build the page with its pictures inside, put it on the board as quill-dialogue
```

The page (`page.mjs` + `page-client.js`, with `lines-tools.mjs` copied in whole) reads the live list from GitHub, saves
edits to the `quill-lines-draft` board doc and raises the merge task through the board's own API as whoever has the page
open. `test/ui/quill-dialogue-live.test.ts` runs it in jsdom against a pretend board and a pretend GitHub.

`shots.cjs` saves one cropped shot per line id into `brand/dialogue/shots/` and notes into `manifest.json` there.
It honours `SHOT_SHOW=1`. `apply.mjs` refuses the whole file if a line lost or gained a `{placeholder}` or names a line
that doesn't exist. The workflow is in the README.

## The mascot build

```bash
npm run build:mascot
```

Reads `brand/mascot/mascot.frameling` and `mascot-icon.frameling` with the app's own reader and writes
`public/mascot/mascot.png` + `mascot.json`, `build/icon.png`, `build/icon.svg`, `build/icons/` and
`public/mascot/logo.png`, touching only files whose bytes changed. `npm run build` runs it first.
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
npm run install-local                 # npm run dist:linux, then copy the AppImage (and the beta one, see below)
npm run install-local -- --no-build   # copy the last builds
```

Copies the newest `release/*.AppImage` to `/mnt/109313D2109313D2/lutris-applications/frameling/frameling.AppImage`
(`FRAMELING_INSTALL_DIR` overrides), closing a running copy first if the file is busy. Linux only. The ordinary build
runs with `FRAMELING_INGEST_KEY`, `FRAMELING_INGEST_URL`, `FRAMELING_BETA` and `FRAMELING_PROFILE` removed from its
environment, and `beta-check --expect-no-key` looks inside its packed `app.asar` before it is copied.

With `FRAMELING_INGEST_KEY` in the environment it also builds the beta copy first, into `release-beta/` (with
`FRAMELING_BETA=1`, so a build with no key stops, and `FRAMELING_PROFILE=beta`), runs
`node scripts/beta-check.mjs --expect-key release-beta/linux-unpacked/resources/app.asar`, and only then installs it as
`frameling.beta.AppImage` with its own launcher (`frameling-beta.desktop`) and icon. Without the key it prints one line
and installs just the ordinary copy; a beta already in the folder is left as it was. The profile makes the beta copy
keep its data in a `Frameling Beta` folder next to `Frameling` (`src/main/profile.ts`), so its settings, recent files and
single-instance lock are its own, and it does not register `frameling://`. The two can run at once.
`test/beta/install-plan.test.ts` covers the choices; to try the whole thing without touching the real folder, use a
placeholder key and a throwaway place:

```bash
FRAMELING_INGEST_KEY=pbk_TEST_ONLY_NOT_A_KEY FRAMELING_INSTALL_DIR=/tmp/fl XDG_DATA_HOME=/tmp/fl/data npm run install-local
```

## The Linux launcher and a stock Ubuntu 24.04

The AppImage starts through `build/linux/launcher.sh` (put in front of the program by `build/after-pack.cjs`; the program
is `frameling.bin`). It keeps the browser sandbox on, asks before dropping it, and has `FRAMELING_OZONE` for forcing
Wayland or X11. `test/platform/linux-launcher.test.ts` runs it against a stand-in program.

The sandbox behaviour only shows on a kernel with `kernel.apparmor_restrict_unprivileged_userns = 1` (stock Ubuntu 24.04;
Zorin OS turns it off). A container shares the host's kernel, so it cannot show it. A throwaway virtual machine can:
`qemu-system-x86_64 -enable-kvm` with the Ubuntu 24.04 cloud image and a cloud-init seed, `xvfb` and Electron's libraries
installed, the AppImage copied in. Things worth running there: the AppImage with no `libfuse2`; the same with an AppArmor
profile loaded (`sudo apparmor_parser -r`, see `--show-linux-fix`); with the sysctl at 0; under `weston --backend=headless`
for Wayland. `window.frameling.session` (also in the pen report) says which window system Chromium used.
`brand/pen-check-demo/LINUX-BETA.md` lists what was found. A pretend tablet sends real pen events to Chromium on X11 and
on Wayland: see the next section.

## A pretend tablet: scripts/linux-pen/

A `uinput` pen tablet (`tablet.py`: a tip, an eraser tool, two barrel buttons, pressure and tilt, and the steady stream of
reports a real one sends) read by libinput, in an Ubuntu 24.04 VM: Xorg with the dummy video driver and the libinput driver
for X11, weston (drm backend, kiosk shell) for Wayland. Chromium sees real pen events from the system, not DevTools ones.
It has to be a VM: on the host the new device's event node is `root:input` and the desktop user cannot open it (writing to
`/dev/uinput` is allowed, reading the node is not), and the desktop's own X server would pick the pen up and move the cursor.
`scripts/linux-pen/vm-up.sh <folder>` makes the VM (cloud image, KVM, ssh on port 2231, the folder shared into the VM as
`/mnt/share`) and its header lists what to run in it:

- `vmrun.sh` and `vmwl.sh` load a bare page that logs every pointer event, with a scenario file of tablet commands
  (`scen1.txt` is a tip stroke, both barrel buttons and an eraser stroke); `show.py` prints the log.
- `vmapp.sh x11|wayland` runs Quill's whole pen check in the built app (`dist/`) through `appcheck.cjs`, and
  `report-summary.py` prints the saved report's steps.

What it showed is in `brand/pen-check-demo/LINUX-BETA.md`, "The pen on X11 and Wayland". `scripts/e2e/pen.cjs` pins the
same behaviour with synthetic events on every run (the Linux-only checks at the end); `ONLY=eraserByDevice,penCheckOnLinux`
runs just those.

## The pen check on video: scripts/docs/pen-check-demo.cjs

Records a dummy run of Quill's whole pen check with a pen made up from DevTools protocol events and a drawn pen cursor, into
`brand/pen-check-demo/` (see its `NOTE.md`):

```bash
npm run build
SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/pen-check-demo.cjs <outDir> --theme dark
```

## CI

`.github/workflows/build.yml`, on every pull request into `main` and on demand:

- `build` (Linux, Windows, macOS): `npm ci`, `npm test`, `npm run build`, then `electron-builder` (AppImage; NSIS and
  portable; dmg for arm64 and x64), with Windows signed when `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` are set.
  Uploads `frameling-<OS>` artifacts, kept 14 days.

CI runs vitest only. The Electron harnesses are run by hand, under xvfb, before merging work they cover.

## Variations edit cost (opt-in)

`VARIATIONS_PERF=1 npx vitest run test/artboards/variationsPerf.test.ts` prints how long an edit takes on a 9,600-key document with one and four variations. It asserts nothing about time, so it's off in `npm test`.

## Export formats and shape kinds in tests

`vitest.config.ts` runs `test/setup-kinds.ts` before every test file: it registers the text and particles shape kinds, loads their export code
(`loadShapeExports`) and registers the Godot engine, as the app has them at start. A test of the Interactives export card imports
`test/export/withInteractives.ts`. `test/export/registry.test.ts` covers the export registry (order, plan rules, feature-owned formats, sound with Audio off),
`test/core/shape-kinds.test.ts` the shape kinds, `test/features/stage3-features.test.ts` Camera, Particles, Text and Godot exports being switched off and on.

## Beta reports: the network, told apart

`scripts/e2e/beta-net.cjs` runs the desktop side of beta reports (`src/main/beta.ts`) against real failures of Electron's own
network stack, using throwaway local servers (it sends no report anywhere), and checks each one is named for what it is:
a good key, a refused key, a wi-fi sign-in page, a filter's HTML, a 502, a proxy asking for sign-in, too many reports, a
certificate nobody trusts, a connection nothing accepts, a server that never answers, an address that isn't the build's board,
an ordinary build with no board, a name that doesn't exist, a request cancelled by a policy, and a proxy that is down. It also
asks the real board's health address when the computer is online (`BETA_NET_OFFLINE=1` skips that).

    xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/beta-net.cjs

`npm run beta:check` (after `npm run build`, or pointed at an unpacked `app.asar`) says whether a build carries an ingest key
and which board it sends to, without printing the key; `--expect-key` makes it exit 1 when there is none, so run it before
handing a build to a tester. `FRAMELING_BETA=1` on the build itself stops with an error if `FRAMELING_INGEST_KEY` is missing.

### Quill's save question: scripts/ab/quill-save-dialog.cjs

Real built app, real window close and real Quit. `dialog` mode checks the close is held, the dialog's focus, name and role, Escape
as Cancel, Quit held and cancelled, then Quit with Don't save carrying on (`CLIP=1` also records an H.264 clip). `fallback` mode freezes
the page, so after the 2.5 s wait the system box asks, and crops it. Used for brand/ab/quill-save-dialog/.

```bash
npm run build
xvfb-run -a -s "-screen 0 1280x800x24" npx electron scripts/ab/quill-save-dialog.cjs dialog dark brand/ab/quill-save-dialog
xvfb-run -a -s "-screen 0 1280x800x24" npx electron scripts/ab/quill-save-dialog.cjs fallback dark brand/ab/quill-save-dialog
```

### Clips with a native question: scripts/ab/close-drawing.cjs

For anything whose point includes a native dialog (the "Save changes?" question), which a page capture can't see. It runs the
real built app (`npm run build` first), draws, picks **File > Close drawing**, and records the whole virtual screen with ffmpeg
(x11grab, H.264) while xdotool presses the dialog's button. Used for brand/ab/close-drawing/.

```bash
xvfb-run -a -s "-screen 0 1280x800x24" npx electron scripts/ab/close-drawing.cjs dark out.mp4
```
