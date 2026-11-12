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
the store skips it entirely in a document with no variations.

**Own drawings.** A variation's keys point at its own drawings in `doc.drawings`, `<original id>~<artboard id>`, which
are the original's object with a different `id` until an edit replaces it (immer copies on write, so the original is
never touched, and a tool that writes `doc.drawings[drawing.id]` lands on the right one). A vector recolour is stored
as shape property patches (so geometry edits to the original still arrive); a pixel or tile edit stores the whole
drawing for that key (`replaced`).

**Actions** (`variations.ts`, each one undo step): `makeVariation` (also from a variation: same changes, same
original), `setVariationSize` (square, wide, tall or any size; the original is framed by a camera: its own camera keys
are zoomed, or a "Framing" layer is added; Fill or Fit, the choice `variations.frame`), `resetDifference` (one
item), `resetVariation` (all), `detachVariation` (a plain artboard keeping what it shows), `changeVariation` (for code
that edits a set-aside variation, which would otherwise be overwritten by the next resolve). `listDifferences` is what
the panel shows: grouped by layer, a recolour across many keys on one line, each with where to jump and how to reset.

**Limits, on purpose.** Sound, symbols, palette, swatches, tiles and layer folders are shared with the original, so a
variation does not override them. A size override frames the picture with a camera at the moment it is set; if the
original is resized later, the variation's zoom is not recomputed (it is an override). Deleting an original turns
its variations into plain artboards; duplicating a variation makes a plain copy.

**Export.** Nothing special: an exporter asks `artboardDoc(root, id)`, which returns the resolved variation. "Each as
its own file", "all in order, as one" and the atlas therefore work, and the Export dialog's **This artboard and its
variations** ticks the family.

## Pixel sprites: the four ways

A pixel sprite is built one of four ways: **one picture**, **an animation** (frames on the timeline), **frames on
boards** (one artboard per frame, played in order) or **sprites on a sheet** (one artboard per sprite). The file may say
which in `doc.sprite.way`; when it does not, or no longer matches (a "picture" that now has two frames), `wayOf` works
it out (`src/pixel/way.ts`). Conversions are plain functions on a document, one undo step each: `framesToBoards` (each
frame of a one-board sprite becomes a board named Frame 1, Frame 2..., with its own copy of the drawings; clips are not
kept), `boardsToFrames` (boards of one size, layers matched by name, end to end on one timeline, a clip per board for a
sheet; variations, differing sizes and non-pixel layers are refused with the reason). Frames on boards and sprites on a
sheet swap by changing the label only. Export starts on the way: frames on boards as "all in order, as one", a sheet as
"packed onto one sheet" (`src/pixel/sheetMode.ts`), and Quill's sentence at the top of the Sprite sheet options follows
the mode that is picked.
