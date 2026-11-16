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
| `.kpp`, `.bundle` | Krita | Not done. | |
| `.brush`, `.brushset` | Procreate | Not done. No public specification of the insides. | |
| `.sut` | Clip Studio | Not done. | |
| `.afbrushes` | Affinity | Not done. Nothing public. | |

No GPL code was read or copied (Frameling is MIT). GIMP's own loader is GPL, so the GIMP formats come from the format
descriptions GIMP publishes, and from the brushes that ship with GIMP (CC0, per `gimp-data/LICENSE`). Fixtures and their
origin: `test/fixtures/brushes/` (`abr/NOTICE.txt`).

## The rules every reader follows

- **Untrusted input.** A brush file comes from the internet. Every read goes through `Reader` (`bytes.ts`), which never goes
  past the end; sizes are checked against what is really in the file before anything is allocated; depth, item counts, side
  lengths, pixel counts and brushes per file are capped (`MAX_FILE_BYTES` 64 MB, 1000 brushes, 8192 pixels a side for a
  Photoshop tip, 24 million pixels a tip, 24 levels of descriptor, 100000 descriptor items). Nothing is executed. A damaged
  file ends in a plain message (`BrushProblem`), never a crash: `readBrushFile` does not throw.
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
- `useTexture` is `grain` (the medium paper, `textureDepth`, scale, and `TxtC` "each tip" as `moving`), with a note that the
  pattern picture is not kept. `dualBrush` with a sampled (textured) second tip is `dual`: round dots no bigger than a quarter
  of the brush, density 60% (more with a count), `cut` for subtract; the second tip's own picture, spacing, scatter and blend mode
  are dropped with a note. A plain round second tip is left out altogether (a field of dots would look nothing like it), with a note.
- `toolOptions` (only when `brushPreset`): `flow` and `Opct` are flow and opacity.
- Dropped with a note when on: roundness jitter and control, flip jitter, count and count jitter, scatter and wetness
  controls, colour dynamics, wet edges, noise, build-up, brush pose, brush group, smoothing.
- A group (`useTipDynamics`, `useScatter`, `usePaintDynamics`) that is switched off is ignored, as Photoshop ignores it.

## Known doubtful

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
Krita's `.kpp` (a PNG with the preset as text) and bundles (a zip) are the next ones; both need a size-capped inflate.

## Looks

`sh scripts/docs/ab-brush-import/make.sh` draws one stroke for every real file in `test/fixtures/brushes` (and the files in
`BRUSH_AB_EXTRA`) with the real importer, and lays them beside their names and settings in `brand/ab/brush-import/`. The help
picture is `scripts/docs/help/brush-import.cjs` (a made-up Photoshop set, `_brushset.cjs`).
