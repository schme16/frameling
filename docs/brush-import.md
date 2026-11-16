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
| `.brush`, `.brushset` | Procreate | **Not done, on purpose.** A zip holding an Apple keyed archive (`Brush.archive`) and its pictures; no public description of the keys, no real file on this machine and no freely licensed one found. A guessed layout would make wrong brushes without saying so. | |
| `.sut` | Clip Studio | **Not done, on purpose.** No public description and no real file to check against. | |
| `.afbrushes` | Affinity | **Not done, on purpose.** Nothing public and no real file. | |

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
spacing. A sampled tip's `Dmtr` is across the whole picture, so `size = Dmtr x visible share`.

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
  without one. More than 8 points are thinned to the nearest 8, with a note. Only Krita's curve is read: its overall height
  (a curve that tops out at half) is not, as the route is scaled to its own high point. Opacity dynamics come as flow
  dynamics, with a note.
- Scatter keeps its `ScatterValue` and drops (with a note) a pen control on it. `Texture/Pattern` is `grain` (no paper of its own, so it follows the sheet;
  `Strength`, `Scale`, random offset as `moving`), with a note that the pattern picture is not kept.
- Dropped with a note when on: Softness, Sharpness, Roundness, Spacing, Flip, Darken, Colour mixing, Airbrush rate, Hue,
  Saturation and Value dynamics, the sensors `ascension`, `distance`, `time`, `perspective` and barrel pressure, a masking brush,
  eraser mode, a blend mode other than normal, airbrush mode, density and randomness of a generated tip, spikes, a tip's
  brightness and contrast adjustment, a smudge brush's smudging.
- Left out altogether, and counted in the file's note: presets from any other engine (sketch, spray, bristle, grid, shape,
  clone, deform, curve, hatching, filter, particle, round marker), a preset with an SVG tip, and a preset whose tip picture is
  not in the bundle.

## Known doubtful

- **Krita's `hfade`/`vfade` and the sensor enable flags** were read from Krita's own presets (the default round brush is
  `hfade` 1; the "Opacity" and "Flow" brushes switch those on with `UseCurve`), not from Krita's documentation of the file, and
  not checked by painting the same stroke in Krita. The direction of a turned tip is taken as clockwise, unchecked. `ScatterValue`
  is taken as a share of the brush size. A fade's `length` is taken as dabs.
- **Krita curves are kept, but not checked against Krita.** `Basic-5 Size`'s flow curve (it jumps to nearly full by a 7%
  press) comes with that jump, and its size curve with its late rise, as the route curves the engine draws. Frameling joins the
  points with its own smooth line, which may differ a little from Krita's between two points. A curve that tops out below 1 is
  scaled up to 1, so such a brush paints a little heavier than in Krita.

- **Photoshop and GIMP files carry no curves.** A real Photoshop 2026 `.abr` keeps, for each control, only the control menu, the
  jitter, the minimum and the step count (see `photoshop_dynamics.abr`), and GIMP's `.vbr` has no pen controls at all, so there is
  nothing for those readers to keep or flatten. If a Photoshop file with a curve turns up, its key is not read yet.

- **The direction of an angle.** GIMP's `.vbr` angle is taken as counter-clockwise (turned the other way for Frameling);
  Photoshop's `Angl` is taken as clockwise (AbrKit's note). Neither was checked against the program, which is not on this
  machine. It only shows on a flattened or square tip.
- **The control numbers** 5 to 8 come from AbrKit's list and one real file; 1 to 3 are confirmed by real files.
- **Dual brush and texture** are the engine's nearest things (a field of dots, five papers), not a copy. A Photoshop brush
  built on them looks like itself in spirit only, and says so.
- **Colour dynamics** are dropped for want of a real file to read the key names from. They could map to the `hue`, `saturation`,
  `lightness` and `mix` routes.
- Version 1 and 2 `.abr` have no real fixture.

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
