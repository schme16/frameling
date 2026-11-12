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
| `pixel/` | Pixel tools, maths, paths, the pixel workspace. |
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
| `--only=gif,mp4` | Only these formats: `png svg pngseq apng gif mp4 webm sheet interactives psd pdf ai prores godot-bones`. |
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
WebGL animation frames). Phaser 3.90.0 and PixiJS 8.23.0 are pinned in `scripts/e2e/web-engines/engines.cjs`. The first run
downloads each package from the npm registry, checks it against the pinned sha512, and unpacks its browser build into
`~/.cache/frameling-web-engines` (override with `WEB_ENGINES_DIR`), so nothing goes into `package.json`. The check
serves the export folder over http on 127.0.0.1 and loads it the way a web page would, with the code from the help topics.
Chromium needs the software GL switches the harness sets (`ignore-gpu-blocklist`, SwiftShader), or WebGL is refused on a
virtual display.

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

### Clips that play another way (direction and repeat)

`export.cjs` adds these cases for `bouncing-ball` (its own clips are cleared first; the clips are `PLAY_CLIPS`: `swing`
back and forth and looping, `thrice` forward 3 times, `back` backward once, `plain` a loop):

- `sheet`: `play-godot` (real Godot with `GODOT_BIN`: every animation's frames and `loop`), `play-json`, `play-unity` (the
  json's picture order, loop and direction; with `UNITY_BIN` the clips are imported and played on a real Animator, and
  `FramelingSheetCheck.cs` also checks the wrap mode), and with `WEB_ENGINES=1` `play-phaser`, `play-pixi`, `play-css`.
  Phaser must read `repeat` 2 for `thrice` (one pass, N - 1), CSS `iteration-count` 3, and every frame of every
  animation is compared with the app's own PNG of the document frame the rules say it shows.
- `gif`, `apng`, `mp4`, `webm`: `clip-pingpong`, `clip-repeat3`, `clip-backward` export one clip and check that picture k
  is the document frame the order rules give.

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

It also prints one summary line per document: RMSE (0 to 255, both over white) against `renderFrame` for lottie-web's canvas
and SVG players, the Lottie file size and where the bytes go (baked effect pictures, pixel-layer pictures, keyframes,
shapes, other; see `src/export/lottie-size.ts`). Every built-in template is included as `tpl:<id>` (reported, but a
mismatch there doesn't fail the run), plus `overlap` (faded layer, folder and symbol copy with overlapping shapes) and
`heavy-effects` (moving Glow and Outline over 36 frames). `QUIET=1` leaves out the per-frame lines. The size is taken before lottie-web plays the file (it adds fields to the data it is given). Small RMSE changes
between runs of a size or tolerance change (a few hundredths) are pixel rounding; the tolerances in `lottie.ts` (`FIT_TOLERANCE`, `*_TOL`) were chosen so
they stay at that level, so re-run this and compare the table before and after changing one.

### dotLottie in the dotLottie player: scripts/e2e/dotlottie-check.cjs

Plays a document as plain JSON and as a `.lottie` in the dotLottie web player (ThorVG, run in Chromium) and prints the sizes, the RMSE of each
against Frameling's frames and how far the two players are from each other (0 means the zip carries everything, pictures included). The
player isn't a dependency: unpack a pinned copy (`npm pack @lottiefiles/dotlottie-web@0.81.0`) and point `DOTLOTTIE_DIR` at its `package` folder.

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
check the open artboard, the stage and the Timeline panel follow, and that Undo goes back.

```bash
npm run build
xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/artboards.cjs [outDir]
```

## Variations end to end: scripts/e2e/variations.cjs

Loads the variations demo (a ball, a recoloured variation and a square cut framed by a camera) and exports the family
through the real app: each as its own file (sizes, and pixel colours: the recolour, the crop), the atlas (an animation per
artboard), all in order as one MP4 (frame count), then saves the document, opens it again and exports once more to check
the variations are still linked and still resolve. Logic is covered by `test/artboards/variations.test.ts`.

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

Popups (`popup ...`) also check that Tab and Shift+Tab out of one close it and land on another control, and so does
focus moving elsewhere. Every scenario sets up its own state, so any `--only` subset works on its own;
`npm run a11y:selftest` (under xvfb, after a build) runs two scenarios alone to prove it.

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
through `launch.cjs`, which keeps every window unfocusable. Under xvfb (the way to run it) the window stays on-screen in
the virtual display, because an off-screen window is never drawn there and the launch never gets interactive; on a real
desktop it is parked off-screen so nothing shows. `scripts/perf/display.cjs` decides; `PERF_ONSCREEN=1` or `0` forces it.

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
`{"wheel": [x, y], "dy": -100, "count": 4, "mods": ["shift"]}` turns the mouse wheel (page deltas, negative = up = zoom in) and
`{"pinch": [x, y], "dy": -6, "count": 12}` does a trackpad pinch (Ctrl + small wheel steps, as Chromium delivers it);
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
