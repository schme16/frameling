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

Tilemap drawings store `cells` as a plain number list in `doc.json`. Sounds on artboards that aren't open are packed
the same way (`src/artboards/io.ts` `packArtboards`). `saveFile(doc, appVersion)` always saves `rootDoc(doc)`
(`src/core/symbols.ts`), so a symbol open for editing is put back first and `Doc.editing` is never written.

PNGs are cached per pixel array in a `WeakMap` (`pngCache` in `file.ts`). Edits replace pixel arrays rather than
changing them, so an unchanged drawing is never encoded twice, which matters for autosave.

## Version and compatibility rules

- `FORMAT_VERSION` is 1. Every field added since the first commit is optional, so the version has never been bumped
  and every older file opens unchanged.
- A new field must be optional, and missing must mean "the old behaviour". Write it only when it isn't the default
  (the readers drop `onion: true`, `blend: 'normal'`, `s: 1` and so on), so files stay small and diffable.
- If a change can't be made optional, bump `FORMAT_VERSION` and add a step to `MIGRATIONS` in `file.ts`:
  `MIGRATIONS[n]` turns a version n document into version n + 1, and `migrate()` runs them in order. A missing step
  means "this file is too old" (`FileProblem`). The list is empty today.
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
- Entries over 1 GB unzipped are skipped, and only `manifest.json`, `doc.json`, `pixels/` and `audio/` are unzipped.

Repaired, with a warning:

- A drawing that isn't an object or has an unknown kind is left out. Instances, text and particles that fail their
  reader, and anything in a shape list that is not an object with a `type`, are left out. Shapes of an unknown `type`
  are not repaired away: they are kept (see "Data the reader does not know" below).
- A cel pointing at a missing drawing, or at a drawing of the wrong kind for its layer, is dropped (the frames go
  empty). Cels are sorted by `start`; `start` is clamped to 0 or more and `length` to 1 or more.
- A symbol that can't be read is dropped (its instances then draw nothing).
- Tiles with a bad or duplicate key, or no frame whose drawing is a pixel drawing of exactly the tile size, are
  dropped. A tileset with a tile size outside 1 to 1024 is dropped. `nextKey` is raised past the highest key.
- A sound whose bytes are missing, or with a duplicate id, is dropped.
- An artboard that can't be read is dropped. If no artboard is the open one, the document's own content gets a new
  artboard (`artboard-open`) at 0, 0, so nothing is lost.

Repaired quietly (defaults filled, values clamped):

- Layer `name`, `visible`, `locked` default; `opacity` is clamped to 0..1; `depth` to -0.9..100; `pixelSize` rounded,
  at least 1; unknown `label` dropped.
- Effects: unknown kinds dropped, values filled from the effect's defaults (`src/effects/io.ts`), keys deduplicated by
  frame and sorted. Layers naming a missing folder leave it; folders no layer uses are dropped.
- Bones: a bone whose parent doesn't come before it becomes a root; duplicate ids are skipped; `length` at least 1;
  `s` clamped to `BONE_STRETCH` (0.25 to 3). A skin mesh with bad indices or weight counts is dropped (the layer
  keeps its plain bone bind).
- Tweens: unknown easing becomes `'linear'`, `spin` is rounded, a motion path needs two good points, shape hints
  are kept only on shape tweens, at most 26.
- Clip flow: transitions between clips that don't exist are dropped; triggers are cut to 60 characters.
- Clips: `direction` is kept only when it is one of the four known words (and not `'forward'`); `repeat` only when it
  rounds to a whole number from 2 to 999 (`readClip` in `src/core/clipPlay.ts`, also used for artboards).
- Gradients that don't parse are removed from the shape (`cleanGradients` in `src/core/gradient.ts`).
- Text and particles are read field by field with clamps and defaults (`src/io/shapes-extra.ts`); particle defaults
  come from the shape's `preset`.
- Palette colours must be hex, at most 256; ramps must point inside the palette. `dpi` outside 1..10000 is dropped.
  `inOut` is clamped to the length and put in order; `perspective` keeps at most two points.

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
| `guides?` | `Guide[]` | Ruler guides, never exported (`b5f0737`). |
| `inOut?` | `{start, end}` | Play range, inclusive (`9edd74d`). |
| `perspective?` | `{points: {x, y}[]}` | One or two vanishing points, never exported (`4dfae46`). |
| `artboards?` | `Artboard[]` | (`d7cd660`) |
| `activeArtboard?` | Id | Missing = the first (`d7cd660`). |

### Artboards

`Artboard` is `{id, name, x, y, exportName?, content?}`. `x`, `y` is its top left on the pasteboard. The open
artboard's content is the document's own fields; the others hold theirs in `content`, an `ArtboardContent`:
`{width, height, background, length, layers, clips, markers, flow?, audio?, guides?, inOut?, perspective?}`.
Palette, swatches, symbols, tiles, drawings and fps are shared by all artboards. Missing `artboards` = one artboard.
See `docs/artboards.md`.

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
  (`6f256d0`).
- `TilemapLayer` (`kind: 'tilemap'`, `cd7bd81`): `pixelSize`.
- `CameraLayer` (`kind: 'camera'`, `f587827`): draws nothing; the first visible camera layer frames playback and
  every export.

### Cels

`Cel` is `{id, start, length, drawingId, tween?, autoHold?}`. `length` is the exposure (1 = on ones). `tween` makes
in-betweens to the next key on the layer when it starts right where this one ends (`828d4a8`). `autoHold` (`cd5f717`)
means the hold reaches the next key and gives way when someone draws on a later frame of it.

### Drawings

`Drawing` is one of:

- `VectorDrawing`: `{id, kind: 'vector', shapes, pose?}`. Shapes paint in order, index 0 at the back. `pose` is the
  bone pose at this key on a bones layer (`0b554d4`).
- `PixelDrawing`: `{id, kind: 'pixel', width, height, pixels: Uint8ClampedArray}`. RGBA the size of the layer's art
  grid (`ceil(doc.width / pixelSize)` by `ceil(doc.height / pixelSize)`), or of the tile for tile frames. A PNG in the
  file. Edits replace the array, never mutate it.
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
  BrushSettings` (`size, thinning, smoothing, streamline, taperStart, taperEnd, capStart, capEnd`), `color`,
  `opacity`. Kept as input points so it re-renders losslessly.
- `FillShape` (`type: 'fill'`): `paths: SubPath[]` (even-odd), `color`, `opacity`, `gradient?` (`e352d32`; `color`
  stays as its first stop).
- `PathShape` (`type: 'path'`): `paths`, `fill: Color | null`, `stroke: {color, width, join, cap} | null`, `opacity`,
  `fillGradient?`, `strokeGradient?` (`e352d32`).
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
- `LayerEffect`: `{id, kind: blur|glow|shadow|adjust|outline|pixelate, on?, values, keys?}`. `values` holds numbers
  and hex colours; `keys: {frame, values}[]` animate the numbers (linear between keys, held outside).
- `LayerFolder`: `{id, name, visible, opacity, blend?, effects?}`.

See `docs/effects.md`.

### Clips, markers, swatches, palette, tiles

- `Clip`: `{id, name, start, end, loop, direction?, repeat?}`, frames inclusive. `loop` repeats forever. When it is
  false the clip plays `repeat` times (a whole number from 1 to 999, missing = once) and holds the frame it ends on.
  `direction` is `'forward'` (missing), `'reverse'`, `'pingpong'` or `'pingpong-reverse'`. One pass of back and forth
  is 0..n-1 and back down to 0 with each end shown once per turn (a pass shows 2n-2 frames), so a clip that plays
  it once ends where it started. Old files have neither field and play forward, exactly as before. The rules and the
  maths are in `src/core/clipPlay.ts` (`directedPosition` for playback, `bakedPositions` for exports).
  `Marker`: `{id, name, frame}`. `Swatch`: `{id, name, color}`.
- `DocPalette`: `{name, colors, ramps?}`; `ramps` lists where each ramp starts.
- `Tileset`: `{tileWidth, tileHeight, tiles, nextKey}`. `Tile`: `{key, name, frames: {drawingId, duration}[]}`. Keys
  are never reused, so maps keep pointing at the right tile.

### Clip flow (`f587827`)

`ClipFlow`: `{start?, transitions, positions?}`. `ClipTransition`: `{id, from, to, when: 'end' | 'trigger',
trigger?}`. Frameling's own playback ignores it; game engine exports and Interactives read it as a state machine.

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
- `fps`, `frameCount`: frames 0 to `frameCount - 1`.
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
  loop}` and play forward, looping or once, so nothing it ignores is written. The `.frameling` source inside has them.
- `flow?`: when the document has a clip flow, `{start, states: {name, loop, frames, direction?, repeat?}[], transitions: {from, to, on:
  'end' | 'trigger', trigger?}[]}` by clip name (`flowManifest` in `src/core/flow.ts`). Older readers ignore it.

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
