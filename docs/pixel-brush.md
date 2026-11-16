# The pixel brush engine

One engine draws every pixel brush that is not soft paint or a dry medium: `src/dab/`. The brush library, the picker and the
palette commands sit on it (`src/brushes/`), and the saved brush is a `PixelSpec` (`src/dab/spec.ts`). Brush files from other
programs (card `brush-import`) are meant to land on this and not grow a second system. The clone stamp and the blur and sharpen
brushes did (`src/retouch/`, see the end of this page). This page is what they land on.

## The shape of a brush

`DabBrush` (`src/dab/maths.ts`). Colour is never part of it: the colour is the tool's, so one brush paints in any colour.

| Field | Meaning | Maps from |
|---|---|---|
| `tip` `'round' \| 'square' \| 'picture'`, `picture` (a `PixelStamp`, up to 32 by 32; `soft` makes each cell's see-through the amount of paint, in the colour picked, so a tip from a brush file keeps its shading) | The shape one dab has | PS tip shape and sampled tips, Krita auto and predefined brushes, GIMP `.gbr` pixmap and mask |
| `size` 1 to 300 px, `hardness` 0 to 1, `angle`, `roundness` 0.05 to 1, `follow` | Size, edge, rotation, flattening, turning with the line | PS diameter, hardness, angle, roundness; Krita size, fade, rotation, ratio |
| `spacing` 0.05 to 4 (a share of the size) | Gap between dabs; follows the live size, so a thin end is not dotted | PS spacing, Krita spacing, Procreate spacing |
| `scatter` 0 to 2 (share of size), `sizeJitter`, `angleJitter` | Random position, size and angle per dab | PS shape dynamics jitter, scattering; Krita scatter |
| `flow`, `opacity` | Flow: paint per dab, builds up as dabs overlap. Opacity: the most any pixel gets in one stroke | PS flow and opacity, Krita flow and opacity, Procreate flow |
| `aliased` | Sharp pixels (all or nothing). The default, and a first-class switch | none: a pixel art switch |
| `dynamics` (routes) | What drives what. See below | PS Control menus and minimum values, Krita sensors, Procreate pressure/speed/tilt curves |
| `fadeLength` | Pixels of line a `fade` source takes to run out | PS Fade steps (steps are dabs, so steps times spacing times size), Krita fade sensor |
| `grain` (`paper`, `depth`, `scale`, `moving`) | A paper the paint catches on | PS Texture (pattern, scale, depth, texture each tip), Krita texture, Procreate grain |
| `dual` (`tip`, `size`, `density`, `cut`) | A second tip of dots the first is let through | PS Dual brush (tip, diameter, scatter, count), Krita masking brush |
| `wet` 0 to 1 | Carries colour from under the brush along the stroke, and mixes with the stroke's own paint | PS Mixer brush wetness and load, Krita colour smudge, Procreate blend |
| `blend` (any layer blend mode but Add; `normal` is paint over) | How the paint joins what is on the layer | PS brush Mode, Krita composite op, Procreate brush blend mode |

### Dynamics are a list of routes

`DynRoute = { from, to, amount 0..1, invert }` (`src/dab/dynamics.ts`). At most 16, malformed ones dropped on read.

- Sources: `pressure`, `tilt` (lean, 0 upright to 1 flat), `twist`, `speed`, `direction` (heading round the compass), `fade` (1 at the
  stroke start to 0 at `fadeLength`), `random`. A source the device lacks (a mouse has no tilt) leaves its routes out, so a
  mouse gets the plain brush, never a missing one.
- Targets: `size`, `flow` (multiply: at source 0 the dab is `1 - amount` of its own; Photoshop's "minimum" is `1 - amount`),
  `angle` (adds up to a full turn), `scatter` (adds up to a whole size), `mix` (toward the back colour), `hue`, `saturation`,
  `lightness` (swing both ways round the middle of the source, so a `random` source is a plain jitter).
- Several routes to one target multiply (size, flow) or add (the rest). The options show the first route per target and say
  when a brush file brought more.
- A route can carry a `curve` (`src/dab/curve.ts`): a list of 2 to 8 `[x, y]` points, x from 0 (first point) to 1 (last), y 0 to 1,
  joined by a monotone smooth line. It bends the source before the flip (`invert`), so the graph always reads as drawn. A straight
  curve is left out. Read with `cleanCurve`, which mends what is off (order, range, ends, crowded points) and thins a long list with
  `thin` (so a curve of any length comes in as its nearest 8 points). Krita's sensor curves land here (Photoshop's and GIMP's files carry none); Procreate's pressure curve would too. Pass the points as 0 to 1, with the input on x.
- Mapping rule for importers: one control per property is one route. A "minimum" of `m` is `amount = 1 - m`. A curve goes in `curve` as its points, never flattened
  to a straight line (Krita's reader does this, see `routeOf`). Opacity and flow are both `flow` here, so
  a file that puts pressure on both gets one route, not two. The full mapping is in [brush-import.md](brush-import.md).
- `angle` is clockwise on screen. Photoshop's control numbers and GIMP's counter-clockwise angle are in brush-import.md.
- The Pen page's pressure for size and flow is skipped when the brush has its own pressure or tilt route to that target, so it
  never counts twice (`drivesFrom`).
- The back colour is the Fill colour (Photoshop's background).

### Texture, and why there is one mechanism

Grain and dual are small repeating tiles looked up one pixel at a time (256 by 256; a read and a mask each). Grain reuses the dry
media's paper tiles (`src/dry/paper.ts`), so chalk and charcoal and the pixel brush share one set of papers. The chalk and
charcoal look card should build on `grainCut`/`grainHeight` in `src/dab/texture.ts`. Grain cuts the paint of each dab (`add`) by the
paper's height: light paint only lands on the peaks, full paint always fills. With sharp pixels the paper replaces the page's ordered
dither as the threshold, so grain makes whole pixels. Dual tiles are canvas-fixed with a per-stroke offset (so every stroke has its own
dots and one stroke is stable).

## Not built, with the reason

- **Texture from a picture, and a second brush with its own spacing and scatter** (PS dual with scatter and count, PS texture from a
  pattern): grain is the five papers and dual is dots of one size. A `Grain`/`Dual` tile from an image is the extension point
  (`paperTile`, `dualTile` return `Uint8Array(256*256)`).
- **Blend modes inside the dual tip** (PS dual's multiply/subtract/overlay): the dual tip is only keep and cut. The brush's own `blend` is built.
- **Smoothing, stabiliser per brush**: the Pen page's stabiliser stays per tool.
- **Brush tip editor** (drawing a tip in a window): the tip is made from a selection.
- **Affinity** brush files: nothing public.
- **Wet paint is not a full mixer**: the load drifts toward what it crosses and dabs mix with the stroke's own paint in proportion, but there is no separate bristle load, no dry-out and no paint amount that runs low (PS Mixer brush load and mix).

## Where each piece lives

`maths.ts` (the brush, the tip sampler, `DabPath` that walks the pointer and makes dabs), `stroke.ts` (`DabStroke`: per pixel paint,
flow and opacity, crisp dither, palette snap, mirror, texture, colour), `dynamics.ts`, `curve.ts` (pen curves) and `CurveEditor.tsx`, `blend.ts` (paint modes), `texture.ts`, `colour.ts`, `sense.ts` (pointer
to inputs, speed), `spec.ts` (what a saved brush is, read defensively), `sample.ts` (picker thumbnails by the real engine, with a pretend
pen), `cursor.ts` (the tip as the cursor), `tools.ts`, `Options.tsx` and `DynamicsOptions.tsx`. Starters: `src/brushes/pixelStarters.ts`.

Hard rules: a locked palette is applied last (`snap` after every colour step), so no hue swing, mix, wet colour or grain can make a
colour it did not have. A brush read from any file goes through `cleanDab`: ranges held, unknown things dropped, nothing trusted.

## Retouch brushes: the one hook they use

The clone stamp, the Blur brush and the Sharpen brush (`src/retouch/`) are dab brushes that paint a colour worked out from the picture
instead of a flat one. The engine has one extra input for this, `DabParams.pick(x, y, was, out)`: given the pixel as it was before the
stroke, write the colour this pixel should become. The paint share the dab put there then moves the pixel that far toward it
(`mixTowards` in `src/soft/maths.ts`, colour and see-through together), so size, hardness, spacing, flow, opacity, the pen routes,
the selection and the palette lock all work as on any brush. A pixel is never painted over itself, so a clone of its own layer never smears.

Each tool keeps its own `DabBrush` (`src/retouch/settings.ts`, so a wide soft blur does not move the pencil's one pixel) and shows the same
Pen, speed and fade options (`DynamicsSection` takes a `DabHandle`). They hold the brush to their kind: no picture tip, no colour, no
texture. The clone stamp's source and offset live in `src/retouch/aim.ts` with the rules in `maths.ts` (`strokeOffset`: aligned keeps the
offset between strokes, otherwise every stroke restarts from the source). Which of the two is the ask-once choice `clone.align`, asked after
the first stroke.

- **Thin lines.** A smooth dab under two pixels wide is drawn as a two pixel one with its paint scaled by `size / 2` (`samplerFor`), so a hairline shows wherever it falls and gets fainter as it thins, instead of vanishing when it sits between two pixel rows. Crisp (aliased) dabs snap to whole pixels and are left alone.
