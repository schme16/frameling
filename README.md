# Frameling

A friendly desktop tool for drawing and animating 2D art, made for vector and pixel art alike. Draw frame by frame or tween between poses, then export to video, GIFs, sprite sheets, Godot, and natively into Interactives.

Early days: what's here is the empty app shell and the build pipeline. The plan lives on the project board (project `frameling`, doc `evaluation`).

## Get it

Every pull request into `main` builds the app for all three systems. Open the pull request's **Checks**, then **Build desktop apps**, and download it from **Artifacts** at the bottom of the run:

| System | File |
|---|---|
| Windows | `Frameling-<version>-setup-x64.exe` (installer) or `...-portable-x64.exe` (runs without installing) |
| macOS | `Frameling-<version>-mac-arm64.dmg` (Apple silicon) or `...-mac-x64.dmg` (Intel) |
| Linux | `Frameling-<version>-linux-x86_64.AppImage` (make it executable, then run it) |

The builds aren't signed yet, so on Windows click **More info → Run anyway**, and on macOS right-click the app and choose **Open** the first time.

## Work on it

Needs Node 22.

```bash
npm install
npm run dev            # opens the app with hot reload
npm test               # tests
npm run build          # mascot, type check, then build into dist/
npm run build:mascot   # just rebuild Quill's sprite sheet and the app icons
npm run dist           # installers for this system, into release/
```

### Install on this Linux machine

```bash
npm run install-local                 # build the AppImage and install it
npm run install-local -- --no-build   # install the last build without rebuilding
```

This copies the AppImage to `/mnt/109313D2109313D2/lutris-applications/frameling/frameling.AppImage`. If Frameling is running from there, the script closes it first so the file can be replaced. Set `FRAMELING_INSTALL_DIR` to install somewhere else.

### Editing the mascot

Quill, the mascot, is drawn in Frameling itself. The source files are in `brand/mascot/`:

- `mascot.frameling`: every animation. A 48 x 48 pixel layer at 100 fps (one frame is 10 ms), with one clip per
  animation (idle, wave, talk, point, cheer, think, draw, sleep, oops). The clip's loop setting is whether it loops.
- `mascot-icon.frameling`: the app icon. The 32 px icon is on frame 0 (clip `icon32`, layer "32 px") and the
  hand-drawn 16 px one is on frame 1 (clip `icon16`, layer "16 px", pixel size 2). The 16 px art is used at 16 and
  48 px, the 32 px art everywhere else.

To change Quill: open the file in Frameling, edit, save, then run `npm run build:mascot` (`npm run build` does this
first anyway). That writes `public/mascot/mascot.png` + `mascot.json` (what the app plays), `build/icon.png`,
`build/icon.svg`, `build/icons/` and `public/mascot/logo.png`, touching only files that changed. Commit those along
with the `.frameling` file.

How the file becomes the sheet: each clip is an animation; a sheet frame lasts as long as its cels stay the same, so
holding a drawing for 30 frames makes a 300 ms frame. Visible pixel layers are flattened (hidden layers are skipped,
so a hidden layer is a good place for reference sketches); vector layers are left out with a warning. Keep clip names
as they are: the app asks for animations by name. `brand/quill/` is the old generator the art was first made with,
kept for history only.

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
- `frames`: the cell for each frame. A held drawing is the same cell several times, so it is stored once.
- `clips`: `{name, start, end, loop, runs}`, frames inclusive and counted from the package's first frame. `runs`
  is the clip as `{cell, frames, ms}`, for players that step picture by picture. Names are unique.
- `markers`: `{name, frame}`, sorted by frame. Several can share a name (two footsteps).
- `layers`: `{name, kind, visible, opacity, pixelSize?}`, for information. Frames are already flattened.
- `source`: `"source.frameling"` or `null`.

Changes stay additive: a new field is optional, and anything that would break an older player bumps `version`.

## How it's put together

- `src/main/`: the Electron main process (windows, menus, files).
- `src/preload/`: the small, safe bridge between the page and the desktop (`window.frameling`).
- `src/renderer/`: the app's interface (React and TypeScript, built with Vite).
- `scripts/`: dev, build and local install scripts.
- `.github/workflows/build.yml`: the Windows, macOS and Linux builds.

Branches: work happens on `development`, which reaches `main` through pull requests, and each pull request builds the apps.
