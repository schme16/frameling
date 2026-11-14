# Frameling

A friendly desktop tool for drawing and animating 2D art, made for vector and pixel art alike. Draw frame by frame or tween between poses, then export to video, GIFs, sprite sheets, Godot, and natively into Interactives.

It runs as a desktop app (Electron, Windows, macOS, Linux). The plan lives on
the project board (project `frameling`, doc `evaluation`). Developer docs are in [docs/](docs/README.md).

## What it does

- **Drawing**: vector layers (pressure brush, pencil, pen, shapes, paint bucket, gradients, keep separate or merge
  together) and pixel layers (pixel pencil, shade, dither, palettes and ramps, palette lock, mirror drawing,
  selections). Reference layers, guides, grids, perspective guides.
- **Animation**: a detailed timeline (keys, holds, tweens with easing, property rows, multi-key retime) or a clean
  one; onion skin, light table, play range, ping-pong. Symbols with their own timelines, classic and shape tweens,
  motion paths, one-click motions.
- **Rigging and camera**: bones with IK, pins, squash and stretch, bending meshes and a pose library; a camera layer
  with parallax depth.
- **Tiles**: animated tiles, tilemap layers, tile editing in place.
- **Effects**: blend modes, an effects stack with animated values, clip to below, masks, layer folders, text with text
  animators, particle emitters.
- **Sound**: sound clips on the timeline and lip sync from audio.
- **Artboards**: several named canvases in one document. **Clip flow**: which clip follows which, for games.
- **Export**: MP4, WebM, GIF, APNG, PNG and PNG sequences, sprite sheets with data for Godot, Unity, Phaser, PixiJS,
  CSS and JSON, SVG and animated SVG, Lottie, PDF, `.ai`, PSD, ProRes 4444, Godot bones scenes and a Godot importer
  add-on, and `.flplay` for Interactives (with a round trip back into Frameling).
- **Aseprite files** (`.aseprite`, `.ase`) open as a drawing or add to the open one: layers, groups, exact frame timing, linked cels, tags as clips, palettes, tilemaps as tiles, slices (`src/aseprite`).
- **Pictures and sprite sheets** (PNG, animated GIF, sprite sheets) open as pixel art or add to the open drawing, cut by a grid, by the gaps or by a JSON (`src/pixel/import`). **Slices** (named rectangles with a 9-patch middle and a pivot) go to Godot, Unity, Phaser, PixiJS, CSS and JSON with the sprite sheet export (`src/pixel/slices`).
- **Around it**: autosave, recovery and version history, templates (built in and your own), sandboxed plugins, quests
  and onboarding with Quill the mascot, in-app help with pictures and clips, themes and a theme editor, shortcut sets,
  workspaces.

## Get it

Every pull request into `main` builds the app for all three systems. Open the pull request's **Checks**, then **Build desktop apps**, and download it from **Artifacts** at the bottom of the run:

| System | File |
|---|---|
| Windows | `Frameling-<version>-setup-x64.exe` (installer) or `...-portable-x64.exe` (runs without installing) |
| macOS | `Frameling-<version>-mac-arm64.dmg` (Apple silicon) or `...-mac-x64.dmg` (Intel) |
| Linux | `Frameling-<version>-linux-x86_64.AppImage` (make it executable, then run it; see Help, Installing on Linux) |

The builds are only self-signed (Windows) and ad-hoc signed (macOS), so on Windows click **More info → Run anyway**, and on macOS right-click the app and choose **Open** the first time (see Signing, below).


### Build it yourself

You need [Node.js](https://nodejs.org) 22 or newer and this repository. Then, in the repository folder:

- **Windows:** double-click `build.cmd`, or run it in a terminal.
- **macOS and Linux:** run `./build.sh`.

A menu asks what to build:

```
  1. This computer (Linux)
  2. Everything this computer can build
  3. Windows
  4. macOS  (not on this computer)
  5. Linux
```

Or skip the menu by naming it: `./build.sh this`, `all`, `windows`, `mac` or `linux` (the same words work with
`build.cmd`). Add `--test` to run the tests first. The first run installs the packages (`npm ci`); the apps land in
`release/`.

What each computer can build:

| On | Can build |
|---|---|
| Windows | Windows |
| macOS | macOS, Linux (Windows too with [Wine](https://www.winehq.org)) |
| Linux | Linux (Windows too with Wine) |

Only a Mac can build the macOS app. Builds made this way are unsigned on Windows; macOS ones are ad-hoc signed (see
Signing, below).

## Changes

- **Files are now format version 3.** Every `.frameling` file saved by this build is version 3 (back and forth clip
  repeat counts changed meaning in version 2; pixel drawings keep only the painted part in version 3, so small
  pictures on big canvases take a fraction of the memory and file size). This build opens older files and upgrades
  them as it opens them, but earlier builds can't open a version 3 file: they say it was made with a newer Frameling.
  Keep a copy of anything you still need to open in an older build, and update every machine you share files with.
  Details in `docs/format.md`.
- **Aseprite files can be far bigger.** Only each cel's own bounds are kept, so the old 1 GB limit now counts what
  is held, not whole canvases.

## Work on it

Needs Node 22.

```bash
npm install
npm run dev            # opens the app with hot reload (Vite dev server on 5199)
npm test               # vitest: everything under test/
npm run typecheck      # tsc --noEmit
npm run help:audit     # checks the in-app help, and prints what it found
npm run build          # mascot, type check, then build into dist/ (renderer, main, preload)
npm run build:mascot   # just rebuild Quill's sprite sheet and the app icons
npm start              # build, then run the built app
npm run dist           # installers for this system, into release/
npm run dist:linux     # just the Linux AppImage
```

Checks that drive the real app in Electron (accessibility, every export format, effects pixels, the plugin sandbox,
performance, screenshots, help clips) are in [docs/testing.md](docs/testing.md). They all run inside xvfb, never on
the desktop you're working at, for example:

```bash
xvfb-run -a -s "-screen 0 1600x1000x24" npm run a11y
```

### Install on this Linux machine

```bash
npm run install-local                 # build the AppImage and install it
npm run install-local -- --no-build   # install the last build without rebuilding
```

This copies the AppImage to `/mnt/109313D2109313D2/lutris-applications/frameling/frameling.AppImage`. If Frameling is running from there, the script closes it first so the file can be replaced. Set `FRAMELING_INSTALL_DIR` to install somewhere else. It also writes the launcher, which lists Frameling under "Open with" for Aseprite files (and adds the Aseprite file type to your own mime folder if nothing else defines it) without becoming their default.

If `FRAMELING_INGEST_KEY` is set in your environment, it builds a second copy as well, `frameling.beta.AppImage`: the same app with the key compiled in, so it can send reports. The ordinary copy is always built without the key, even when the key is set. The beta copy has its own launcher (**Frameling Beta**), its own settings, recent files and crash notes (a `Frameling Beta` data folder), and never claims `frameling://` links or Aseprite files, so you can run both at once. It is only installed after `npm run beta:check -- --expect-key` finds the key inside the packed app. With no key set, the beta copy is skipped with one line saying so. The key is read from the environment only, and never printed or written to a file.

### Editing the mascot

Quill, the mascot, is drawn in Frameling itself. The source files are in `brand/mascot/`:

- `mascot.frameling`: every animation, drawn as the parts of him. Eleven pixel layers, 48 x 48 at 100 fps (one frame
  is 10 ms), in four folders: Body (Body, Feet), Head (Hood, Pencil quills, Ear, Face), Face (Cheeks, Eyes, Mouth) and
  Arms and extras (Arms, Extras: tears, stars, Zs). Every animation (idle, wave, talk, point, cheer, think, draw, sleep,
  oops, sad, wave-sad, dazed, wake) is an artboard of its own, so you open the one you are drawing and see only its
  timeline. The layers are one shared stack, so a part is still one layer across all of them, and each artboard keeps
  only its own drawings on it. The artboard's name is the animation's name; the clip across it says whether it loops.
  A pose is whatever the layers show at one moment, so a new face is a change to Eyes or Mouth only. The colours are
  the file's own palette, named, in ramps.
- `mascot-icon.frameling`: the app icon. The 32 px icon is on frame 0 (clip `icon32`, layer "32 px") and the
  hand-drawn 16 px one is on frame 1 (clip `icon16`, layer "16 px", pixel size 2). The 16 px art is used at 16 and
  48 px, the 32 px art everywhere else.

To change Quill: open the file in Frameling, edit, save, then run `npm run build:mascot` (`npm run build` does this
first anyway). That writes `public/mascot/mascot.png` + `mascot.json` (what the app plays), `build/icon.png`,
`build/icon.svg`, `build/icons/` and `public/mascot/logo.png`, touching only files that changed. Commit those along
with the `.frameling` file.

To add a pose or an animation: `node brand/mascot/mascot.mjs copy idle shy` adds a copy of an animation as a new
artboard, named `shy`, after the last one, with drawings of its own (painting on the copy never touches `idle`). Open the
file, pick `shy` in the Artboards panel, pick the layer that should change (usually Eyes or Mouth), go to the first frame
of one of its drawings and draw. A drawing held over several frames changes for all of them. Where the head bobs, each
bob position is its own drawing, so repeat it on those. Save, then `npm run build:mascot`. (The Artboards panel's own
Duplicate does the same; the copy is named after the artboard either way.)

Watch for drawings that more than one animation shows: most of Body, Feet, Hood, Ear and the quills are drawn once and
reused, so a pixel drawn on one of those in one animation changes it in every animation that shows it. Frameling does
not say when that is so. `node brand/mascot/mascot.mjs check` after saving tells you which animations changed, so a
change meant for one animation that shows up in others is caught before it ships.

The same script has `node brand/mascot/mascot.mjs` (what is in the file), `node brand/mascot/mascot.mjs poses` (every
pose, a row per animation, in `brand/mascot/poses-dark.png` and `poses-light.png`) and `node brand/mascot/mascot.mjs check
[file]`, which builds the sheet from the file and compares it, frame by frame, with the one that ships: after a save
that was not meant to change him it says so, and after one that was, it lists exactly which frames of which animations
look different. (`split` is the one-off that gave an older one-timeline file an artboard per clip.) It is the only script
the mascot has; everything else is done in Frameling.

How the file becomes the sheet: each artboard is an animation, walked in the order of the Artboards panel (that order is the order of the tiles in the sheet and the animations in `mascot.json`, so reordering artboards reorders them; a clip or a pose you add goes after the ones that exist); each clip is an animation; a sheet frame lasts as long as its layers stay the same, so
holding a drawing for 30 frames makes a 300 ms frame. Visible pixel layers in visible folders are flattened, bottom
first (hidden ones are skipped, so a hidden layer is a good place for reference sketches); vector layers are left out
with a warning. Keep clip names as they are: the app asks for animations by name. `brand/quill/` is the old generator
the art was first made with, kept for history only.

### Editing Quill's words

Everything Quill says is in one file, `src/ui/mascot/lines.json`: the first-run hello, his reactions, the Strawberry
gushing, nodding off, goodbye and welcome back, the quest cheers and badge card, the welcome sheet, About, empty
states and his toasts. Each entry has the `text`, a `where` (when and where it shows) and the `vars` it uses. Words
in `{curly}` brackets are filled in by the app, so keep them. A list is several bubbles shown together, or a set the
app picks from (silly names, quest cheers). Quest step instructions are tutorial content and stay in
`src/quests/library.ts`; help topics and plain app messages (errors, saving) aren't in it either.

The easy way to edit them is the review page, `brand/dialogue/index.html`. Open it straight from disk:

```bash
xdg-open brand/dialogue/index.html
```

Each line has its screenshot in place and a box to change it. The same page lives on the board as the
`quill-dialogue` doc (`npm run dialogue:publish` puts the current build there). Whenever it opens it reads the live list
from the repo's `development` branch on GitHub (no key), so it is never a stale copy, and it saves your edits as you type:
in the browser, and on the board as the `quill-lines-draft` doc. **Put these in the app** raises a board task listing
each changed line (was, now, and the exact row that goes into `lines.json`). If the board can't be reached from the
page, the edits stay in the browser and the button copies the task text instead.

1. Edit the lines on the page. To merge from the board: `npm run dialogue:apply -- --board` (add `--check` first). To
   merge from a file: press **Download my changes** (or **Copy my changes** and paste into a file).
2. `npm run dialogue:apply ~/Downloads/quill-lines-2026-11-11.json` merges them into `lines.json` and prints what
   changed. It refuses the whole file, and writes nothing, if a line lost or gained a `{placeholder}` or names a line
   that doesn't exist. Add `--check` to see the changes without writing them.
3. `npm run dialogue:page` refreshes the page's built-in copy (the fallback); `SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npm run
   dialogue:shots` rebuilds the app and retakes every screenshot too (about two minutes, inside xvfb, see
   `scripts/dialogue/shots.cjs`). A shot that only shows the nearest moment says so under the line.

Code reads the lines through `line(id, vars)`, `lines(id, vars)` (for lists) and `lineParts(id, vars)` (to fill a
placeholder with bold text) in `src/ui/mascot/lines.ts`; the ids are typed, so a typo fails `npm run typecheck`. A new
line goes in `lines.json` with its `where`, and in the moments list in `shots.cjs`. `test/ui/quill-lines.test.ts`
checks every line is used, every id used exists, and the placeholders match.

## In-app help

Topics are registered with `registerHelp` next to the feature (`src/*/help.ts`), their words are in the `help.bodies.ts` beside it (a lazily loaded chunk), and every one has a picture or a
short clip in `public/help/`. `npm run help:audit` (also part of `npm test`) fails when a command has no topic, a
topic has no media, a media file is missing or unused, a `help:` link goes nowhere, or a topic names a shortcut no
command has any more. It also lists topics over 400 words. `test/ui/help-words.test.ts` checks that the plain words
people type ("rubber", "lost my work") find the right topic; add a pair there when someone can't find something.

Every picture and clip is in public/help/ twice, `<name>-dark` and `<name>-light`, and the help browser shows the one for
the mode the app is in (and switches with it, Auto included). A topic's `media` names the base file (`select.png`). They
are all captured from the built app, inside xvfb, by the steps in `scripts/docs/help/`:

```bash
npm run help:media                         # everything, both themes
npm run help:media -- --only select,tour   # just those
```

To add media for a new topic, add an entry there (the help media test fails if a topic has none) and run it with
`--only`. The entry format, the step list and the details are in [docs/testing.md](docs/testing.md). Clips are always
H.264, never AV1.

## The Interactives package (.flplay)

**File > Export for Interactives** (or the **Interactives** card in the Export window) writes one `.flplay` file: the
playable form of the animation, which Interactives drops onto a page as a "Frameling animation" layer. It is a zip
(`application/vnd.frameling.playable+zip`), made by `src/export/playable.ts`:

| File | What it is |
|---|---|
| `manifest.json` | Everything a player needs (below). |
| `atlas.png` | Every different picture once, trimmed and packed, with 1 px of padding and 1 px of edge bleed around each. |
| `source.frameling` | The editable document, unless *Include the editable drawing* was unticked. Players ignore it. |

`manifest.json` (format `frameling-playable`, version 1):

- `name`, `width`, `height`: the stage size in document pixels (what a layer starts at). `scale`: atlas pixels per
  document pixel (1/8 for 32 px art on a 256 stage exported at art size).
- `fps`, `frameCount`: frames run 0 to `frameCount - 1` at `fps`.
- `pixelArt`: draw with nearest-neighbour scaling. `background`: the colour baked into the frames, or `null` when
  they are see-through.
- `atlas`: `{image, width, height}`.
- `cells`: one per picture, `{x, y, w, h}` on the atlas and `{ox, oy}`, where its top left sits in the whole frame
  (atlas pixels; the whole frame is `width * scale` by `height * scale`).
- `frames`: the cell for each frame. A held drawing is the same cell several times, so it is stored once. A clip that
  plays backward, back and forth or a set number of times has its frames in play order added at the end (its `start`
  and `end` point there), and `documentFrames` says how many frames are the document's own.
- `clips`: `{name, start, end, loop, runs}`, frames inclusive and counted from the package's first frame. `runs`
  is the clip as `{cell, frames, ms}`, for players that step picture by picture. Names are unique.
- `markers`: `{name, frame}`, sorted by frame. Several can share a name (two footsteps).
- `layers`: `{name, kind, visible, opacity, pixelSize?}`, for information. Frames are already flattened. Reference
  layers are left out.
- `source`: `"source.frameling"` or `null`.
- `app` (`"Frameling"`) and `appVersion`: what wrote it.
- `flow` (optional): the clip flow by clip name, `{start, states: [{name, loop, frames}], transitions: [{from, to,
  on: "end" | "trigger", trigger?}]}`, when the document has one.

Changes stay additive: a new field is optional, and anything that would break an older player bumps `version`.
The same format is in [docs/format.md](docs/format.md), next to the `.frameling` format.

### Edit in Frameling (the round trip)

**File > Open Interactives file...** (or double-clicking a `.flplay`, which the installers register) opens the
`source.frameling` inside a package. Saving then writes the drawing back into the same `.flplay`, at the package's own
`scale` and see-through choice, with the source included again (`src/interactives/`). The first save asks whether to
just update the package or also keep a `.frameling` (Preferences > Behaviour). **File > Update the Interactives file
when saving** turns it off for a drawing; the link is remembered per document id in `localStorage`
(`frameling.playableLinks.v1`). The desktop side only writes to a package that was opened or picked
(`files:linkPlayable` keeps that list in `linked-playables.json` in the user data folder).

The installed app also answers `frameling://open?path=<absolute path to a .frameling or .flplay>` (registered by the
installers; `src/main/library.ts` `fileFromUrl`). For a one-click **Edit in Frameling** in Interactives, its editor
would need to:

1. Know the local path of the `.flplay` (the desktop Interactives editor has it; a browser editor would have to
   download the file first and use that path).
2. Open `frameling://open?path=` with the path URL-encoded (`window.open` or `shell.openExternal`).
3. Notice when the file changes (watch it, or a "Reload from Frameling" button) and load the new atlas.
4. Offer it only when `manifest.source` isn't `null`, since without the source there's nothing to edit.

## Plugins

Sandboxed add-ons that add commands, exports and panels: see [docs/plugins.md](docs/plugins.md) for the API, the
sandbox and the threat model. Examples are in `plugins/examples/`. Installed plugins live in `library/plugins/` in the
user data folder.

## Templates

Built-in templates are built in code (`src/templates/`). Your templates are `.frameling` files with a `template.json`
beside the drawing (name, blurb, kind, tags, author, licence, card frame; `src/templates/community.ts`), kept in
`library/templates/` in the user data folder. Files dropped into that folder show up too. The welcome
sheet lists sources from `registerTemplateSource` (`src/templates/user.ts`), so an online gallery can be added later
as one more source with its own section; there is no server for one today.

## How it's put together

The full map is [docs/architecture.md](docs/architecture.md). In short:

- `src/main/`: the Electron main process (windows, dialogs, files, autosave copies, the user library, FFmpeg).
- `src/preload/`: the small, safe bridge between the page and the desktop (`window.frameling`).
- `src/platform/`: the few things the page does for itself rather than through the desktop bridge.
- `src/renderer/`: the page's entry (`main.tsx`, `App.tsx`), `features.ts` (loads every area) and the `?debug` hooks.
- `src/core/`: the document format (`format.ts`), the store with undo (`store.ts`), the registries, and the single
  renderer (`render.ts`) and posing (`symbols.ts`) every view and export uses.
- `src/canvas/`, `src/tools/`, `src/timeline/`, `src/ui/`: the canvas engine, the tools, the timeline, and the shell
  (dock, menus, palette, keyboard, preferences, themes, help, Quill, onboarding, sounds).
- One folder per feature: `artboards`, `audio`, `camera`, `effects`, `flow`, `geometry`, `lipsync`, `particles`,
  `pixel`, `quests`, `rig`, `select`, `symbols`, `text`, `tiles`.
- `src/io/`: files, autosave, recovery, versions. `src/export/`: every exporter. `src/plugins/`: the plugin sandbox
  and API. `src/interactives/`: the .flplay round trip. `src/templates/`: templates.
- `test/`: vitest. `scripts/`: dev, build, install, the mascot build, and the Electron harnesses (`e2e/`, `perf/`,
  `docs/`, `dialogue/`, `a11y.cjs`, `shoot.cjs`); see [docs/testing.md](docs/testing.md).
- `public/`: help media, the mascot sheet, the plugin host pages. `brand/`: mascot sources, A/B shots, the dialogue
  review page. `godot/`: the Godot importer add-on. `plugins/examples/`: example plugins.
- `.github/workflows/build.yml`: the Windows, macOS and Linux builds.

Branches: work happens on `development`, which reaches `main` through pull requests, and each pull request builds the apps.

## Signing (pilot)

Releases are signed the cheap way for now, like Godot's own builds:

- **Windows:** signed with Frameling's self-signed code-signing certificate (publisher "Frameling (self-signed)"). The
  build uses it when the repository secrets `WIN_CSC_LINK` (the .pfx, base64) and `WIN_CSC_KEY_PASSWORD` are set, and
  builds unsigned otherwise. The certificate's public half is `build/frameling-codesign.cer`; the private key and its
  password live outside the repo, with the maintainer. SmartScreen still warns ("More info", "Run anyway").
- **macOS:** ad-hoc signed after packaging (`build/adhoc-sign.cjs`, `codesign --sign -`), so Apple Silicon will run it
  once it's allowed (right-click, Open). Not notarised.
- **Linux:** the AppImage needs no signing.

The in-app help topic "Installing Frameling" walks people through the first-run prompts. Moving to paid certificates
later means setting `CSC_LINK`/`CSC_KEY_PASSWORD` (and Apple's notarisation variables) and removing the ad-hoc hook.
