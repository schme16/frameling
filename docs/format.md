# The .frameling format

The types are in `src/core/format.ts`. That file is the contract the canvas, tools, timeline, exports and files all
build on, and it is meant to become the shared format package Interactives reads, so it has no DOM or Electron
imports. Reading and writing the file is `src/io/file.ts` (pure bytes in and out, so it runs in Node tests and in
`scripts/build-mascot.mjs` unchanged).

Units: positions are document pixels, origin top left, the stage is `width` x `height`. Time is whole frames at
`fps`, frame 0 first. Colours are CSS hex strings (`#rrggbb` or `#rrggbbaa`). Angles are degrees, positive clockwise
on screen.

## The file

A `.frameling` file is a zip (fflate) with:

| Entry | What it is |
|---|---|
| `manifest.json` | `{format: 'frameling', version, app, created, name}`. `app` is the app version that saved it, `created` an ISO date. |
| `doc.json` | The `Doc`, with binary parts swapped for entry names (below). |
| `pixels/<id>.png` | One PNG per pixel drawing. `doc.json` holds the entry name in `pixels` instead of the bytes. |
| `audio/<id>.<ext>` | One entry per sound clip (stored, not compressed). `doc.json` holds the entry name in `data`. |
| `pictures/<id>.<ext>` | One entry per reference picture a layer still shows (`jpg` or `png`, stored as it came). `doc.json` holds the entry name in `data`. Pictures no layer shows are not written. |
| `preview.png` | A small picture of the first frame (the first that isn't empty), longest side 160 px or less, a few KB, with the drawing's background behind it (see-through where it has none). Stored, not compressed. Written on Save by `src/io/preview.ts` for lists of files (Open recent, the welcome sheet); read without reading the rest of the zip (`src/shared/zipTail.ts`, `src/main/preview.ts`). Optional: a file from an older Frameling has none, a build that doesn't know the entry skips it, and the document never reads it. |

Tilemap drawings store `cells` as a plain number list in `doc.json`. Sounds on artboards that aren't open are packed
the same way (`src/artboards/io.ts` `packArtboards`). `saveFile(doc, appVersion)` always saves `rootDoc(doc)`
(`src/core/symbols.ts`), so a symbol open for editing is put back first and `Doc.editing` is never written.

PNGs are cached per pixel array in a `WeakMap` (`pngCache` in `file.ts`). Edits replace pixel arrays rather than
changing them, so an unchanged drawing is never encoded twice, which matters for autosave.

## Version and compatibility rules

- `FORMAT_VERSION` is 3. Every field added since the first commit is optional, so the version was not bumped until
  clip repeat counts changed meaning (see the clips note below): `MIGRATIONS[1]` in `file.ts` turns a version 1 file's
  back and forth repeat counts into the new ones, so every older file still opens and plays as it did. Version 3 is
  trimmed pixel drawings (see `PixelDrawing`): `MIGRATIONS[2]` changes nothing, because a whole-grid drawing is still
  a valid drawing. The bump is there because an older build would take a trimmed drawing for the whole grid and
  misplace it, so it refuses the file instead.
- A new field must be optional, and missing must mean "the old behaviour". Write it only when it isn't the default
  (the readers drop `onion: true`, `blend: 'normal'`, `s: 1` and so on), so files stay small and diffable.
- If a change can't be made optional, bump `FORMAT_VERSION` and add a step to `MIGRATIONS` in `file.ts`:
  `MIGRATIONS[n]` turns a version n document into version n + 1, and `migrate()` runs them in order. A missing step
  means "this file is too old" (`FileProblem`). The list has two steps today (1 to 2, clips; 2 to 3, nothing to change).
- A file whose manifest version is higher than `FORMAT_VERSION` is refused with "made with a newer Frameling".
- Older readers drop fields they don't know without a warning (the tween reader builds a new `Tween` from the fields it
  knows). Consequence for `Tween.slice` (added in `9611002`, after which no release was cut when this was checked): a
  file with cut tweens opens in an older Frameling, but each half of a cut span plays the whole easing curve over its
  own frames, so with a non-linear easing the motion eases twice instead of once. Positions at every key are still
  right; only the in-betweens of cut spans differ. Linear easing is unaffected. This is accepted: carrying the slice
  in a custom bezier would be exact only for bezier easings (bounce, elastic and back have no bezier form), would lose
  the named easing in the editor, and would make new readers read it back as a custom curve. Opening and saving in an
  older Frameling also removes the slices for good.
- Readers never trust the file. Anything odd is repaired or dropped with a plain-words warning, rather than failing
  the whole file. Only structural damage (below) refuses to open.

`test/io/file.test.ts` covers the round trip, the zip layout, friendly errors, newer files, broken documents and
repairs. Most feature folders also have a save and load test of their own fields.

## How loading checks and repairs

`loadFile(bytes)` returns `{doc, manifest, warnings}`; `parseFile` returns just the doc. All errors are `FileProblem`,
whose message is fit to show to a person.

Refused outright:

- Not a zip, no `manifest.json` or `doc.json`, unreadable JSON, `manifest.format` isn't `frameling`.
- Manifest version missing, not a whole number, below 1, or newer than this app.
- `width`, `height` below 1, `fps` not above 0, no `layers` array or `drawings` object.
- A pixel drawing whose PNG entry is missing, misnamed, undecodable or the wrong size. A tilemap drawing with a
  bad size (over 4,000,000 cells, or `cells` the wrong length).
- A layer of an unknown kind, or two layers with the same id.
- Entries over 1 GB unzipped are skipped, and only `manifest.json`, `doc.json`, `pixels/`, `audio/` and `pictures/` are unzipped. A pixel drawing's `x` and `y` are clamped to 0 or more (and at most 1048576).

Repaired, with a warning:

- A drawing that isn't an object or has an unknown kind is left out. Instances, text and particles that fail their
  reader, and anything in a shape list that is not an object with a `type`, are left out. Shapes of an unknown `type`
  are not repaired away: they are kept (see "Data the reader does not know" below).
- A cel pointing at a missing drawing, or at a drawing of the wrong kind for its layer, is dropped (the frames go
  empty). Cels are sorted by `start`; `start` is clamped to 0 or more and `length` to 1 or more.
- A symbol that can't be read is dropped (its instances then draw nothing).
- Tiles with a bad or duplicate key, or no frame whose drawing is a pixel drawing of exactly the tile size, are
  dropped. A tileset with a tile size outside 1 to 1024 is dropped. An optional `gridX`/`gridY` (0 to tile size minus 1, where a tile edge sits from the stage corner) outside that range is dropped. `nextKey` is raised past the highest key.
- Tile extras are all optional and checked on the way in, so an odd or hand-edited file still opens: a tile's `collision` keeps only boxes and polygons with real numbers, clamped to the tile, with at least three corners enclosing some area; a tile's `data` keeps only names the tileset's `dataLayers` lists, fitted to their type; a tile's `terrain` is dropped when its terrain doesn't exist, and edges that touch a terrain that doesn't exist are dropped. An unknown `terrainMode` is dropped (the default is `corners-and-sides`). `nextTerrain` is raised past the highest terrain id.
- A sound whose bytes are missing, or with a duplicate id, is dropped.
- A variation whose original is missing (or is itself a variation) is dropped with a warning. Inside its overrides,
  anything malformed is left out: unknown or badly typed properties in a patch, `__proto__` style keys, layers
  made in the variation go through the ordinary layer reader (so cels at missing drawings are dropped too).
- An artboard that can't be read is dropped. If no artboard is the open one, the document's own content gets a new
  artboard (`artboard-open`) at 0, 0, so nothing is lost.
- `sharedLayers: true` (optional, never in older files): one layer stack for every artboard. A set-aside artboard then
  holds `content.cels` (layer id to cels) and `content.layers: []`; its cels go through the ordinary layer reader as the cels
  of the layer with that id, so cels at missing drawings are dropped. The flag is ignored when an
  artboard is a variation (the app never writes both). See docs/artboards.md.

Repaired quietly (defaults filled, values clamped):

- Layer `name`, `visible`, `locked` default; `opacity` is clamped to 0..1; `depth` to -0.9..100; `pixelSize` rounded,
  at least 1; unknown `label` dropped.
- Effects: unknown kinds dropped, values filled from the effect's defaults (`src/effects/io.ts`), keys deduplicated by
  frame and sorted. Layers naming a missing folder leave it; folders no layer is in or under are dropped. A folder's `parent` is kept
  only when that folder exists; loops and self-parents are cut, and a chain deeper than 8 is cut at the top.
- Bones: a bone whose parent doesn't come before it becomes a root; duplicate ids are skipped; `length` at least 1;
  `s` clamped to `BONE_STRETCH` (0.25 to 3). A skin mesh with bad indices or weight counts is dropped (the layer
  keeps its plain bone bind).
- Tweens: unknown easing becomes `'linear'`, `spin` is rounded, a motion path needs two good points, shape hints
  are kept only on shape tweens, at most 26.
- Clip flow: transitions between clips that don't exist are dropped; triggers are cut to 60 characters; inputs, checks and fades are validated (see Clip flow below).
- Clips: `direction` is kept only when it is one of the four known words (and not `'forward'`); `repeat` only when it
  rounds to a whole number from 2 to 999 (`readClip` in `src/core/clipPlay.ts`, also used for artboards).
- Gradients that don't parse are removed from the shape (`cleanGradients` in `src/core/gradient.ts`).
- Text and particles are read field by field with clamps and defaults (`src/io/shapes-extra.ts`); particle defaults
  come from the shape's `preset`.
- Palette colours must be hex, at most 256; ramps must point inside the palette. `dpi` outside 1..10000 is dropped.
  `inOut` is clamped to the length and put in order; `perspective` keeps at most two points. `exports` keeps only plain
  settings (no format means the entry is dropped), ways without a name or with a repeated id are dropped, and at most 12
  ways are kept (`readExports` in `src/export/saved.ts`).

Stroke, fill and path shapes are otherwise passed through as stored.

## Data the reader does not know

Nothing a file holds is dropped because the app that opens it lacks the feature (a built-in feature turned off, a plugin,
a newer minor version). `src/io/ext.ts`:

- `ext` (`Record<featureId, plain JSON>`) is allowed on the document, every layer, every drawing and every shape.
  It is copied on load and written back unchanged on save. Each feature's entry is checked: keys named `__proto__`,
  `constructor` or `prototype` are skipped, nesting over 24 deep, over 1,000,000 values or over 8 MB as JSON drops that
  entry (with a plain warning), entry names must match `[A-Za-z0-9][A-Za-z0-9._:-]{0,79}`. The owning feature validates
  its own entry when it is active. Lip sync writes `ext.lipsync = { used: true }` on the document.
- A shape of an unknown `type` goes to `VectorDrawing.kept` as `{ at, shape }` (`at` = how many known shapes came before
  it) and is written back in that place. It is never drawn or edited.

Layers of an unknown `kind` are still refused as a damaged file, and unknown plain fields outside `ext` are not kept.

## Types

"Added" is the commit that introduced the field. The whole history is 2026-11-11 to 2026-11-12, so it says which
feature brought it rather than a date that means much. Fields without a note were in the first format commit
(`6ebe31b`).

### Doc

| Field | Type | Notes |
|---|---|---|
| `format` | `'frameling'` | |
| `version` | number | `FORMAT_VERSION` |
| `lineage` | `true` | Optional. Set by `newDoc` and kept on saving: every shape carries lineage (`origin`) from the start, so keys with no shared lineage are unrelated. Missing in older files until they are opened: reading one upgrades it once (`src/core/upgradeLineage.ts`, part of loading, no undo step), so in memory and from the next save it has the flag. Read as `true` or dropped (then upgraded like an old file). |
| `id`, `name` | string | `id` is stable across saves (used for the .flplay link and versions). |
| `width`, `height` | number | Stage size. |
| `fps` | number | |
| `dpi?` | number | Missing = 96. For sizes in mm, cm, in, pt. Added with onboarding (`977be97`). |
| `length` | number | Frames, at least 1. |
| `background` | Color or null | null = see-through. |
| `layers` | `Layer[]` | Bottom first. |
| `drawings` | `Record<Id, Drawing>` | Cels point here; several cels can share one drawing. |
| `clips` | `Clip[]` | Named frame ranges. |
| `markers` | `Marker[]` | Named moments. |
| `swatches` | `Swatch[]` | |
| `tileset?` | `Tileset` | Tiles (`cd7bd81`). |
| `palette?` | `DocPalette` | Pixel palette; missing = starter palette (`6f256d0`). |
| `folders?` | `Record<Id, LayerFolder>` | Layer folders (effects, `ebd1163`). |
| `symbols?` | `Record<Id, SymbolDef>` | (`828d4a8`) |
| `editing?` | `EditFrame[]` | Symbol edit stack. In memory only, never saved (`828d4a8`). |
| `flow?` | `ClipFlow` | Clip state graph (`f587827`). |
| `audio?` | `AudioClip[]` | (`0b554d4`) |
| `pictures?` | `ReferencePicture[]` | The pictures reference layers show: `{id, name, data, mime, width, height}`. Bytes in `pictures/<id>.<ext>`; `width` and `height` are as the picture shows (a phone photo's turn already applied). Shared by every layer and shot that names the id. |
| `guides?` | `Guide[]` | Ruler guides, never exported (`b5f0737`). |
| `notes?` | `CanvasNote[]` | Notes left on the canvas: `{ id, x, y, text, pin?, frame?, layer?, board?, by?, at?, done?, replies? }`. `pin` is `'page'` (the default), `'frame'` (with `frame`) or `'layer'` (with `layer`). Read by `readNotes` (src/notes/model.ts), which drops what is malformed. Never exported: every way out passes the document through `withoutNotes`. An older Frameling ignores the field. |
| `inOut?` | `{start, end}` | Play range, inclusive (`9edd74d`). |
| `perspective?` | `{points: {x, y}[]}` | One or two vanishing points, never exported (`4dfae46`). |
| `exports?` | `{last?: {settings, way?}, ways?: {id, name, settings}[]}` | How the drawing was last exported (what Export again repeats) and up to 12 named ways ("the sprite sheet"). Settings are the Export window's choices as plain data. Missing = never exported; old files have none. |
| `artboards?` | `Artboard[]` | (`d7cd660`) |
| `activeArtboard?` | Id | Missing = the first (`d7cd660`). |
| `sprite?` | `{way}` | How a pixel sprite is built: `picture`, `animation`, `boards` (artboards are the frames) or `sheet` (artboards are separate sprites). Missing = worked out from the document (`inferWay` in `src/pixel/way.ts`), so old files open unchanged. Never added to a file that does not say it. |

### Artboards

`Artboard` is `{id, name, x, y, exportName?, content?}`. `x`, `y` is its top left on the pasteboard. The open
artboard's content is the document's own fields; the others hold theirs in `content`, an `ArtboardContent`:
`{width, height, background, length, layers, clips, markers, flow?, audio?, guides?, inOut?, perspective?}`.
Palette, swatches, symbols, tiles, drawings and fps are shared by all artboards. Missing `artboards` = one artboard.
See `docs/artboards.md`.

#### Variations (linked copies)

An artboard may also carry `variationOf` (the id of another artboard, never itself a variation) and `overrides`.
Such an artboard has **no `content` in the file**: it is the original's content with the overrides on. Both fields
are optional, so older files open unchanged. An older Frameling, which doesn't know them, reads the variation as an
artboard it can't read and leaves it out with a warning (the original is untouched).

```
VariationOverrides = { stage?: Patch, layers?: ListOverride<Layer, ListOverride<Cel>>, drawings?: { [originalDrawingId]: DrawingOverride },
                       audio?: ListOverride<AudioClip>, palette?: DocPalette }
Patch              = { set?: { [property]: value }, del?: property[] }       // only what changed
ListOverride<T,S>  = { items?: { [id]: { patch?: Patch, sub?: S } }, removed?: id[], added?: T[], order?: id[] }
DrawingOverride    = { replaced?: true, patch?: Patch, shapes?: ListOverride<Shape>, view?: Patch, diff?: DrawingDiff }
DrawingDiff        = { rect?: Rect, rects?: Rect[], cells?: [slot, value, slot, value, ...] }   // file only
Rect               = { x, y, w, h, pixels: "pixels/diff_<id>.png" }
```

- `stage` patches `width`, `height`, `background`, `length`, `clips`, `markers`, `flow`, `guides`, `inOut`,
  `perspective`.
- `audio` is by sound clip id: `items[id].patch` changes `volume`, `muted`, `start` or `name`; `removed` are the
  original's clips this variation leaves out; `added` are clips made in it (their bytes in `audio/<id>.<ext>`, `data` names
  the entry, as for any sound). `palette` is `{ changes: [{ from, to }] }`: the pixel palette colours this variation changed, `from` the original's colour and `to` its own. Pixels of the original in a changed colour show in the new one; everything else follows the original. An older file's whole palette (`{ name, colors }`) is read as changes.
- `layers` is by layer id. `items[id].patch` changes layer properties (`visible`, `opacity`, `name`, `blend`, ...);
  `items[id].sub` is the same shape for that layer's cels (`start`, `length`, `tween`, ...; a cel's `drawingId`
  names the original's drawing or one the variation made). `added` are layers (and cels, shapes) made in the
  variation; `order` is only written when the order is not "the original's, then the added ones".
- `drawings` is by the *original's* drawing id: a recolour is `shapes.items[shapeId].patch.set.fill`, a changed camera
  key is `view`, a drawing the variation redrew whole (pixels, tiles) is `replaced: true`. In a file a redrawn
  drawing also has `diff` when the change is smaller than the drawing: `rect` is the changed rectangle (a PNG of just
  that rectangle in `pixels/diff_<id>.png`), `rects` is up to 8 of them when the changes are far apart (a file with one
  change keeps writing `rect`; readers take both, at most 64 rects) and `cells` the changed tile slots. Such a drawing is not in `drawings`;
  reading builds it from the original's drawing and drops `diff`. Without `diff`, the whole drawing is stored in
  `drawings` as `<original id>~<artboard id>`.
- **Which drawings are in `doc.drawings`.** Drawings made in the variation are ordinary entries. A drawing it redrew
  whole is stored as `<original id>~<artboard id>`. Every other `<id>~<artboard id>` entry in memory is worked out
  from the original and never written.
- **Resolution.** Things not named follow the original, including things added to it later (a layer the original
  gains appears in the variation after the layer before it). Ids (layers, cels, shapes) are shared with the original
  on purpose: an override is "that layer, there".
- **Saving.** If the open artboard is a variation, the file is written as if its original were open and
  `variationOpen` names the variation, so it opens on it again. Reading does the reverse and resolves every
  variation (`resolveAfterLoad` in `src/artboards/variationsIo.ts`).

See "Variations" in `docs/artboards.md` for how they are kept in step while editing.

### Guide

`{id, axis: 'x' | 'y', at}`. `'x'` is an up-and-down line at x = `at`.

### Layers

`Layer` is `VectorLayer | PixelLayer | TilemapLayer | CameraLayer`. Every layer has (`BaseLayer`):

| Field | Notes |
|---|---|
| `id`, `name`, `visible`, `locked`, `opacity` (0..1) | |
| `cels` | Sorted by `start`, never overlapping. A frame with no cel is empty. |
| `onion?` | false = left out of onion skin (`b6d4329`). |
| `reference?` | Shown while drawing, left out of every export (`c4c91b3`). |
| `picture?` | `LayerPicture`: a reference picture this layer shows, drawn by the editing canvas only (never by `renderFrame`, so never exported). `{x, y, scale, turn?, shots}`: the middle of the picture in stage pixels, stage pixels per picture pixel, degrees clockwise about the middle, and `shots: {picture, start, length?}[]` in order of `start` (a shot holds until the next one, or for `length` frames). One placement per layer. A shot naming a picture that isn't in `Doc.pictures` is dropped on reading. |
| `bind?` | `LayerBind`, attached to a bone (`0b554d4`). |
| `blend?` | `BlendMode`, missing = normal (`ebd1163`). |
| `effects?` | `LayerEffect[]` (`ebd1163`). |
| `clipToBelow?` | Clip to the layer below (`ebd1163`). |
| `mask?` | `'show' \| 'hide'`: a mask layer, never drawn itself (`ebd1163`). |
| `folder?` | Key of `doc.folders` (`ebd1163`). |
| `depth?` | Parallax distance from the camera, missing = 0, kept above -0.9 (`f587827`). |
| `label?` | Timeline colour, one of `LAYER_LABELS` (`f2492a4`). |

Per kind:

- `VectorLayer` (`kind: 'vector'`): `drawMode?: 'object' | 'merge'` (merge drawing, `e2de242`), `rig?: Rig` (makes it a
  bones layer, `0b554d4`).
- `PixelLayer` (`kind: 'pixel'`): `pixelSize` (document pixels per art pixel, whole, 1 or more), `paletteLock?`
  (`6f256d0`), `slices?: Slice[]` (named rectangles on the sprite, see below; optional, no version bump).
- `TilemapLayer` (`kind: 'tilemap'`, `cd7bd81`): `pixelSize`.
- `CameraLayer` (`kind: 'camera'`, `f587827`): draws nothing; the first visible camera layer frames playback and
  every export.

### Slices (pixel layers)

`PixelLayer.slices` is an optional list of named rectangles on the sprite, in the layer's art pixels (0, 0 is the layer's
top left): `{ id, name, x, y, w, h, center?, pivot?, color? }`. `center` (`{ x, y, w, h }`, inside the slice) makes it a
9-patch: the border around it keeps its size when the picture is stretched. `pivot` (`{ x, y }`, may sit outside) is where
the sprite turns and sits. The reader keeps a slice with a name and a size of 1 or more, rounds its numbers, drops a
damaged centre or pivot, and renames a repeated id. A slice that changes between frames has optional `keys`, sorted:
`{ frame, x, y, w, h, center?, pivot? }` with `frame` a timeline frame of the board, each key holding from its frame until
the next (before the first key the slice sits at the first key). The slice's own `x`, `y`, `w`, `h`, `center` and `pivot`
always equal its first key, so a reader that does not know about keys still sees the first place (the reader repairs
this). Aseprite keys import this way, at the timeline frame where each Aseprite frame starts. Exports gather the slices of every visible
pixel layer of the board and write them into the engine data (see the sprite sheet export).

### Cels

`Cel` is `{id, start, length, drawingId, tween?, autoHold?}`. `length` is the exposure (1 = on ones). `tween` makes
in-betweens to the next key on the layer when it starts right where this one ends (`828d4a8`). `autoHold` (`cd5f717`)
means the hold reaches the next key and gives way when someone draws on a later frame of it.

### Drawings

`Drawing` is one of:

- `VectorDrawing`: `{id, kind: 'vector', shapes, pose?}`. Shapes paint in order, index 0 at the back. `pose` is the
  bone pose at this key on a bones layer (`0b554d4`).
- `PixelDrawing`: `{id, kind: 'pixel', x?, y?, width, height, pixels: Uint8ClampedArray}`. RGBA of the block that is
  held: `width` x `height` art pixels at (`x`, `y`) from the top left of the layer's art grid (`ceil(doc.width /
  pixelSize)` by `ceil(doc.height / pixelSize)`); missing `x` and `y` are 0. A drawing holds only the painted part
  (every pixel that is not fully see-through is inside the block), so a 24 x 24 sprite on a 2000 x 2000 page is 2 KB,
  not 16 MB. A blank drawing is 0 x 0 with no bytes. Older files, and tile frames (always exactly one tile), are the
  whole grid at (0, 0), which is still valid. A PNG in the file holds the block, and `doc.json` has `x` and `y` beside
  it (left out when 0). A blank drawing has `width: 0, height: 0, pixels: ""` and no PNG entry. Edits replace the
  array, never mutate it. Code that wants the whole grid (fills, selections, filters) calls `gridPixels(d, gridW,
  gridH)` and writes a grid-sized result with `setGridPixels` (`src/core/pixelBounds.ts`), which trims it. The block is
  trimmed after every edit, when a file is opened (older files too) and when one is saved; tile frames are never
  trimmed. Variation changes (`DiffRect`) stay in grid coordinates and are worked out over both drawings' blocks.
- `TilemapDrawing` (`cd7bd81`): `{id, kind: 'tilemap', columns, rows, cells: Uint32Array}`. Row by row; 0 is empty,
  otherwise a tile key in the low 28 bits (`TILE_KEY_MASK`) plus `TILE_FLIP_X`, `TILE_FLIP_Y`, `TILE_FLIP_D` (the
  same bits Tiled uses). Edits replace the array.
- `CameraDrawing` (`f587827`): `{id, kind: 'camera', view: {x, y, zoom, rotation}}`. Centre in stage pixels; zoom 2
  shows half as much. Missing view values read as the stage centre, zoom 1, no turn.

### Shapes

`Shape` is `StrokeShape | FillShape | PathShape | InstanceShape | TextShape | ParticlesShape`. All have an `id` and an
optional `group` (shapes sharing a group select and move together and never merge; `e2de242`).
All also have an optional `origin`: the id of the shape this one was copied from when a new key was made (`cloneDrawing`),
kept through later copies, so every copy of a shape in later keys shares one lineage (`origin ?? id`). A selection follows
the same shape from key to key by it. Missing in the first shape of a line. Documents from before it existed are upgraded when they
open (see `lineage` in Doc): in each layer, walking the keys in time order, a key with no `origin` anywhere whose shape count
equals the key before gets each shape's `origin` from the shape at the same place when the kinds match (the rest stay roots),
and `lineage: true` is set. Keys that already had `origin` keep it, repointed at the older line. (The place-matching fallback in
`followSelection` stays for documents held in memory without the flag.) Paste and
Duplicate make a shape of its own (no `origin`). A non-string or empty `origin` in a file is dropped on reading. Ignore it
when comparing two drawings for "same look" (as `id` is ignored).

- `StrokeShape` (`type: 'stroke'`): `points: {x, y, p}[]` (p = pressure 0..1, 0.5 without a pen), `brush:
  BrushSettings` (`size, thinning, smoothing, streamline, taperStart, taperEnd, capStart, capEnd`, and `tip?`), `color`,
  `opacity`. Kept as input points so it re-renders losslessly. **Brush tips** (`brush.tip`, all optional, missing = a plain
  line, so older files read unchanged): `kind` is `'chalk' | 'charcoal' | 'watercolour' | 'stamp'`, and the rest depend on it:
  `amount` and `grain` (chalk and charcoal: how much grain, 0 to 1, and how coarse, 0.5 to 3; watercolour: `amount` is the edge
  strength), and for a stamp `shape` (`dot | leaf | star | diamond | dash | heart | custom`), `spacing` (a share of the
  brush size), `jitter`, `angle` (`follow | upright | random`), `scatter`, `custom` (a made-from-a-selection stamp as closed
  outlines, flat `[x, y, ...]` lists centred on 0 and 1 unit across, at most 90 points in all) and `seed` (set when the line is
  drawn, so the random parts stay put). A tip is read by `readTip` (`src/geometry/tip.ts`), on open and when a saved brush is
  read: anything that is not a tip makes the line plain, numbers are held to their range. The line keeps its points; the
  fills and lines a tip draws are worked out by `src/geometry/tipShapes.ts` when drawing and exporting (`poseAt` swaps them
  in, see `src/core/tips.ts`), never stored. A saved brush (`src/brushes`) and a shared brush file hold the same `tip`.
  A pixel brush made from a selection is not in the document: it is the `pixelStamp` tool setting (`src/brushes/stamps.ts`).
- `FillShape` (`type: 'fill'`): `paths: SubPath[]` (even-odd), `color`, `opacity`, `gradient?` (`e352d32`; `color`
  stays as its first stop).
- `PathShape` (`type: 'path'`): `paths`, `fill: Color | null`, `stroke: {color, width, join, cap} | null`, `opacity`,
  `fillGradient?`, `strokeGradient?` (`e352d32`). The stroke can also carry, all optional (a missing one is a plain
  line, so older files read unchanged, and bad values are dropped on open by `cleanStrokeStyle`):
  `dash?: number[]` and `dashOffset?` (dashes and gaps, in **line widths**, so they scale with the line; a dash of about
  0 with round caps is a dot), `arrowStart?` / `arrowEnd?` (`'triangle' | 'open' | 'dot' | 'bar'`, on every open subpath),
  `arrowSize?` (line widths, default 4) and `widths?: {at, w}[]` (width along the line, `at` 0 to 1, `w` times `width`).
  `src/geometry/lineStyle.ts` turns these into plain shapes for the writers; see `test/export/line-style.test.ts` for
  what each format does with them. It can also carry `trim?: {start, end, offset, order?}` (a line that draws itself:
  percents of the line's length; the part between `start` and `end` shows, `offset` slides it, `order` is `'inOrder'`
  to treat several outlines as one long line, missing = each the same; whole line = missing). A `StrokeShape` takes the
  same `trim?` on the shape. Cleaned on open by `cleanTrim`. Between two drawing keys joined by a classic tween the trims
  of the same shape (found by `origin`) blend at the eased progress (`src/core/trimTween.ts`); the timeline shows it as
  the "Draw on" row (`trim`). See `test/trim/`.
- `SubPath` is `{points: PathPoint[], closed}`; `PathPoint` is `{x, y, c1?, c2?}` (cubic controls arriving at it).
- `Gradient` is `{kind: 'linear' | 'radial', stops: {at, color}[], from, to}` in document pixels, so it moves with
  the shape.
- `InstanceShape` (`type: 'instance'`, `828d4a8`): `symbolId`, `transform: Transform2D`, `opacity`, `tint?: {color,
  amount}`, `play: 'loop' | 'once' | 'single'`, `firstFrame`. `Transform2D` is `{x, y, scaleX, scaleY, rotation,
  skew}`, applied translate, rotate, skew, scale around the symbol's origin.
- `TextShape` (`type: 'text'`, `46a6fbb`): `text`, `font`, `size`, `weight` (100..900), `italic?`, `color`, `align`,
  `lineHeight?` (missing 1.2), `letterSpacing?`, `opacity`, `transform`, `animators?: TextAnimator[]`. A
  `TextAnimator` is `{id, kind: fade|slide|scale|rotate|typewriter|wave, by: letter|word|line, direction?, start,
  duration, stagger, order?, amount, angle?, ease?, seed?, on?}`.
- `ParticlesShape` (`type: 'particles'`, `46a6fbb`): an emitter worked out from `seed` for every frame on its own (no
  step simulation), so scrubbing, playback and exports agree. Fields: `transform`, `emitter: point|line|area`,
  `width`, `height`, `rate`, `burst`, `emitFor`, `prewarm?`, `life`, `variance`, `speed`, `direction`, `spread`,
  `gravity`, `wind`, `drag`, `wobble?`, `sizeStart`, `sizeEnd`, `colorStart`, `colorEnd`, `colorBy?`,
  `opacityStart`, `opacityEnd`, `spin`, `sprite` (dot, soft, square, star, spark, streak, confetti, flake, symbol),
  `symbolId?`, `seed`, `max?` (missing 2000), `opacity`, `preset?`. Speeds are pixels per second, times seconds.

### Symbols and tweens (`828d4a8`, shape tweens `f587827`)

- `SymbolDef`: `{id, name, layers, length, origin: {x, y}, frameLabels?}`. Its layers use `doc.drawings`. Content is in
  symbol space (stage space when the symbol was made). `frameLabels` (`0b554d4`) names frames, for mouth charts.
- `Tween`: `{kind?: 'classic' | 'shape', ease, slice?, spin?, path?, hints?}`. Missing kind = classic (instances move
  between the two keys' transforms, opacity and tint). `'shape'` morphs one key's drawing into the next. `slice`
  (`[from, to]` within 0..1, optional) is the part of the easing curve the span plays; it is set when a span is cut in
  two by a property key so both halves together move exactly as the one span did (`tweenEase` in `src/core/ease.ts`).
  Drawing on an in-between with "make a new key" (`src/tools/edit.ts`) cuts a tween the same way.
  The timeline shows no diamond for a cut key on a row where nothing was set (`passesThrough` in
  `src/timeline/tracks.ts`): the two halves are classic tweens with the same easing and slices that meet, and the
  row's value there equals the key before plus the key after blended by the uncut curve at that point, to 1e-6. A row
  whose value differs there keeps its diamond. This is display only; the document keeps the cut key.
- `Easing`: `linear, easeIn, easeOut, easeInOut, backIn, backOut, elasticOut, bounceOut` (the names Interactives uses),
  or a cubic bezier `[x1, y1, x2, y2]`.
- `MotionPath`: `{points: PathPoint[], orient}`. `ShapeHint`: `{id, from, to}`.
- `EditFrame` (in memory only): `{symbolId, instanceId?, layers, length, frame, activeLayerId, matrix}`. While
  `Doc.editing` is set, `layers` and `length` are the open symbol's and each frame keeps what it replaced.

### Look: blend, effects, folders (`ebd1163`)

- `BlendMode`: the canvas modes plus `'add'`.
- `LayerEffect`: `{id, kind: blur|glow|shadow|adjust|outline|pixelate|grain|wave|fringe|vignette|motionblur, on?, values, keys?}`. `values` holds numbers
  and hex colours; `keys: {frame, values}[]` animate the numbers (linear between keys, held outside).
- `LayerFolder`: `{id, name, visible, opacity, blend?, effects?, parent?}`. `parent` is the id of the folder it sits in
  (missing = on the stage), up to 8 levels deep. A layer's `folder` is the folder it sits in directly; every layer under
  a folder, in folders inside it too, sits next to the others in `layers`, so the flat list reads like the tree walked in
  order. Files from before folders could nest have no `parent` and open unchanged.

  The last five (film grain, wave, colour fringe, dark corners, motion blur) were added later: an older build opens a file
  that has them without those effects (unknown kinds are dropped on read), and a file from before them has none. Their
  settings are all optional on read and take their defaults (`src/effects/model.ts`, `EFFECTS`). Grain's moving pattern is
  worked out from the frame and the `seed` and `change` settings, never stored.

See `docs/effects.md`.

### Clips, markers, swatches, palette, tiles

- `Clip`: `{id, name, start, end, loop, direction?, repeat?}`, frames inclusive. `loop` repeats forever. When it is
  false the clip plays `repeat` times (a whole number from 1 to 999, missing = once) and holds the frame it ends on.
  `direction` is `'forward'` (missing), `'reverse'`, `'pingpong'` or `'pingpong-reverse'`. Forward and backward count
  whole passes. Back and forth counts **each direction as one**, like Aseprite: with 4 frames, repeat 1 is there only
  (1 2 3 4), 2 is there and back (1 2 3 4 3 2 1), 3 is there, back, there (1 2 3 4 3 2 1 2 3 4); the turn frames show
  once, and it holds the frame its last direction ends on. Forever goes round 0..n-1, n-2..1 without end.
  **Format 1** counted whole trips there and back (repeat N = 2N directions, and no repeat = one trip), so opening a
  version 1 file doubles the repeat of every back and forth clip (a clip with `loop: false` and no repeat gets 2); loops,
  forward and backward clips are untouched, and artboards' clips are migrated too (test/clips/clipPlay.test.ts). Old
  files have neither field on plain clips and play forward, exactly as before. The rules and the maths are in
  `src/core/clipPlay.ts` (`directedPosition` for playback, `bakedPositions` for exports, `stillPositions` for stills).
  Exports: GIF, APNG, video, animated SVG and sheet frame lists bake the order and the repeats; a PNG sequence, PDF and
  Illustrator pages hold each frame once, in the order the clip starts (`stillPositions`). Godot and Phaser can use their
  own ping-pong for back and forth clips (preference `export.clipEngineBounce`, default baked): Godot's SpriteFrames
  `"loop": 2` (LOOP_PINGPONG) and the AnimationPlayer's `loop_mode = 2` for a clip that loops, Phaser's `yoyo` for a loop
  or an even number of directions. In Godot those show each end twice (checked in 4.8), so the default bakes; Phaser 3.90's yoyo plays
  the same as the baked list (each end once, checked in the real engine).
  `Marker`: `{id, name, frame}`. `Swatch`: `{id, name, color}`.
- `DocPalette`: `{name, colors, ramps?}`; `ramps` lists where each ramp starts.
- `Tileset`: `{tileWidth, tileHeight, tiles, nextKey, gridX?, gridY?, dataLayers?, terrains?, terrainMode?, nextTerrain?}`. `Tile`: `{key, name, frames: {drawingId, duration}[], collision?, data?, terrain?}`. Keys
  are never reused, so maps keep pointing at the right tile.
  - `collision`: `{shapes, oneWay?}`; a shape is `{kind: 'box', x, y, w, h}` or `{kind: 'polygon', points}` in art pixels from the tile's top-left corner.
  - `dataLayers`: `{name, type: 'bool' | 'int' | 'float' | 'string'}[]`, the named values every tile can carry; a tile's `data` is `{[name]: value}`.
  - `terrains`: `{id, name, color}[]` (ids are never reused); `terrainMode`: `'corners-and-sides'` (the default, missing), `'corners'` or `'sides'`. A tile's `terrain` is `{id, bits?}`, where `bits` says which terrain touches each of `right`, `bottom-right`, `bottom`, `bottom-left`, `left`, `top-left`, `top`, `top-right`.
  - While a tile is open for editing, these three live in the tile document's `ext['tiles.props']` and are written back with Done.
  - The Godot export writes them as a physics layer, custom data layers and one terrain set (see `src/tiles/export.ts`).

### Clip flow (`f587827`)

`ClipFlow`: `{start?, transitions, positions?, inputs?, anyFirst?}`. `ClipTransition`: `{id, from, to, when: 'end' | 'trigger' | 'now',
trigger?, conditions?, blend?}`. Frameling's own playback ignores it (Try it in the Clip flow panel plays it); game engine exports and
Interactives read it as a state machine.

All of these are optional, so older files read unchanged (an older Frameling reads a `now` arrow as `end`, and ignores the rest):
- `inputs`: `{name, kind: 'toggle' | 'number', start?}[]`, named values the game sets. Names are unique, 40 characters at most, at most 32 of them.
  `start` is missing for off or 0.
- `conditions`: `{input, op: '>' | '>=' | '<' | '<=' | '==' | '!=', value: boolean | number}[]` on an arrow; all must hold. A toggle uses `==`
  or `!=` with a boolean. A check on an input that no longer exists is kept (it never holds, and the panel and exports say so).
- `when: 'now'`: the arrow goes the moment its conditions hold (with no conditions it never goes). `'end'` and `'trigger'` also need their conditions.
- `from: '*'` (`FLOW_ANY`): an "Any clip" arrow, from every clip except its own target. `positions['*']` places its box in the panel.
- `blend`: seconds of fade into the next clip, 0 to 5 (missing = a straight cut).
- `anyFirst: false`: a clip's own arrows are tried before the Any clip ones (missing = Any clip first). The first ready arrow wins.

The rules (`pickTransition`, `conditionHolds`) are pure functions in `src/core/flow.ts`; `readFlow` in `src/io/file.ts` validates the fields.

### Bones (`0b554d4`, stretch `d31ae80`)

- `Rig`: `{bones, poses?}`. Parents come before children.
- `Bone`: `{id, name, parent?, x, y, angle, length, pin?}` in rest position.
- `Pose`: `Record<boneId, BonePose>`; `BonePose` is `{r, x?, y?, s?}` (turn, joint move, stretch within
  `BONE_STRETCH`).
- `SavedPose`: `{id, name, pose}`.
- `LayerBind`: `{rig, bone, mesh?}`. With only `bone` the whole layer follows it; with a `SkinMesh` (`{points,
  triangles, bones, weights}`, flat arrays) it bends by weight.

### Sound (`0b554d4`)

`AudioClip`: `{id, name, start, volume?, muted?, data: Uint8Array, mime, duration?}`. `start` may be negative.

## The Interactives package (.flplay)

Written by `src/export/playable.ts` (`playablePackage`), a zip with media type `application/vnd.frameling.playable+zip`:

| Entry | What it is |
|---|---|
| `manifest.json` | `PlayableManifest`, below. |
| `atlas.png` | Every different picture once, trimmed and packed with 1 px padding and 1 px edge bleed. Stored, not compressed. |
| `source.frameling` | The editable document, unless it was left out. Players ignore it. |

`manifest.json` (`format: 'frameling-playable'`, `version: 1`):

- `app` (`'Frameling'`), `appVersion`, `name`.
- `width`, `height`: stage size in document pixels. `scale`: atlas pixels per document pixel.
- `fps`, `frameCount`: frames 0 to `frameCount - 1`. `documentFrames?`: see Clip `direction` below.
- `pixelArt`: draw with nearest-neighbour scaling. `background`: colour baked in, or `null` when see-through.
- `atlas`: `{image: 'atlas.png', width, height}`.
- `cells`: `{x, y, w, h, ox, oy}` per picture, in atlas pixels; `ox, oy` is where the trimmed picture sits in the
  whole frame (`width * scale` by `height * scale`).
- `frames`: the cell index for each frame. Held frames repeat a cell. Every clip starts and ends on cells of its own.
- `clips`: `{name, start, end, loop, runs}` counted from the package's first frame, clipped to the exported range.
  Names are made unique by adding `_`. `runs` is `{cell, frames, ms}[]`.
- `markers`: `{name, frame}`, sorted, within the range. Names may repeat.
- `layers`: `{name, kind, visible, opacity, pixelSize?}`, reference layers left out. Information only; frames are
  already flattened.
- `source`: `'source.frameling'` or `null`.
- Clip `direction` and `repeat` are not in the package: the Interactives player's clips are `{name, start, end,
  loop}` and play forward, looping or once. A clip that plays another way is baked: its frames in play order (once
  through for a loop, all the passes for N times, up to 5000 frames) are added to the end of `frames`, and the clip's
  `start`, `end` and `runs` point at them. Markers inside it are repeated where those frames are. `documentFrames` is
  then the number of frames the document itself has (the rest are baked passes), for a player that wants the whole
  animation without them. The flow's `frames` is the baked length and its `direction`/`repeat` are left out for such
  a clip. The `.frameling` source inside has the settings.
- `flow?`: when the document has a clip flow, `{start, states: {name, loop, frames, direction?, repeat?}[], inputs?: {name, kind, start}[], transitions: {from?, any?: true, to, on:
  'end' | 'trigger' | 'now', trigger?, conditions?, blend?}[]}` by clip name (`flowManifest` in `src/core/flow.ts`). `transitions` are in the
  order they are tried (the first ready one wins); an Any clip arrow has `any: true` and no `from`. Older readers ignore it.

Changes stay additive: a new field is optional, and anything that would break an older player bumps `version`.
The round trip (opening a `.flplay`'s source and saving back into it) is `src/interactives/`, described in
`docs/architecture.md`.

## Plugin packages

`src/plugins/manifest.ts`. A plugin is a folder or `.zip` holding `manifest.json` and one script. A zip made by
"compress folder" with one shared top folder is unwrapped. Only `.json` and `.js` entries are read; the package may be
at most 8 MB unzipped and the script 2 MB. Frameling keeps an installed plugin as a small zip of the manifest and the
script (`packPlugin`).

`manifest.json` (`parseManifest` checks it and fills gaps):

| Field | Rule |
|---|---|
| `id` | Required. Lower case letters, numbers and dashes, 3 to 60 long, not starting or ending with a dash. Stays the same across versions. |
| `name` | Required, up to 60 characters. |
| `version` | Default `0.0.0`. |
| `description`, `author` | Optional, cut to 300 and 80 characters. |
| `main` | The script inside the package, default `main.js`. Must end in `.js` and contain no `..`. |
| `permissions` | Any of `document.read`, `document.edit`, `export`, `panels`, `network`. An unknown one refuses the plugin. |
| `network` | Required with `network`: https origins only (no http, credentials or wildcards). |
| `apiVersion` | Default 1 (`PLUGIN_API_VERSION`). Higher than the app's refuses the plugin. |

An update that asks for nothing new installs without asking again (`samePermissions`). The API, the sandbox and the
threat model are in `docs/plugins.md`.
