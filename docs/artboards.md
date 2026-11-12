# Artboards

Board task 14: "multiple nameable artboards (probably most useful for pixel artists, but have a think how it could be
done for animation too)".

An artboard is a named canvas inside one document, with its own size, background, place on the pasteboard and export
name. All artboards share the document's palette, swatches, symbol library, tileset, folders' look and fps. The code
is `src/artboards/`; the A/B for animation is in `brand/ab/artboards/`.

## The format

Doc version stays 1. Two optional fields, so every older file opens unchanged, and a file without them is one
artboard (the document itself, at 0, 0, called "Artboard 1"):

| Field | Meaning |
|---|---|
| `doc.artboards` | `Artboard[]`, in list order (the panel, Play all and exports use this order). |
| `doc.activeArtboard` | The id of the open one. |
| `Artboard` | `{ id, name, x, y, exportName?, content? }`. `x`, `y` is its top-left on the pasteboard. |
| `Artboard.content` | `{ width, height, background, length, layers, clips, markers, flow?, audio?, guides?, inOut?, perspective? }`, only on the artboards that aren't open. |

**The open artboard's content is the document's own fields.** That one decision is what keeps the feature small and
safe: every tool, the timeline, onion skin, the renderer, undo and every exporter already work on `doc.layers`,
`doc.width` and so on, so they work on the open artboard without knowing artboards exist. Going to another artboard
is one undo step that swaps the two (`switchArtboard`): the open one's fields go into its `content`, the other's come
out. Drawings stay in the shared `doc.drawings`, so pixels and shapes are never copied by a switch.

Content is measured from the artboard's own top-left, so a pixel drawing is exactly its artboard's art grid and
resizing one artboard never touches another's drawings.

Things that walk "every layer in the document" now include set-aside artboards: `pruneDrawings` (so drawings on other
artboards survive), `allLayerLists`/`symbolUsage` (so a symbol used only on another artboard isn't "unused") and
`anyLayer` (rig lookups).

In the `.frameling` zip, set-aside artboards' layers go through the same layer reader as the stage's; their sounds
are stored as `audio/<id>.<ext>` entries like the open one's. Reading repairs what it can: an unreadable artboard is
left out with a warning, and if no entry is marked open, the document's own content becomes an artboard so nothing
is lost (`src/artboards/io.ts`, tests in `test/artboards/model.test.ts`).

## Pixel art (built)

- **Artboard tool** (Shift+W): drag on the empty pasteboard to make one, drag one to move it (Shift keeps it level),
  drag its edges or corners to resize it (the drawing stays put), Alt+drag to copy. Pixel art snaps to whole art
  pixels. Clicking an artboard opens it.
- **Draw on whichever you click**: any drawing tool pressed on another artboard opens it first (a pointer-down hook in
  the canvas engine), and the view moves by the distance between them so nothing jumps. Each artboard remembers the
  frame and layer it was left on.
- **The pasteboard** shows the other artboards behind the open one at their own frames, each with its name above it
  (`Underlay.tsx`, cached bitmaps per artboard, redrawn only when that artboard changes).
- **Artboards panel**: list with thumbnails, click to open, double-click to fill the window, drag (or the arrows) to
  reorder, rename, duplicate (with its own copies of the drawings), delete (the last one stays). Below: name, export
  name, size and background (or see-through). Buttons: New artboard, Fit all, Play all in order, Export artboards,
  Line up.
- **Onion skin and timeline** belong to the open artboard (they read `doc.layers`), and follow you: a press with any
  tool but the view tools and the Artboard tool on another artboard, or on its name above it, opens it first
  (`openArtboardUnder` in `ops.ts`, called by the pointer-down hook), so the timeline, stage and tool all switch
  together. There is one source of truth: the open artboard is the one with no `content` (`doc.activeArtboard` only
  says which when that is ambiguous), and everything else, the timeline included, reads the document's own fields.
- **View**: Zoom to artboard, Fit all artboards (Ctrl+Alt+0), next and previous (Alt+PageDown, Alt+PageUp).
- **Export** (a "Which artboards" row in the Export dialog, shown when there's more than one):
  - This artboard: the usual export.
  - Each as its own file: every ticked artboard through the chosen format and settings, named by its export name,
    into a folder or one zip (asked the first time, then remembered: choice `artboards.exportAs`).
  - Packed onto one sheet (Sprite sheet format): every frame of every ticked artboard trimmed and packed on one
    picture, with a JSON atlas (hash style) whose animations are the artboards and their clips as "artboard/clip"
    (`pack.ts`, pure and tested).

## Animation: two ways it could work

**A. Shots (scenes).** Each artboard is a mini document: its own layers, timeline and length. Shown side by side on
the pasteboard, switched from the Artboards panel. "Play all in order" plays them back to back; export one, some or
all, each its own file, or joined into one film.

**B. Variations.** Artboards share one timeline and one set of layers; each is a camera-like crop (16:9, square,
tall) or holds an alternative version of the same animation.

**Recommendation: A.** It's the same model pixel artists need (a sprite per artboard, each with its own frames), so
one feature serves both, and it's what a story told in shots needs: different lengths and different layers per shot.
B's real use, one animation delivered at several sizes, is better served later by export presets or the camera than
by artboards. A/B: `brand/ab/artboards/ab.png` and `ab.mp4` (A built, B mocked).

### What's built for A

- Switching is the same as for pixel art.
- **Play all in order** opens a player window: each shot at its own size, fitted, for its own length, with a strip of
  shots to jump between and a loop switch. It never changes the document.
- **Export "All in order, as one"** (video, animation and Sprite sheet formats) builds one document with `joinShots`: the shots end
  to end, each a clip named after it, markers and sounds moved along, a shot's own stage colour as a filled layer
  underneath when they differ, one merged camera layer (the plain view where a shot has none), and in-betweens cut at
  each shot's end. Shots of different sizes are fitted (below). With Sprite sheet the boards are the frames of ONE sprite
  (`filmOf` in `export.ts`): the clips are dropped so the engine data has a single animation, `default`, with every
  frame of every ticked board in list order, and the range is always the whole film. Tested per engine format in
  `test/artboards/frames-sheet.test.ts`; `frames-sheet-e2e.test.ts` (GODOT_BIN) and `scripts/e2e/artboards.cjs`
  (also WEB_ENGINES=1) load the files in the real engines.
- **Export "Each as its own file"** gives a file per shot.

### Shots of different sizes

The picture is the first shot's size (`joinShots` takes a `size` to override). A shot of another size is placed in it
by **camera keys**, not by copying or scaling anything: the joined film's one camera layer gets, for that shot, the
view `{ x: width / 2, y: height / 2, zoom: k }` (the shot's own camera keys have their zoom multiplied by `k`, which
is exact because zoom is a ratio), so every exporter and the renderer handle it with no new code. `fit.ts` is the
pure maths (`fitPlacement`), and the choice `artboards.fit` (Preferences > Behaviour, and the Fit/Fill buttons in the
player and the Export row) says which:

- **Fit (bars)**, the default: `k` is the smaller ratio, so the whole shot shows, centred. The bars are a layer on top
  of the shot's layers, drawn in stage space where the camera will put the picture's edges (one drawing per
  distinct camera view, so a still shot has one), which also hides whatever hangs off the stage. Colour: the first
  shot's background by default, or black or white (choice `artboards.barColor`); no bars if it is see-through.
- **Fill (crop)**: `k` is the larger ratio, no bars, the overhang is cropped.

A shot the same size as the picture is untouched, and if no shot differs and none has a camera, no camera layer is
added (the join is exactly as before). A shot's depth (parallax) layers scale by `k` to the power of their factor
under a camera, so on a fitted shot they sit a little off the plain fit; rarely visible. Play all in order uses the
same maths on its canvas. Each-as-its-own-file and the atlas never fit: every artboard keeps its size.

Checked end to end by `scripts/e2e/artboards.cjs` (pixel colours of the bars, the crop and the hidden overhang).

### Not done yet / later

- When exporting several, the Export dialog's own summary line and "A clip" still describe the open artboard (the
  Which artboards row gives the joined total).
- A picture size other than the first shot's (the code takes one; there is no control for it yet).
- Transitions between shots, and a storyboard view of all shots as a strip.

## Variations (linked copies)

Built (board task `variations-linked`). B above, done properly: a **variation** is an artboard that follows another
artboard (its **original**) and stores only what it changes. The code is `src/artboards/variations.ts` (pure),
`variationsIo.ts` (file reading, saving), `variationOps.ts` (store actions), `VariationPanel.tsx` (the panel part),
tests in `test/artboards/variations.test.ts`, and a real-app export check in `scripts/e2e/variations.cjs`. The file
format is in `docs/format.md` ("Variations").

**How it fits the one decision above** (the open artboard's content is the document's own fields): a variation is
edited like any artboard, and two directions of bookkeeping keep it linked, done by `settleVariations` which the
store runs after every change, **inside the same undo step** (`registerSettler` in `src/core/store.ts`):

- The **open** variation's overrides are worked out again from what is on the stage, against its original
  (`diffContent`). Nothing in the tools knows about it: draw, recolour, move a key, hide a layer, and the overrides
  follow.
- A variation that is **not open** gets its `content` worked out from its original and its overrides
  (`resolveContent`), so the pasteboard, thumbnails, Play all and every exporter read it like any artboard. Editing the
  original therefore flows into it, except where it overrides.

Both are cheap: resolving and diffing keep unchanged layers, keys and shapes as the very same objects (memoised), and
the store skips it entirely in a document with no variations. The settler is also **incremental**: the store hands it
the change's immer patches (`SettleContext`), and `touchOf` reads from them which drawings were written, whether the open
artboard's own fields or key lists changed, and which set-aside artboards' content changed. A variation whose original
did not change and that nobody wrote a drawing of is not looked at; a drawing-only edit re-diffs just the touched
drawings (`IncrementalDiff`) or re-resolves just the touched ones (`IncrementalResolve`); an edit that touches key lists
or anything unclear (the whole `drawings` table, the artboard list) does the full pass. On a 9,600-key document
(40 layers x 240 keys, one drawing per key) the settling now costs about 0.03 ms. What is left per edit is immer
copying the `drawings` table (see `test/artboards/variationsPerf.test.ts`, which prints the numbers; run it with
`VARIATIONS_PERF=1`). A variation that is **not open** keeps a copy only of the drawings it overrides, so the table is
at most twice the original's however many variations there are: editing a drawing of the original went from 16 ms
(one variation) and 55 ms (four) to 2 ms in both.

**Own drawings.** The **open** variation's keys all point at its own drawings in `doc.drawings`,
`<original id>~<artboard id>`, which are the original's object with a different `id` until an edit replaces it (immer
copies on write, so the original is never touched, and a tool that writes `doc.drawings[drawing.id]` lands on the
right one). A variation that is **closed** points a key at its own copy only when it overrides that drawing; every other
key points straight at the original's drawing, so the original's edits reach it with no work and no table entry
(`resolveContent` with `all` false, the default). Opening one (any `switchArtboard`, or a file that was saved on a
variation) makes the settler give every key its copy (`openAliasing`; a few tens of milliseconds for 9,600 keys, one
immer patch per copy), and closing it drops the copies nobody overrides. A vector recolour is stored
as shape property patches (so geometry edits to the original still arrive); a pixel or tile edit makes the variation's
drawing for that key its own (`replaced`) and tools work on the whole drawing in memory. **In a file** such a drawing is
saved as what changed (`variationDiffs` in `variationsIo.ts`): the bounding rectangle of the changed pixels as a small
PNG (`pixels/diff_<id>.png`, `DrawingOverride.diff.rect`), or the changed tile slots as pairs (`diff.cells`); when
the change covers most of the drawing it is stored whole as before. On opening, `applyDiffs` rebuilds the whole drawing
from the original's. A 60-frame 64 x 64 pixel animation with a small scar painted on every key adds about 15 KB to a
600 KB file (it added 606 KB before).

**Actions** (`variations.ts`, each one undo step): `makeVariation` (also from a variation: same changes, same
original), `setVariationSize` (square, wide, tall or any size; the original is framed by a camera: its own camera keys
are zoomed, or a "Framing" layer is added; Fill or Fit, the choice `variations.frame`), `resetDifference` (one
item), `resetVariation` (all), `detachVariation` (a plain artboard keeping what it shows), `changeVariation` (for code
that edits a set-aside variation, which would otherwise be overwritten by the next resolve). `listDifferences` is what
the panel shows: grouped by layer, a recolour across many keys on one line, each with where to jump and how to reset.

**Sound and palette** are overridable. Sound is a list override like layers (`overrides.audio`: a clip's volume, mute,
start and name as patches, clips left out, clips added, with their bytes in the zip beside the others). The palette is
a whole-palette override (`overrides.palette`, a colourway for pixel art): `docPalette(doc)` gives the open variation's,
the palette panel and pixel commands write it through `setVariationPalette`, changing a palette colour recolours only
the open variation's pixel drawings (`paletteScope`), and `artboardDoc` gives the variation its palette for export. The
original's palette changes never reach a variation that has its own.

**Limits, on purpose.** Symbols, tiles, swatches and layer folders are shared with the original, and the shared palette
can only be changed from the original. A change that writes any of them while a variation is open is **refused whole**
by a store guard (`registerGuard` in `src/core/store.ts`, with the sentence "Swatches are shared with the original.
Change them there, or detach this variation."), so nothing is lost or leaks into the original; opening a symbol or a
tile for editing is refused up front the same way (`sharedEditNote`). Detaching a variation with its own palette
keeps its pixels' colours, but the palette list goes back to the shared one. A size override frames the picture with a camera at the moment it is set; if the
original is resized later, the variation's zoom is not recomputed (it is an override). Deleting an original turns
its variations into plain artboards; duplicating a variation makes a plain copy.

**Bones.** Layer ids repeat across an original and its variations, so `anyLayer` in `src/rig/pose.ts` looks for the
bones layer a layer is attached to in that layer's own list first (`bindRig` passes the layer); without that, a closed
variation read through the whole document found the original's skeleton. Poses, bones, attachments and weights made in a
variation are overrides like any layer or drawing property (`test/artboards/variationsRig.test.ts`).

**Looking through the camera** is remembered per artboard (`throughCameraOf`, `toggleThroughCamera` in
`src/camera/ops.ts`, session only), so making a square variation turns it on for that variation only.

**Export.** Nothing special: an exporter asks `artboardDoc(root, id)`, which returns the resolved variation. "Each as
its own file", "all in order, as one" and the atlas therefore work, and the Export dialog's **This artboard and its
variations** ticks the family.
