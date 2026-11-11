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

The same run also has **frameling-web**: the web version, for machines where installing isn't allowed (see below).

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

### The web version

```bash
npm run build:web      # static files into dist/web/
npm run preview:web    # serves dist/web on http://localhost:5198
```

`dist/web/` is plain static files with relative paths, so it can be copied into any folder of any web server (a
sub-path like `/tools/frameling/` is fine). It needs https (or localhost) for the offline copy and "Install as an app"
to work. Nothing is deployed anywhere automatically.

It is the same page as the desktop app. `src/platform/` works out where it's running: the desktop app's preload
script puts the bridge on `window.frameling`, and in a plain browser `src/platform/web/` builds the same bridge in the
page. Everything else goes through that bridge, so very little code knows the difference.

| | Chrome, Edge | Firefox, Safari |
|---|---|---|
| Open and save | File System Access: Save asks once, then saves in place | Open is an upload; Save downloads the file each time |
| Open recent | Remembers the files (the browser may ask to allow access again) | Reopens the browser's own copy of the file |
| Multi-file exports (sprite sheet, tileset) | Into a folder you pick | One .zip download |
| Autosave and Recover unsaved work | IndexedDB, every 15 seconds and when the tab is hidden, kept 7 days | Same |
| Install as an app, offline | Yes (manifest, service worker, opens .frameling files) | Offline after the first visit. Safari can add it to the Dock or Home Screen; Firefox can't install it |

Not in the browser: ProRes export (it runs FFmpeg on the computer), fonts installed on the computer for text, "Show in folder", the native "Save changes?" on close (the browser's own "Leave site?" shows
instead, and the work is put aside in Recover unsaved work), and shortcuts the browser keeps (Ctrl+N, Ctrl+W, Ctrl+T).
The in-app help topic "Frameling in a web browser" says the same in plain words.

### Install on this Linux machine

```bash
npm run install-local                 # build the AppImage and install it
npm run install-local -- --no-build   # install the last build without rebuilding
```

This copies the AppImage to `/mnt/109313D2109313D2/lutris-applications/frameling/frameling.AppImage`. If Frameling is running from there, the script closes it first so the file can be replaced. Set `FRAMELING_INSTALL_DIR` to install somewhere else.

### Editing the mascot

Quill, the mascot, is drawn in Frameling itself. The source files are in `brand/mascot/`:

- `mascot.frameling`: every animation. A 48 x 48 pixel layer at 100 fps (one frame is 10 ms), with one clip per
  animation (idle, wave, talk, point, cheer, think, draw, sleep, oops, sad, wave-sad). The clip's loop setting is whether it loops.
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

Two scripts in `brand/mascot/` still compose poses from those old part grids (`compose.mjs`) and write them into
`mascot.frameling`: `add-sad.mjs` adds the `sad` and `wave-sad` clips (`--force` redraws them, `--preview` only
writes `brand/ab/sad-quill/contact-6x.png`), and `redraw-arms.mjs` swaps every old arm for the chunky ones built in
`arms.mjs`, in place. Hand edits made in Frameling are left alone by both.

### Editing Quill's words

Everything Quill says is in one file, `src/ui/mascot/lines.json`: the first-run hello, his reactions, the Strawberry
gushing, nodding off, goodbye and welcome back, the quest cheers and badge card, the welcome sheet, About, empty
states and his toasts. Each entry has the `text`, a `where` (when and where it shows) and the `vars` it uses. Words
in `{curly}` brackets are filled in by the app, so keep them. A list is several bubbles shown together, or a set the
app picks from (silly names, quest cheers). Quest step instructions are tutorial content and stay in
`src/quests/library.ts`; help topics and plain app messages (errors, saving) aren't in it either.

The easy way to edit them is the review page, `brand/dialogue/index.html` (open it straight from disk). Each line
has its screenshot in place and a box to change it; your edits are kept in that browser until you reset them.

1. Edit the lines on the page, then press **Download my changes** (or **Copy my changes** and paste into a file).
2. `npm run dialogue:apply ~/Downloads/quill-lines-2026-11-11.json` merges them into `lines.json` and prints what
   changed. It refuses the whole file, and writes nothing, if a line lost or gained a `{placeholder}` or names a line
   that doesn't exist. Add `--check` to see the changes without writing them.
3. `npm run dialogue:page` refreshes the page's text; `npm run dialogue:shots` rebuilds the app and retakes every
   screenshot too (about two minutes; it drives an off-screen window, see `scripts/dialogue/shots.cjs`). A shot
   that only shows the nearest moment says so under the line.

Code reads the lines through `line(id, vars)`, `lines(id, vars)` (for lists) and `lineParts(id, vars)` (to fill a
placeholder with bold text) in `src/ui/mascot/lines.ts`; the ids are typed, so a typo fails `npm run typecheck`. A new
line goes in `lines.json` with its `where`, and in the moments list in `shots.cjs`. `test/ui/quill-lines.test.ts`
checks every line is used, every id used exists, and the placeholders match.

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
user data folder (web: IndexedDB).

## Templates

Built-in templates are built in code (`src/templates/`). Your templates are `.frameling` files with a `template.json`
beside the drawing (name, blurb, kind, tags, author, licence, card frame; `src/templates/community.ts`), kept in
`library/templates/` in the user data folder (web: IndexedDB). Files dropped into that folder show up too. The welcome
sheet lists sources from `registerTemplateSource` (`src/templates/user.ts`), so an online gallery can be added later
as one more source with its own section; there is no server for one today.

## How it's put together

- `src/main/`: the Electron main process (windows, menus, files).
- `src/preload/`: the small, safe bridge between the page and the desktop (`window.frameling`).
- `src/renderer/`: the app's interface (React and TypeScript, built with Vite).
- `src/platform/`: which bridge the page has (desktop or browser), and the browser one itself.
- `src/plugins/`: the plugin sandbox and API. `src/interactives/`: the .flplay round trip. `src/templates/`: templates.
- `scripts/`: dev, build and local install scripts.
- `.github/workflows/build.yml`: the Windows, macOS and Linux builds, and the web build.

Branches: work happens on `development`, which reaches `main` through pull requests, and each pull request builds the apps.
