# Brush import

Brush files from other programs become pixel brushes (`DabBrush`, see [pixel-brush.md](pixel-brush.md)) in the person's own
brush library. The command is **Add brushes from a file...** (`brush.addFile`, under **Tools > Saved brushes** and in the
palette); it takes Frameling's own `.json` brush files too. Code: `src/brushes/import/`, the library side
`addImportedBrushes` in `src/brushes/presets.ts`.

## What is read

| Format | App | State | Read from |
|---|---|---|---|
| `.gbr` | GIMP | Done. Version 1 and 2, grey and colour (1 to 4 bytes a pixel). Version 3 (CinePaint 16-bit float) is refused with a reason. | GIMP's `devel-docs/gbr.txt` |
| `.gih` | GIMP | Done, with a loss: the first picture of the pipe is the brush, and the note says how many more there were and how GIMP picks between them. | `devel-docs/gih.txt` |
| `.vbr` | GIMP | Done. Circle, square and diamond, versions 1.0 and 1.5. | `devel-docs/vbr.txt` |
| `.abr` v6, 7, 9, 10 | Photoshop | Done. Sampled, computed and (as a round tip) bristle and airbrush tips, with the shape, scatter, texture, dual brush and transfer settings. Checked against real files exported from Photoshop 2026. | Adobe's descriptor notes, AbrKit's `docs/ABR.md` (MIT), real files |
| `.abr` v1, v2 | Photoshop | Done to the layout, **checked only against files built to that layout**: no real old file turned up. | Adobe's Photoshop 6 notes (as AbrKit writes them up) |
| `.kpp` | Krita | Done for the pixel brush engine. A PNG with the settings in a `preset` text chunk. The tip picture is **not** in the file (Krita names it), so a lone `.kpp` brings in only the generated (round or square) tips and says so for a picture tip. | The options Krita documents, and real presets from Krita's own CC0 default bundles |
| `.bundle` | Krita | Done. A zip of presets and the tip pictures they name (`.png`, `.gbr`, `.gih`). An SVG tip, and every brush engine that is not the pixel brush (and the smudge one, which comes as its tip with a note), are left out and counted in the file's note. | Real bundles shipped with Krita |
| `.brush`, `.brushset` | Procreate | Done. A zip of one or more brushes: an Apple keyed archive of settings (`Brush.archive`), the tip (`Shape.png`) and grain (`Grain.png`) pictures. **Size, spacing, scatter, turning along the line, the tip's way round and the press on opacity were checked against Procreate's own picture of the stroke (size is measured off it); the newer spacing, the other pen controls, grain and wet mix were not, and are guesses.** Scatter was checked twice: the first reading made inking pens arrive as wide clouds, and it now goes with the spacing (see the table). See [Procreate](#procreate-brush-brushset). | topsd's format notes (CC BY 4.0), three real free files, Procreate's handbook for the names |
| `.sut` | Clip Studio | **Not done, on purpose.** A SQLite database with the settings in it, found by others. Units and the pen-control blobs are not settled and no free real file turned up. | |
| `.afbrushes` | Affinity | **Not done, on purpose.** Nothing public found at all, and no real file. | |

No GPL code was read or copied (Frameling is MIT). GIMP's own loader is GPL, so the GIMP formats come from the format
descriptions GIMP publishes, and from the brushes that ship with GIMP (CC0, per `gimp-data/LICENSE`). Fixtures and their
origin: `test/fixtures/brushes/` (`abr/NOTICE.txt`, `krita/NOTICE.txt`). Krita's code is GPL and was not read either: its formats come from
the files Krita writes (its default bundles are CC0).

## The rules every reader follows

- **Untrusted input.** A brush file comes from the internet. Every read goes through `Reader` (`bytes.ts`), which never goes
  past the end; sizes are checked against what is really in the file before anything is allocated; depth, item counts, side
  lengths, pixel counts and brushes per file are capped (`MAX_FILE_BYTES` 64 MB, 1000 brushes, 8192 pixels a side for a
  Photoshop or Krita tip, 24 million pixels a tip, 24 levels of descriptor, 100000 descriptor items). Nothing is executed. A damaged
  file ends in a plain message (`BrushProblem`), never a crash: `readBrushFile` does not throw.
- **Unpacking has a ceiling** (`inflate.ts`, `zip.ts`). A deflate stream can say a billion zeros in a few kilobytes, so the
  compressed bytes go in 1 KB at a time and the output is counted after each slice: the work stops when the ceiling is
  passed, not after the memory is spent. Ceilings: 16 MB for a preset's settings, 32 MB for one zip entry, 256 MB for all the
  entries of one file, 4096 entries a zip, 16 MB of XML. A tip PNG may not unpack to more than its header says it should
  (checked before it is decoded), is refused over 8192 pixels a side, 24 million pixels or when interlaced. Zip64 and
  password-locked zips are refused. Names in a zip are only compared, never turned into paths.
- **XML (`xml.ts`)** is read by a small reader of our own: no DOCTYPE is followed, no entity is ever defined by the file, no
  outside lookups, 32 levels of nesting, 100000 elements.
- **Everything goes through `cleanDab`.** Readers build a plain object and `cleanDab` holds every range and drops what it
  does not know, the same as a brush from any other file.
- **Say what was lost.** Each `ImportedBrush` carries `dropped` (a setting the file had and Frameling has no place for) and
  `changed` (it came as the nearest thing). The dialog shows both under the brush, and a brush with neither says **Came in
  whole**. A file-level `notes` line says how many brushes of a set could not be read.
- **Show it before it lands.** The dialog (`Dialog.tsx`) lists every brush with its tip and a sample stroke from the real
  engine, a tick each, **Only the whole ones**, and the group name. Nothing is added until **Add**.
- **A bitmap tip is a picture tip, made the way one from a selection is** (`tip.ts`): area-averaged down to the 32 by 32 a
  picture tip holds, the empty margin trimmed (so `size` means the part you can see), and the colours cut to the 256 a saved
  brush keeps. A grey tip (all of Photoshop's sampled tips, GIMP's masks) becomes a **soft** tip (`PixelStamp.soft`): each
  cell's see-through is how much paint it lays down, in the colour picked, so the shading stays. A colour tip (a GIMP pixmap)
  keeps its own colours (`keep`).
- **Landing.** `addImportedBrushes` adds them as pixel presets in a group named for the set, keeping names (a taken name gets
  a number), and they are saved with the rest, so they survive a reopen (`test/brushes/importLibrary.test.ts`).

## Mapping

GIMP: tip is the picture; `spacing` percent is `spacing`; `aliased` is off. `.vbr`: circle is a round tip, square and diamond
are square (a diamond is a square at 45 degrees; a flattened one can only be a flat rectangle, and says so); `radius` is half
the `size`; `aspect ratio` is `1 / roundness`; the star's points and spikes are dropped with a note.

Photoshop (descriptor keys as in the files): `Brsh` is the tip (`computedBrush` round with `Hrdn` hardness, `sampledBrush`
picture, `dBrush` and `dTips` round with a note); `Dmtr`, `Angl`, `Rndn`, `Spcn` (when `Intr`) are size, angle, roundness,
spacing. `Angl` turns counter-clockwise on screen and Frameling's angle clockwise, so it comes in negated (as GIMP's does). A sampled tip's `Dmtr` is across the whole picture, so `size = Dmtr x visible share`.

- A Control menu number (`bVTy`): 1 fade, 2 pen pressure, 3 pen tilt, 4 stylus wheel (dropped: no such input), 5 and 6
  direction (`follow` for the angle; 5 is "initial direction" and comes as the same, with a note), 7 and 8 pen rotation
  (`twist`). One control is one route; `amount = 1 - minimum` (size's minimum is the preset's `minimumDiameter`, the others
  are the `Mnm` of the group). A fade's `fStp` steps become `fadeLength = steps x spacing x size` pixels.
- Jitters: size `szVr` is `sizeJitter`; angle `angleDynamics` is `angleJitter`; scatter `scatterDynamics` jitter is `scatter`
  (held to 200%); opacity `opVr` and flow `prVr` are both flow (a `random` route for the jitter), with a note for opacity;
  mix `mxVr` is `mix`. Pressure on both opacity and flow is one route, not two.
- `useTexture` is `grain` (no paper of its own, so it follows the sheet; `textureDepth`, scale, and `TxtC` "each tip" as `moving`), with a note that the
  pattern picture is not kept. `dualBrush` with a sampled (textured) second tip is `dual`: round dots no bigger than a quarter
  of the brush, density 60% (more with a count), `cut` for subtract; the second tip's own picture, spacing, scatter and blend mode
  are dropped with a note. A plain round second tip is left out altogether (a field of dots would look nothing like it), with a note.
- `toolOptions` (only when `brushPreset`): `flow` and `Opct` are flow and opacity.
- Dropped with a note when on: roundness jitter and control, flip jitter, count and count jitter, scatter and wetness
  controls, colour dynamics, wet edges, noise, build-up, brush pose, brush group, smoothing.
- A group (`useTipDynamics`, `useScatter`, `usePaintDynamics`) that is switched off is ignored, as Photoshop ignores it.

Krita (parameter names as in real presets; `.kpp` and `.bundle` share one reader, `krita.ts`): the tip is the preset's
`brush_definition`. An `auto_brush` is a round (`circle`) or square (`rect`) tip: `diameter` is `size`, `ratio` is `roundness`,
`angle` (radians) is `angle` in degrees, `hfade` and `vfade` averaged are `hardness` (1 is hard), `antialiasEdges="0"` on a
hard edge is `aliased`. The `soft` and `gauss` mask kinds come as a fixed softness (25% and 20% hardness) with a note, as their
falloff curve is not kept. A `png_brush` or `gbr_brush` is a picture tip from the bundle: `size` is the picture's visible size
times `scale`. A grey picture is a **mask** (dark is paint, as Krita treats it), a colour picture with see-through keeps its own
colours (unless `ColorAsMask`), and a light shape on see-through uses the see-through as the shape, with a note. A `.gih` pipe
takes its first picture, with the pipe's count in a note (a pipe that says more pictures than it holds, as Krita's fairy dust
one does, is read and the note says so). `spacing` is `spacing` (automatic spacing keeps the saved value, with a note).
`FlowValue` and `OpacityValue` are `flow` and `opacity`.

- Dynamics: each option (Size, Opacity, Flow, Rotation, and the rest) is on when its `Pressure<Name>` flag is true; Opacity and
  Flow also when their `<Name>UseCurve` is true (the flags real presets use for those two). The sensor is the `<Name>Sensor`
  text: `pressure`, `xtilt`/`ytilt`/`declination` (tilt), `speed`, `drawingangle` (direction; for Rotation it is `follow`),
  `rotation` (twist), `fuzzy`/`fuzzystroke` (random), `fade` (its `length` in dabs, as `fadeLength` pixels); a list of sensors is
  one route each. A sensor's curve is kept as the route's `curve` (`routeOf` in `krita.ts`): the lowest and highest the line
  reaches give `amount = 1 - low / high`, `invert` is on when it ends lower than it starts, and the bend between is the points
  held to 0 to 1 across that range, so a jump early in Krita jumps early here. Points out of range or out of order are mended,
  a curve that starts after 0 or stops before 1 holds its end heights out to the edges, and a straight curve leaves the route
  without one. More than 8 points are thinned to the nearest 8, with a note. The route is scaled to the curve's own high point, so a
  curve that tops out below full (at half, say) scales the brush's own size, flow or opacity by that height instead
  (`height` from `routeOf`), with a note: a half-height size curve gives half the saved size, which is what multiplying
  the setting by the curve does. Several sensors on one option each scale it, as Krita multiplies sensors. Opacity dynamics
  come as flow dynamics, with a note.
- Scatter keeps its `ScatterValue` and drops (with a note) a pen control on it. `Texture/Pattern` is `grain` (no paper of its own, so it follows the sheet;
  `Strength`, `Scale`, random offset as `moving`), with a note that the pattern picture is not kept.
- Dropped with a note when on: Softness, Sharpness, Roundness, Spacing, Flip, Darken, Colour mixing, Airbrush rate, Hue,
  Saturation and Value dynamics, the sensors `ascension`, `distance`, `time`, `perspective` and barrel pressure, a masking brush,
  eraser mode, a blend mode other than normal, airbrush mode, density and randomness of a generated tip, spikes, a tip's
  brightness and contrast adjustment, a smudge brush's smudging.
- Left out altogether, and counted in the file's note: presets from any other engine (sketch, spray, bristle, grid, shape,
  clone, deform, curve, hatching, filter, particle, round marker), a preset with an SVG tip, and a preset whose tip picture is
  not in the bundle.

Procreate (`procreate.ts`, with `bplist.ts` for the property lists; the whole story, with what was checked, is [below](#procreate-brush-brushset)): `Shape.png` is the picture tip (white paints; `shapeInverted` flips it; a tip that is white all over is a square), `size` is measured off `QuickLook/Thumbnail.png` (Procreate's own picture of the stroke), falling back to `paintSize x 100 x visible share`,
`spacing = plotSpacing / visible share`, `scatter = (shapeScatter + plotJitter) x plotSpacing / visible share`, `shapeRotation` 0.5 or more is `follow`, and `shapeRandomise`, or any `shapeScatter` on a tip that does not follow the line, is a full `angleJitter`.
The `dynamics<Source><Target>` keys (pressure, tilt, speed, roll against size, opacity, hue, saturation, brightness) are routes, with their curves; jitter keys are
`sizeJitter` and `random` routes; `Grain.png` is `grain.picture`; `dynamicsMix` is `wet`. A built in shape that is not in the file comes as a round tip, with a note; a built in grain gets the nearest paper Frameling draws itself when its name says what tooth it has, and none when it does not. A dual brush's second brush, taper, count, glaze, bleed, metallic, wet and burnt edges,
a blend mode and the smoothing keys are dropped with a note when the brush uses them.

## Known doubtful

- **Krita's `hfade`/`vfade` and the sensor enable flags** were read from Krita's own presets (the default round brush is
  `hfade` 1; the "Opacity" and "Flow" brushes switch those on with `UseCurve`), not from Krita's documentation of the file, and
  not checked by painting the same stroke in Krita. The direction of a turned tip is taken as clockwise, unchecked. `ScatterValue`
  is taken as a share of the brush size. A fade's `length` is taken as dabs.
- **Krita curves are kept, but not checked against Krita.** `Basic-5 Size`'s flow curve (it jumps to nearly full by a 7%
  press) comes with that jump, and its size curve with its late rise, as the route curves the engine draws. Frameling joins the
  points with its own smooth line, which may differ a little from Krita's between two points. A curve that tops out below 1 scales the
  brush by its height (see above), which matches Krita's flow and opacity multiplying with their curves and the Size option
  being "the curve for how it is affected"; no preset we hold has such a curve, so this is tested on made-up presets only.
- **`SizeValue` (the strength beside the size curve) is not applied.** Every real preset we hold has it at 1, so nothing shows
  how Krita combines it with the curve. A preset that sets it to anything else comes at its saved size, with a note. A real
  preset with `SizeValue` below 1 and a known stroke in Krita would settle it.

- **Photoshop and GIMP files carry no curves.** A real Photoshop 2026 `.abr` keeps, for each control, only the control menu, the
  jitter, the minimum and the step count (see `photoshop_dynamics.abr`), and GIMP's `.vbr` has no pen controls at all, so there is
  nothing for those readers to keep or flatten. If a Photoshop file with a curve turns up, its key is not read yet.

- **The direction of an angle.** Photoshop's `Angl` is **counter-clockwise on screen, checked in Photoshop 2026** (27.7, on
  Windows, 2026-11-17): a round tip at 120 px, roundness 15%, angle 30 stamped once leans up to the right, its long axis at
  -30.1 degrees in screen (y down) coordinates. AbrKit's note said clockwise and the importer followed it until then, so
  every angled or flattened Photoshop tip came in mirrored. The importer now negates `Angl`, and the version 1 and 2 angle
  with it (assumed to be the same convention; no old file was checked). GIMP's `.vbr` angle is taken as counter-clockwise
  too, still unchecked against GIMP. It only shows on a flattened or square tip, or a picture tip.
- **The control numbers** 5 to 8 come from AbrKit's list and one real file; 1 to 3 are confirmed by real files.
- **Dual brush and texture** are the engine's nearest things (a field of dots, five papers), not a copy. A Photoshop brush
  built on them looks like itself in spirit only, and says so.
- **Colour dynamics** are dropped. The key names are now known, read from Photoshop 2026's brush tool settings with colour
  dynamics switched on (the same descriptor a preset saves, but not yet seen inside a saved `.abr`): `useColorDynamics`
  (on or off), `clVr` (foreground/background jitter: an object with `bVTy` control, `fStp`, `jitter` and `Mnm ` minimum, as
  the other dynamics), `H   ` hue jitter, `Strt` saturation jitter, `Brgh` brightness jitter, `purity` (-100 to 100, a fixed
  shift, not a jitter) and `colorDynamicsPerTip` (each dab, or once a stroke). All are percent units. They could map to the
  `hue`, `saturation`, `lightness` and `mix` routes; Frameling has nothing for once-a-stroke or for purity.
- Version 1 and 2 `.abr` have no real fixture.
- **Procreate: the newer spacing is not settled by anything we hold** (size is now measured off the file's own stroke picture), and the pen controls, the grain, the wet mix and the blend numbers are read by their key names only. The full list, with what was checked, is in [Procreate](#procreate-brush-brushset).

## Procreate (`.brush`, `.brushset`)

Built in `procreate.ts` (the mapping) and `bplist.ts` (binary and XML property lists, and Apple's keyed archives). Procreate does not publish the format. It was read from three real free files, from topsd's notes (CC BY 4.0), from CSP2PC (MIT) and from Procreate's own handbook for what each setting is called, and it was checked by drawing each file's stroke again and laying it beside Procreate's own picture of it. No copyleft code was read. The sources are in the evidence table further down.

How sure each line is: **Seen** (opened in a real file, or checked against the thumbnail), **Two sources**, **One source**, **Guess** (from a key's name, or from what a converter's author did).

### The container

A zip. A `.brush` has the brush at the top; a `.brushset` has a list, `brushset.plist` (the set's name and the brush order), and one folder per brush, named by a UUID and laid out like a `.brush`. The single `.brush` layout is **Seen** in all three files. The `.brushset` layout has **not been seen by us** (topsd saw it in a real set), so the set reader is written to the notes and to the single-brush layout: it takes the set's name and order from any list in `brushset.plist` (binary or XML) that names the brush folders, and when there is no list, or it cannot be read, it takes every folder that holds a `Brush.archive`, in name order, and says so in the file's note. A brush inside a dual brush (`Sub01/`) or a reset copy (`Reset/`) is not a brush of its own. Built to this layout in `test/brushes/importProcreate.test.ts`, and **not checked against a real set**.

| Part | What it is | How sure |
|---|---|---|
| `Brush.archive` | The settings. An Apple binary plist (`bplist00`) in `NSKeyedArchiver` form: a `$objects` list, a `$top` root, values that point at each other by `UID`, `UID(0)` meaning nothing, arrays as `NS.objects`, the date as `NS.time`. Root class `SilicaBrush`. About 220 keys in the 2020s file (219 counted), 44 in the 2015 ones, 260 across every era in the round trip PR, so every key is optional and has a default | Seen, and two sources |
| `Shape.png`, `Grain.png` | The tip and the grain. 8 bit grey, **white paints** (1024 pixels square in 2015 files, 2048 in the 2020s one) | White paints: **Seen** (Plain Stitch's white stitch is the white stitch in its thumbnail; Seed's all white tip is the ribbon in its thumbnail). The grain's way round is **a guess** |
| `shapeInverted`, `textureInverted` | Flip those. Sequins has `shapeInverted` true and a dark sequin on white | The shape flag is **Seen** (the thumbnail shows the round sequin, not the square). The grain flag is **a guess** |
| `bundledShapePath`, `bundledGrainPath` | A built in tip or grain, **named but not in the file**. `Brush-Preset-Blank.png` is the blank grain in all three files: it catches nothing, so a brush with it has no grain whatever its `grainDepth` | Seen |
| `QuickLook/Thumbnail.png` | The stroke Procreate drew for its own library: white on see-through, 440 by 276 in the old files, 1060 by 324 in the new one | Seen |
| `Sub01/` (with its own `Brush.archive`, `Shape.png`, `Grain.png`) | The second brush of a dual brush | One source (topsd); not in the files seen. A brush that has it says its dual brush was left out |
| `Reset/`, `Signature/` | A copy to reset to, the author's signature picture | One source; the signature folder was seen in the new file. Not read |

### What the thumbnail settled

Every file carries Procreate's own picture of a stroke. Seen with the engine's own stroke code (`sh scripts/docs/ab-procreate/make.sh`, pictures in `brand/ab/procreate-import/`), drawn along the same path (read off the thumbnail) at the size the thumbnail shows, the first guess from the research notes and what the importer does now:

| Key | First guess | Now | What settled it |
|---|---|---|---|
| `plotSpacing` | `spacing` = the number | `spacing` = the number / the share of the tip picture you can see | **Plain Stitch.** Its stitches sit 35.2 px apart in the thumbnail (five in a row), the whole tip picture is 62.5 px across, and the stitch is 0.544 of it. 35.2 / 62.5 is 0.563, and the file says 0.551. So Procreate counts spacing in the whole picture, and ours counts in the visible part (`size`), so ours is 0.551 / 0.544, about 1.01. The first guess, 0.551 of a stitch, ran the stitches together into a line (see the picture). Sequins (1.006, one sequin apart in the thumbnail) agrees. |
| `shapeScatter`, `plotJitter` | `scatter` = the number | **Two different things.** `plotJitter` ^ 1.5 x 0.19 / the visible share is `scatter` (how far a dab is thrown off the line; the throw grows faster than the slider, see "Graphite ink's width" below). `shapeScatter` is `angleJitter` (how far the tip is turned at random), up to the whole way round at 1. Only in a file from before Procreate 5 (no `shapeCount` key) does `shapeScatter` also throw, x `plotSpacing` | **Graphite ink, Dry Ink v2 and Sequins together.** Dry Ink v2 has `shapeScatter` 1 and `plotJitter` 0 and its picture is a clean thin line: scatter throws nothing. Graphite ink has `plotJitter` 0.54 and its picture is a loose cloud of specks about half as wide again as its tip: jitter throws, by a share of the width, whatever the spacing (its spacing is 0.015). Sequins is a 2015 file with scatter 0.877, no jitter, and sequins above and below the line, each at its own angle: the old scatter did both. The readings before this one tied scatter to the spacing to fit Sequins and Dry Ink v2, which left every jittered brush as a tight band. |
| `shapeRotation` | `angle` | 1 is `follow` (the tip turns along the line), 0 is not | **Plain Stitch** (1.0): the stitches turn along both of its strokes. Ours is on or off, so 0.5 and up follows, and a value between says so in the brush's notes. So this key is not a fixed angle. |
| `shapeInverted` | a flag | flips which part paints | **Sequins**: the thumbnail shows round sequins, so the dark part of the square picture paints. |
| `dynamicsPressureOpacity` 1.0 | a route, pressure to flow | a route, pressure to `opacity` (the most a dab may leave on a pixel), amount 1 | **Seed and Background.** Seed's ribbon fades in over about 280 px and out over a similar length. As flow, the fade was far shorter than Procreate's, because Seed lays about twenty dabs on every pixel and they build straight back up. As opacity the fade is the pressure, however close the dabs. Shenbot's Background (pressure on opacity 1, dabs 2% apart) is a light wash in Procreate's picture and was a solid band as flow. Under a gritty stand in paper it stays flow: see the papers below. |
| `paintSize` | `size` | **The size is measured off `QuickLook/Thumbnail.png`**, Procreate's own picture of a stroke with this brush: down each column, the longest unbroken run of paint is one dab across the line, and the ninth of ten of those runs is the brush's width (divided by how much of its own size a dab lays across the line: a picture tip's shorter side, times `roundness`). `paintSize` x 100 x the visible share is only the fallback, for a file with no picture. | **Measured, after `paintSize` was shown to be no use.** `paintSize` genuinely cannot say: the same brush in Shenbot's set and as a loose file carries 0.114 and 0.229 and draws an identical picture, and 6B Pencil - Sketch (0.114) and Dry Ink v2 (0.81) are 17 and 16 pixels thick in theirs. The picture can: a column's longest run is one dab, so a gap between scattered dabs does not widen it, and the three brushes whose dabs were measured by hand when the scatter was settled come out at 57 (hand: 57), 219 (190) and 27 (34). It is Procreate's own picture of the brush, which is what an artist picked the brush by, so the brush arrives looking like its picture. The brush says the size was measured, and a picture the stroke fills top to bottom, or one under 8 pixels, is refused rather than trusted. |

Sequins' thumbnail is **exactly half** as bright as its tip picture (five percentiles of the stroke's see-through against the picture's all land on 0.50, 0.51). That was a puzzle until the tips were read as light (below): a tip's greys go through the screen gamma before they are paint, which darkens the mid greys by about that much.

### The tip, and what else the pictures settled the second time

The first readings were tuned one number at a time against the thumbnails and kept going wrong on the next brush. The second went the other way: a small renderer outside the app (numpy, the file's own pictures at full size) tried each reading of a key against Procreate's picture until the stroke came out the same, and only then was the importer changed. What that found:

- **A tip is light, not a number.** `Shape.png` is 8 bit grey with the usual screen gamma, and Procreate paints with it as light: paint = (v / 255) ^ 2.2. Graphite ink and Velvet int are 20 in 255 all over where they look black. As the plain number that is 8% of paint on every dab, and at a hundred dabs a pixel it was a solid band. As light it is under half a percent and is trimmed off with the margin.
- **A tip keeps up to 256 pixels across** (`MAX_SOFT_STAMP`; a tip you draw by hand stays at 32). At 32 the scratches of Graphite ink and the bristles of Velvet int were a smudge; at 128 Graphite ink's specks were still a little soft. A saved soft tip is packed: its cells as bytes, squeezed (deflate), in base 64, as `cells: "z1:..."` (`SoftCells` in `src/brushes/stamps.ts`), so Graphite ink's tip is 3.6 KB in a saved brush where the list of numbers was 26 KB at 128 (and would have been 100 KB at 256). The old list of numbers is still read, and read tips are held packed, so an old brush saves packed the next time. Only a soft tip is packed (and only while every cell fits a byte).
- **A small dab takes a smaller copy of the tip.** A tip drawn at a quarter of its size was sampled from four cells, skipping most of the picture, so a stroke of small dabs shimmered. `pictureOf` now also keeps the tip halved once and twice (each cell the average of four), and a smooth dab drawn under half a pixel a cell takes the halved one, under a quarter the twice halved one (`levelFor` in `src/dab/maths.ts`). Only a tip bigger than 32 (so one from a file) has them; a tip drawn by hand and pixel art sample as they were, and a crisp dab always does.
- **`paintOpacity` is where the slider was left**, like `paintSize`. The Sketch pencil is saved at 53% and its picture is black. So a brush comes at full strength and says where the slider was.
- **Speed runs the other way from pressure**: a positive `dynamicsSpeed...` fades or thins the line as the hand goes faster. Read the same way round as pressure, a slow hand drew a fainter 6B Pencil.

Still not read: **the dual brush** (Graphite ink has one, a plain disc; its cloud came out right without it).

### Papers: where Frameling's fell short, and what was done

Asked straight: is the paper system the limit? Partly. Looked at brush by brush against Procreate's pictures:

- **A grain picture was boiled down to 64 pixels.** That is right for a picture you pick (a saved brush stays small), and wrong for a 2048 pixel photograph of paper: Barely There came out as a few grey lumps where Procreate draws a wisp of specks. A grain read from a file now keeps the whole tile, 256 across (`MAX_FILE_TEXTURE_SIDE`; about 87 KB in a saved brush).
- **A grain picture stays put**, whatever `textureMovement` says. Barely There is nearly stamped (0.16) and only a paper that stays put and holds the stroke back gives its sparse wisp; one that moved filled it in solid. (A stand in paper still follows the movement: that is what keeps the Inking Pen smooth.)
- **Frameling's papers are tidy patterns**: a ruled grid, an even speckle, made for chalk on pixel art, with their bumps spread evenly from pit to peak. A photographed paper has fibres lying one way, bumps at several sizes at once, and is mostly mid height. So the laid paper that stood in for Pastel Paper drew Shenbot's Background as a tartan. A soft paper (pastel, watercolour, cotton) is now drawn from a recipe of its own (`standInPaper.ts`: wavy fibres across the sheet with a fine tooth over them, 256 across, seamless), and its stand in tip is softer (hardness 0.3). Canvas and linen keep the laid paper.
- **More stand ins, drawn from recipes** (`standInGrit.ts` for papers, `standInTip.ts` for tips; nothing is copied from Procreate, each was matched by eye against Procreate's own picture of a brush that uses it). A name picks one, first match wins:

  | Procreate names | Stand in |
  | --- | --- |
  | paper `Brush-Artery-Charcoal-Corse` (6B Pencil) | `charcoalPaper`: grit in clumps at several sizes. Stays gritty (paint on the peaks first), depth 0.9, holds the stroke back only 0.05, so the middle is dark with scattered pin holes and the ends are sparse specks |
  | paper `Brush-Artery-Splatters` (Dry Inks, Inking Pen) | `splatterPaper`: nearly all tooth with scattered pin pricks, same way of working as charcoal, depth 0.98 |
  | paper `Brush-Preset-Pastel-Paper` (Background) | `pastelPaper`: a fine even tooth two to five pixels across, a little longer along the line than down it, dense and dark with pale specks. It replaces the long fibres for pastel: those read as smeared streaks. Watercolour, cotton and the other soft words keep the fibrous paper |
  | paper words canvas, linen, weave, cloth | `canvasPaper`: a basket weave whose threads wander and vary, not a ruled grid, depth 0.7. Laid keeps Frameling's own laid paper |
  | tip `Brush-Preset-Blotch` under a soft paper (Background) | a blotch with a ragged soft edge |
  | tip `Brush-Preset-Blotch` under any other paper (the inking pens) | a round with a rough, nearly hard edge |
  | tip `Brush-Pocket-Brick` (6B Pencil) | a blunt rounded block with a rough edge |

  The brick is square, not an oblong: a first try twice as long as it was tall drew the 6B Pencil's stroke twice as wide as Procreate's, because the tip turns with the line and Procreate's brush has a scatter. What the picture of the stroke shows is the blunt, rubbed edge, so that is what is kept. `Brush-Preset-Ink2` (Ink Bleed) is not drawn: its stand in was not clearly closer, so it stays a plain round. The rough edge of a tip is coarse on purpose: a 40 pixel pen is the 128 pixel stamp shrunk threefold, and finer specks vanish.
- **`textureScale` is not carried to a stand in.** It is about Procreate's own picture of the paper. Applied to ours it made three pixel blocks.
- **Tried and dropped: glaze** (a pixel takes its darkest dab, so dabs never build up). It would explain soft edges, but it turned Velvet int and Graphite ink grey where Procreate's are black, so Procreate's dabs do build up.

A paper can now be scaled smoothly (`Grain.smooth`, off for every old brush and for pixel brushes): the tile is blown up once with bilinear filtering, to a seamless `256 x scale` square that is kept beside the other tiles, and the scale may have a fraction (0.25 to 8). The importer does not use it yet, because `textureScale` and `textureZoom` have no settled units. Only three brushes in the files at hand carry a grain picture, and the thumbnails cannot fit them: Graphite ink (depth 0.16) and Basic 01 (lifted by 0.75) draw the same at every scale from 0.5 to 6, and Barely There is the only one that answers, but its ink swings from 70 to 260 for scales 1 to 3 while its look differs from Procreate's for other reasons (scatter, gaps). So `textureScale` is still read as a whole number and `textureZoom` is not read.

What is still short, and would need engine work to close: the stand ins are a handful (charcoal, splatter, pastel, fibre, canvas, laid; blotch, brick, a rough round) where Procreate has dozens of named papers and tips; and a tip is kept at 128 pixels.

### Taper, and the pen Procreate draws its pictures with

The start and end of nearly every picture is taper, not pressure. Ink Bleed 1 has no pressure on size at all, and its picture is a line that thins to a point at both ends. So:

- **Taper is `DabBrush.taper`** (`start`, `end` in brush widths, `size`, `opacity`). The start is drawn live; the end is drawn when the pen lifts (`DabStroke.taperEnd`), as Procreate does it.
- **The pen's set is the one read** (`pencilTaper...`; `taper...` is the finger's and is the fallback). Ink Bleed 1 and its copy differ only in `pencilTaperStartLength` (0.26 and 0.59) and their pictures differ: the copy takes twice as long to reach full width.
- **A length of 1 is 530 pixels of the picture** (half its width), whatever the brush's size: Ink Bleed 1 (17 px, start 0.26) is full width a fifth of the way along an 817 pixel stroke, Dry Ink v2 (14 px, end 1) starts thinning a third of the way along, Graphite ink (80 px, start 0.86, end 1) peaks just before the middle. It is kept in brush widths (530 x length / the size it came in at), so it grows with the brush.
- **`taperVersion` 0 keeps one length for both ends.** Velvet int, Basic 01, the 6B Pencil and Dry Ink v2 have a start of 0.016 or 0 and an end of 0.5 or 1, and all four pictures grow from a point over the length the end gives.
- **A taper that thins does not fade as well** (`opacity` 0). The 6B Pencil, Dry Ink 1 and Dry Ink v2 ask for a full fade and their pictures are as dark at the tip as in the middle. One that only fades does: Shenbot's Background keeps its width and its picture goes soft at both ends.
- **The size allows for it.** The picture is drawn with the taper on, so its widest point can be short of the brush: a short picture is the start of a stroke still inside its start taper (Teardrop Ink: 177 pixels of 530), and two long tapers that meet in the middle never let the full width through (the 6B Pencil comes in at 220, not 139). The measured width is divided by the most the tapers let through.
- **The pen in the pictures** presses as the square root of a half sine over a stroke 817 pixels long (read off Coloring Pen, which has pressure on size at 1 and no taper), and a short picture is the first part of the same stroke with the pen still down. The comparison harness draws with that pen now, where it used to read a pressure off how much ink each column held, which mixed the taper into the pressure.

Not explained: older files' strokes also swell more slowly than that pen would make them (`dynamicsPressureSizeSpeed`, a lag on the pressure, is the likely cause and is not read).

### What is still a guess

Each of these is read by its key's name, with nothing to compare against. Where one changes what a brush does, the brush's own notes say so (and a brush that has none of them says nothing).

- **`plotSpacingVersion` 1 and up.** One source (gddg) says the number is stored squared there. Spacing from 2015 files (no version key) is plain, **Seen**. The newer files' is read as plain too, because wrongly reading a continuous brush as beads (what squaring would do) is a worse mistake than the other way round, and Frameling's closest spacing (5%) catches most small numbers anyway. A brush with a newer file's spacing above 6% says it was not checked.
- **Pen controls.** `dynamics<Pressure|Tilt|Speed|Roll><Size|Opacity|Hue|Saturation|Brightness>`: a value from 0 to 1 is the route's `amount` (a negative one, from one source, turns it over); the curve (`...Curve`, strings like `"{0.0, 0.0}"`) is the route's `curve`; roll is pen twist; opacity is flow. Only the press on opacity was seen to act (Seed), and only as a straight line. The keys of a route that is under 2% are ignored.
- **Jitter.** `dynamicsJitterSize` is `sizeJitter`; the other jitters are `random` routes (opacity jitter to `opacity`, or to `flow` under a gritty stand in paper). `plotJitter` is in the table above. The 0.25 is by eye: Graphite ink (0.54) is a loose cloud, Basic 01 (1.67) has a ragged edge but is one stroke. A brush that throws its dabs has its size measured off the whole reach of the cloud in the picture, less the throw.
- **A named built in paper gets one of Frameling's own when its name says what tooth it has.** `bundledGrainPath` names one of Procreate's own papers, which is not in the file. **Grit** (charcoal, coarse, chalk, sand, graphite) gets Frameling's fine paper at 0.75 of the depth, catching the way Frameling's papers do (peaks first, `grainCut`), holding the whole stroke back only a little (`hold` 0.12), with the opacity controls as flow: so the soft edge of the tip and a light touch break into specks and a firm stroke fills in nearly solid. That is Procreate's picture of the 6B Pencil, which is 97% covered in the middle with pin holes through it and ragged at the edge. **A weave** (canvas, linen, laid) gets the laid paper at 0.7 of the depth, thinning the paint (`thin`). **A soft paper** (pastel, watercolour, cotton) gets a fibrous paper drawn for the job, at full depth (see Papers below). Both follow `textureMovement` like a grain picture. A stand in tip for such a brush is a round one with a soft edge (hardness 0.65), because the edge is where a paper shows. A name that says nothing about tooth still gets no paper. Splatters counts as grit: Shenbot's Inking Pen names it and is smooth, but only because its grain is stamped (movement 0.04), so every dab finds new paper; Dry Ink 1 names the same paper, rolling, and is rough all through.
- **`shapeRandomise`** (a toggle) is a full random turn for every dab. `shapeScatter` is in the table above. `shapeCount` (0 to 1) is 1 to 16 stamps at each step, each turned its own way: Frameling lays one dab a step, so the steps come that many times closer. Velvet int (count 0.72, a rake of bristles, scatter 1.1) is a dense dark leaf in Procreate's picture and was a few combed hairs without it.
- **Graphite ink's width, splatter and grey.** Beside Procreate's own picture, measured down the stroke (the ink in a column and how wide the middle 80%, 96% and 99% of it spread), the first reading was a third too wide in the body and a cloud of soft specks, and grey (the darkest ink 0.93; Procreate's is full black, 56% of its ink pixels fully dark). Three readings did that, found by drawing the brush with one thing changed at a time. **The throw**: a straight 0.25 x jitter threw its dabs 0.155 of the width, but the best fit is under 0.05; Basic 01 (jitter 1.67) fits 0.41. So the throw is 0.19 x jitter ^ 1.5 (Basic 01 0.41, Fuzzy ink 0.39, Graphite ink 0.09). **The size**: it was read from the cloud's whole reach, less 1.5 x the throw, so a throw that was too big made the dab 132 pixels; with the smaller throw it is 106, and the fit is flat between 106 and 120. A throw under 0.1 is no longer read as a cloud for the size. **The grain**: a grain picture 0.16 deep (under a quarter) is left out, with a note: at that depth Frameling's paper holds the whole stroke back to about 0.9 and greys it, where Procreate's shows nothing. Drawn without it the line reaches full black. Together the lab's score for Graphite ink (ink in a column plus the three spreads, against Procreate) went from 53 to 29, and the whole set of 16 went from 318 to 298 (Dry Ink 1 and Fuzzy ink are a little further off, 15.6 to 17.3 and 19.6 to 20.0, because their small throw is smaller). Not fixed: Velvet int is still too wide (its score 55) and has no throw at all, so it is not this reading; its edge in Procreate is a soft haze that the tip's faintest greys build up, which the trimming of near empty cells takes away.
- **Grain.** A `Grain.png` keeps up to 256 pixels across as a repeating paper and **thins the paint** (`thin`: each dab is multiplied by the paper, and the paper caps the stroke), with its own greys kept as they are and `textureBrightness` and `textureContrast` baked in. Basic 01 lifts its grain by 0.75, which is why it is a dense stroke at full depth; before, every grain picture was spread evenly from black to white like Frameling's own papers, which shredded it. It always stays put (see Papers below). Which way round light and dark catch, how `textureScale` becomes our whole number of 1 to 8, and the depth when a file has no `grainDepth` (0.8) are still guesses.
- **Wet mix.** `dynamicsMix` is `wet` at the same amount (`dynamicsLoad` and `dynamicsWetAccumulation`, which are not mixing, are not read). One source (CSP2PC's author) guessed the same grouping.
- **Blend mode.** `blendMode` and `extendedBlend` are dropped with their number, because the table of numbers for a brush has not been checked (topsd has the one for layers).
- **A dual brush** is dropped, not mapped to our field of dots: there is no real file with a `Sub01` to read, and a guess on a guess is worse than a note.

### What is left out, with a note

The taper's opacity on a taper that also thins, and its tip shape (`...TaperShape`), count jitter, flip jitters, `shapeAzimuth` and `shapeRoll`, the smoothing keys (the stabiliser is the tool's), `dynamicsGlaze` and the `rendering*` modes, bleed and blur, `metallic*`, `burntEdges*`, `wetEdges*`, secondary colour and per stroke colour jitter, the tip getting rounder with pressure or tilt (only when its minimum is under 1). These are named only when a brush really uses them (a number over a hair, a flag on). A Procreate brush is three brushes in one (paint, smudge and erase: `smudge*`, `erase*`): only the paint one comes across, and that is said in the help, not on each brush. Ours with nothing to fill it from: `aliased` and `hardness` (a Procreate tip is a picture; a built in shape that is not in the file comes as a hard round tip), `fadeLength`. Over `MAX_ROUTES` pen controls are cut with a note.

### Limits

Brush settings are capped at 2 MB unpacked, each picture at 32 MB and 24 million pixels, the property list at 50,000 objects, 32 levels, 4,096 characters a string and 200,000 steps (a file that names the same big array again and again is stopped by that last one), and a whole file's pictures at 256 million pixels (a set of full size tips stops with a note, not after a minute's work). Zip limits are the ones in the rules above.

### Free real files, and how the rest could be checked

The three files used as fixtures (`test/fixtures/brushes/procreate/`, `NOTICE.txt` names each, its source and its licence) are the only ones checked against. More:

| Pack | Licence | How to get it | What it is good for |
|---|---|---|---|
| [Versluis stitch and sequin brushes](https://www.versluis.com/2015/01/procreate-stitch-and-sequin-brushes/): 12 single `.brush` files, 2015 (used: Sequins, Plain Stitch) | CC0 (stated on the page) | Direct links on the page | The old, small key set (44 keys). Inverted tip, scatter, spacing over 1 |
| `Seed.brush` in the [CSP2PC repo](https://github.com/Leon-Schoenbrunn/CSP2PC) (used) | MIT | In the repo | The new, full key set (219), 2048 pixel tip. Mostly defaults, so it names keys more than it shows values |
| [Catherine's Basic Procreate Brushes](https://coborski.itch.io/catherines-basic-procreate-brushes), `cats-basics.brushset`, 18 MB, 2024 (**not opened**) | CC0 (stated on the page) | itch.io, by the page's download button (no direct link) | A `.brushset`, so the set layout and `brushset.plist`, and six modern brushes. **The first thing to try, to check the set reader** |

What the thumbnail cannot settle (size, pen controls, grain, dual, wet mix) needs **two exports of one brush that differ by one slider** (from someone with Procreate), which names the key and its direction in one go. Also open: whether `.brushlibrary` has the same layout (one source says unknown). Lead only: Procreate's own older official sets, said (in the PR in the evidence table) to be on `download-assets.procreate.art`; the licence on them was not looked at, and they would be for checking against, not for the repo.

## Clip Studio Paint and Affinity: what is known, and not yet checked

**Nothing in this section is built, and none of it has been checked against Frameling's engine.** It is what could be found in
public, written down so the next person starts from it and does not repeat the search. Neither maker publishes the format, so
everything below comes from other people reading files. (Procreate was in this section until it was built and checked: see [Procreate](#procreate-brush-brushset).)

How sure each line is:

- **Seen**: found by opening a real file during this research. Three Procreate files; nothing for the other two.
- **Two sources**: two readers that did not copy each other say the same.
- **One source**: said once. Treat it as a hint.
- **Guess**: inferred from a name, or from what a converter's author did. Not evidence.

No GPL or AGPL code was read, the same rule as above. (CSPBrushExtract, the best known `.sut` tool, is AGPL, so only its README
was read.) The one piece of code that was read (CSP2PC) is MIT, and topsd's notes are CC BY 4.0.

### Where the evidence comes from

| Source | What it is | Licence | How far to trust it |
|---|---|---|---|
| [topsd/procreate-format](https://github.com/topsd/procreate-format) `docs/brushes.md` | Notes on `.brush` and `.brushset`, with a label on every claim and the sample files named | CC BY 4.0 | Best of the lot: honest about what it did not decode. Its checks were on real, public files, three of which were re-opened here |
| [Leon-Schoenbrunn/CSP2PC](https://github.com/Leon-Schoenbrunn/CSP2PC) (`csp2procreate.py`, `Seed.brush`) | Turns a `.sut` into a `.brush`: the only working code found that reads one **and** writes the other | MIT | Real code against real files, but a hobby tool: it takes the first settings row only, and its own number handling is inconsistent (see below) |
| [Brushfactory](https://brushfactory.co/formats/brush), [and `/sut`](https://brushfactory.co/formats/sut) | Format pages from a brush site's own parser | n/a | One vendor, says "built against the applications' own source and real files", cannot be checked, lists no settings |
| [CSP Brush Info](https://kenevans.net/opensource/CSPBrushInfo/Help/Overview.html) | A reader of CSP's own settings files and `.sut` | not checked | Says plainly its guesses may be wrong, and that it saw CSP 1.8.8 on Windows 10 only |
| [luce-procreate](https://github.com/dymokomi/luce-procreate), [gddg](https://github.com/smallertrixie/gddg) | Procreate readers | MIT or Apache; none stated | Tested **only on files their own scripts made**, so they show the layout and prove nothing about values |
| [Pipelines-Plugin PR 23](https://github.com/groot99-droid/Pipelines-Plugin/pull/23) | A byte for byte round trip of 1,071 real `Brush.archive` files, 260 distinct keys | n/a | Real files, so the layout and the key count are solid. It says itself that nothing was opened in Procreate and "many stroke rules are inferred from key names and thumbnails" |
| Procreate's [Brush Studio handbook](https://help.procreate.com/procreate/handbook/brushes/brush-studio) | What each setting is called on screen | n/a | The names a person sees, not the file's keys |

### Clip Studio Paint (`.sut`)

| Claim | How sure | Source |
|---|---|---|
| A `.sut` holds a SQLite database | **Two sources**, and working code | CSP Brush Info; Brushfactory; CSP2PC |
| It is **not** a bare SQLite file. CSP2PC finds the database by searching the file for the text `SQLite format 3` and reading from there on, so there are bytes before it that nobody wrote down | One source (inferred from that code) | CSP2PC |
| Tables `Node` (the brush: `NodeName`, `NodeVariantId`, `NodeInitVariantId`, ...) and `Variant` (one row of settings per variant, a column per setting) | Two sources | CSP Brush Info; Brushfactory |
| The `Variant` columns **differ between Clip Studio versions**, so a reader has to ask the database which it has | Two sources | CSP Brush Info ("changes with the versions"); Brushfactory |
| Tip and texture pictures are in table `MaterialFile` (`_PW_ID`, `FileData`). `FileData` is a plain tar of PNGs; some are wrapped in Celsys's own `.c2f` container | One source for the tar and the wrapper | Brushfactory. CSP2PC finds the picture another way, by scanning the blob for a PNG, which agrees that a PNG is in there |
| A `.sut` can hold several tips (one `MaterialFile` row each) | One source | CSP2PC makes one brush per row |
| Pen controls (pressure, tilt, speed, angle) are in **binary blobs** in the `*Effector` columns, big endian, not in plain columns. Brush angle flags: `0x10` pen direction, `0x20` barrel rotation, `0x40` stroke direction | Two sources agree on blobs; the flags are one | Brushfactory; CSP Brush Info ("partially decoded", and the layout changes by version) |
| `.sutg` holds several brushes | One source | `brush_converter` notes |

**Settings.** Column names that CSP2PC reads, all `Brush...`: `BrushSize`, `BrushInterval`, `BrushFlow`, `BrushRotation`,
`BrushRotationRandomScale`, `BrushRotationInSpray`, `BrushRotationRandomInSpray`, `BrushUseSpray`, `BrushSprayBias`,
`BrushPatternOrderType`, `BrushRevision`, `BrushUseIn`/`BrushUseOut`, `BrushInLength`/`BrushOutLength`, `BrushInRatio`/`BrushOutRatio`,
`BrushUseWaterColor`, `BrushMixColor`, `BrushMixAlpha`, `BrushRotationEffector`. One source, so names only.

The **units are the open question**, and the one working reader does not know them either. It treats `BrushFlow` as 0 to 1 in one
place, 0 to 100 in another and 0 to 1000 in a third. It turns `BrushInterval` into a spacing by dividing by `BrushSize` and then
multiplying by a "fudge factor" it picked by size, which is what someone does when the numbers do not line up. Take that as
the honest state of things: a size in pixels, an interval in pixels, and the rest unknown.

Mapping, by what the Clip Studio screen calls them, so **guesses**: brush size and interval are `size` and `spacing`; rotation and
random rotation are `angle` and `angleJitter`; flow is `flow`; spray is `scatter`; the start and end fade-in and fade-out are our `fade` source
at the start, with **no end taper** on our side; the water colour and colour mixing group is `wet`. The tip picture is probably
dark-paints (CSP2PC inverts the brightness and multiplies by the see-through to get a Procreate tip), which matches how Krita and GIMP masks work and
would suit the soft tip: one source. **No equivalent**: Clip Studio's multiple-brush and pattern sequencing, vector and ruler
behaviour, correction (stabilising), the watercolour edge and the layer composite it chooses. **Ours with nothing to fill it**:
`grain` (CSP2PC found no paper in the file to read), `dual`, curves (they are in the effector blobs, which no source decodes),
`hardness`, `aliased`.

**What a real file settles.** The units of every column; what comes before the SQLite header; whether a `Variant` has more than one
row and which is current; and the effector blobs, which hold every pressure, tilt and speed curve. Without those a `.sut` would bring
in a tip, a size and a spacing and **lose every pen control**, which is most of what makes a Clip Studio brush that brush. The ask:
two or three `.sut` files from **different Clip Studio versions** (the columns move), ideally with the matching pictures of the Sub
Tool Detail window, and a pair that differ by one setting.

Real files: no CC0 pack was found. Free ones exist on the makers' own terms (check each before keeping a copy): [5x free brushes for
Clip Studio Paint](https://ed-of-all.itch.io/5x-free-brushes-for-clip-studio-paint) (itch.io, pay what you like), [a free pack on
Gumroad](https://lonelyshootingstar.gumroad.com/l/FREEBRUSHPACK), and anything from Clip Studio ASSETS (needs an account). None was
downloaded or opened. Clip Studio also reads Photoshop `.abr`, so a pack that ships both already works through the Photoshop reader.

### Affinity (`.afbrushes`)

Nothing public was found. Searches turned up the file extension sites (which only say "a brush file for Affinity Photo and Designer, raster
or vector", with a generic type and no header or magic bytes), Serif's forum (a staff reply that it is a cross app sharing format, not
something to open elsewhere), and tutorials for importing it. No reverse engineering write up, no open source reader, no format
note. Whether it is a zip, a Serif container or something else is **not known**, and no file was available to look at. The one useful
fact is on the Affinity side: Affinity imports Photoshop `.abr` for its raster brushes, so a pack that ships both formats
already comes in through the Photoshop reader. A pack that is `.afbrushes` only does not.

A real file would settle all of it, and the first question is only what the first bytes are. Ask for one free pack in
`.afbrushes`, and if the maker also ships the same brushes as `.abr`, that one too: the pair gives a free comparison of Affinity's
settings against ones we already read. Free packs found, none opened and none stated CC0: [Frontier Scum brushes](https://makedatanotlore.itch.io/frontier-scum-brushes)
(says free for personal and commercial use, no licence needed). Do not plan on this one until a file shows that it can be read.

## Adding another format

Write `readXFile(bytes, fileName): ImportResult` that throws `BrushProblem` for a bad file and builds each brush with
`cleanDab`; add it to `sniff` and `readBrushFile` in `index.ts` and its ending to `IMPORT_EXTS`. Tests go in
`test/brushes/`: real files as fixtures where there are any, files built to the layout, a damaged one and a hostile one.
Krita's `.kpp` and `.bundle` are the example of a format that needs an unpacking ceiling (`inflate.ts`, `zip.ts`).

## Looks

`sh scripts/docs/ab-brush-import/make.sh` draws one stroke for every real file in `test/fixtures/brushes` (and the files in
`BRUSH_AB_EXTRA`) with the real importer, and lays them beside their names and settings in `brand/ab/brush-import/`.
`BRUSH_AB_SETS=krita BRUSH_AB_OUT=brand/ab/brush-import2` makes just one format's sheet somewhere else. The help
picture is `scripts/docs/help/brush-import.cjs` (a made-up Photoshop set, `_brushset.cjs`).

`sh scripts/docs/ab-procreate/make.sh` draws the stroke Procreate drew for each of the three Procreate fixtures again with the
real importer and stroke engine (in Node, no screen), and lays Procreate's own picture beside the first guess and the current
mapping in `brand/ab/procreate-import/`. It is how the units in [Procreate](#procreate-brush-brushset) were settled.
