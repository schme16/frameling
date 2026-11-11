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
- **Onion skin and timeline** belong to the open artboard (they read `doc.layers`).
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
- **Export "All in order, as one"** (video and animation formats) builds one document with `joinShots`: the shots end
  to end, each a clip named after it, markers and sounds moved along, a shot's own stage colour as a filled layer
  underneath when they differ, one merged camera layer (the plain view where a shot has none), and in-betweens cut at
  each shot's end. Shots must be the same size; the dialog says so when they aren't.
- **Export "Each as its own file"** gives a file per shot.

### Not done yet / later

- When exporting several, the Export dialog's own summary line and "A clip" still describe the open artboard (the
  Which artboards row gives the joined total).
- Shots of different sizes can't be joined (letterboxing would be the next step).
- Transitions between shots, and a storyboard view of all shots as a strip.
- Variations (B), if it turns out to be wanted: an optional `crops` list on an artboard, exported as extra files.
