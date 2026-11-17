# Brush parity: the honest table

The question: how far is the pixel brush from the vector Brush? This is the table before any building. Everything here was read from the code and checked in the running app (Electron, inside xvfb), dark and light. The pictures are in this folder: `panels-dark.png`, `panels-light.png` and `lists-dark.png`.

## What "the pixel side" means

There is no single pixel brush. On a pixel layer you meet four things:

- **Brush (B) on a pixel layer.** The same tool as the vector Brush, but its panel is a different, tiny one: Size, Pixel perfect, Brush from selection, Stabilizer, Mirror drawing. No picker, no saved brushes, no preview. This is what you get if you just press B on a pixel layer.
- **Pixel brush.** The dab engine (`src/dab/`): tips, spacing, scatter, dynamics, paper, dual tip, colour changes, wet paint, blend modes.
- **Soft paint** (Soft brush, Airbrush, Highlighter, Soft eraser, Smudge, in `src/soft/`) and **Chalk and charcoal** (nine sticks on paper, `src/dry/`).
- The three tools above share one brush list of 53 (the starters in `src/brushes/pixelStarters.ts`, plus yours and anything imported). The vector Brush has its own list of 62 (`src/brushes/starters.ts`). The two lists live in one library, and each side only shows its own.

In the table, "pixel side" means all of that, and the controls are those of the Pixel brush tool unless a row says otherwise.

## Totals

| | there on both | there but different | vector only | pixel only | rows |
|---|---|---|---|---|---|
| **Brushes** (the two lists: 62 vector, 53 pixel) | 15 | 11 | 36 | 27 | 89 |
| Pen tips (vector Tip picker, pixel Tip buttons) | 1 | 12 | 3 | 1 | 17 |
| Sticks (vector Stick picker, pixel Chalk and charcoal Medium) | 9 | 0 | 0 | 0 | 9 |
| Soft paint kinds (pixel only) | 0 | 0 | 0 | 5 | 5 |
| **Controls** in Tool options | 11 | 22 | 16 | 37 | 86 |

Brush rows are counted once per pair: a "both" or "different" row is one vector brush and its pixel counterpart, so 15 + 11 pairs use 26 pixel brushes; the 27 left over are the pixel only rows. That is 15 + 11 + 36 + 27 = 89 rows from 62 + 53 brushes.

**How I decided "both" and "different" for a brush.** Both: the same brush under the same name (give or take "Pixel" or "on paper") doing the same job. Different: no brush of that name on the other side, but a real counterpart that does the same job in a different way. Vector only and pixel only: nothing on the other side does that job. Pixels against vectors is never counted as a difference, since that is the point of each side.

A control is counted by its label in the panel, one row each. Controls that only show for one tip kind (the Stamp sliders, the Bristles sliders) are counted, with the tip they belong to. A different panel order alone is not enough to say "different": it is mentioned in the note and the row stays "both".

## The five biggest gaps, in plain words

1. **On a pixel layer, the Brush tool is a different, tiny tool.** No saved brushes, no picker, no preview, no Tip, no Paper. Press B on a pixel layer and none of the vector side is there.
2. **The pixel Pixel brush has no big preview and no Tip or Stick pickers.** It has a Brush picker (untitled), three Tip buttons and nothing for sticks, so nothing looks like the vector panel.
3. **Vectors have none of the pixel engine's paint behaviour.** No flow, no opacity cap, no soft edge, no dual tip, no wet paint, no colour changes along the line, no blend mode, no tilt or speed on a point. That is 37 pixel only controls, and 22 of the 27 pixel only brushes depend on it (the other 5 a vector brush can already do).
4. **Pixel has no bristles, Along the line, Edged, Watercolour rim, Matte finish or Gap variety.** That is 16 vector only controls. Of the 36 vector only brushes, 20 only need a saved brush (the engine can already do them), 1 needs a small addition (Spinning leaves wants Gap variety), and 15 need new engine work: Watercolour (4), Gouache, Oil paint, Hog bristle, Fan brush, Rake, Ribbon, Thread, Chain, Leafy vine, Battlements, and Copperplate (pressure on Roundness).
5. **Importing and the library are lopsided.** Add from a file (Photoshop, Krita, Procreate, GIMP) is on the vector panel too, but everything it reads lands in the pixel list, so a vector artist sees nothing arrive. A vector brush cannot keep its own paper; a pixel brush can.

## Brushes

### Every vector brush, in list order

| # | Vector brush | Group | Pixel counterpart | Status | What the pixel side can do about it |
|---|---|---|---|---|---|
| 1 | Pencil | Pencils | Pixel pencil | there on both | Pixel pencil is one pixel, sharp edged, and has no pressure of its own. Pressure pencil is nearer the feel. |
| 2 | Mechanical pencil | Pencils | none | vector only | Engine can: a one or two pixel round tip, smooth edges, a little pressure on size. Needs a preset. |
| 3 | Soft pencil (6B) | Pencils | Soft pencil on paper | there on both | Same stick on the same paper. Soft 6B pencil is a second, grain based take. |
| 4 | Colour pencil | Pencils | none | vector only | Engine can: Colour pencil is already a medium in the Chalk and charcoal tool. There is no saved brush for it. |
| 5 | Sketch pencil | Pencils | Light sketch pencil | there but different | Sketch pencil is also a medium in the Chalk and charcoal tool. |
| 6 | Ink | Pens | Tapered ink | there but different | Pressure on size in both. Pixel taper is measured in brush widths, vector taper in pixels. |
| 7 | Fine liner | Pens | Smooth pen | there but different | A thin even line in both. |
| 8 | Technical pen | Pens | Round 3 | there but different | Constant width in both. Round 3 has sharp pixel edges. |
| 9 | Gel pen | Pens | none | vector only | Engine can: smooth round tip, light pressure on size. Needs a preset. |
| 10 | Ballpoint pen | Pens | none | vector only | Engine can: thin round tip, a little pressure on flow. Needs a preset. |
| 11 | Comic pen (G-pen) | Pens | Inking pen | there but different | Pressure plus pointy ends in both. |
| 12 | Brush pen | Pens | none | vector only | Engine can: Thin to a point at the ends, pressure on size. Needs a preset. |
| 13 | Dip pen | Pens | none | vector only | Engine can: strong pressure on size and short points. Needs a preset. |
| 14 | Marker | Markers | Smooth felt tip | there but different | A fat even line in both. |
| 15 | Felt-tip marker | Markers | Felt marker | there but different | Felt marker uses a picture tip for its slight streak. |
| 16 | Fine marker | Markers | none | vector only | Engine can: a small hard round tip. Needs a preset. |
| 17 | Block marker | Markers | none | vector only | Engine can: a big square tip. Needs a preset. |
| 18 | Brush marker | Markers | none | vector only | Engine can: pressure on size and a point at the end only. Needs a preset. |
| 19 | Tapered brush | Paint | none | vector only | Engine can: pressure on size with a long start and end taper. Needs a preset. |
| 20 | Round brush | Paint | none | vector only | Engine can: pressure on size with short points. Needs a preset. |
| 21 | Gouache | Paint | none | vector only | Engine lacks real bristles (see below) and Matte finish. A picture tip of lines is close, not the same. |
| 22 | Oil paint | Paint | none | vector only | Engine lacks real bristles and the matte finish. A picture tip of lines is close, not the same. |
| 23 | Bristle brush | Paint | Pixel bristles | there but different | Pixel bristles is one fixed picture of lines. The vector bristles wander and run dry on their own. |
| 24 | Dry brush | Paint | none | vector only | Engine can: Crayon from the Chalk and charcoal tool is the same stick. Needs a preset. |
| 25 | Chalk | Chalk and charcoal | Chalk on paper | there on both | Same stick on the same paper. |
| 26 | Charcoal | Chalk and charcoal | none | vector only | Engine can: it is Compressed charcoal, which has a pixel brush. A copy of that one would do. |
| 27 | Soft pastel | Chalk and charcoal | Soft pastel on paper | there on both | Same stick on the same paper. |
| 28 | Oil pastel | Chalk and charcoal | none | vector only | Engine can: Oil pastel is already a medium in the Chalk and charcoal tool. There is no saved brush for it. |
| 29 | Crayon | Chalk and charcoal | Crayon on paper | there on both | Same stick on the same paper. |
| 30 | Vine charcoal | Chalk and charcoal | Vine charcoal on paper | there on both | Same stick on the same paper. |
| 31 | Compressed charcoal | Chalk and charcoal | Compressed charcoal on paper | there on both | Same stick on the same paper. |
| 32 | Watercolour | Watercolour | none | vector only | Engine lacks the darker, bolder rim where a wash dries. Flow and Wet paint make see-through colour, but nothing draws a rim. |
| 33 | Wet wash | Watercolour | none | vector only | Engine lacks the rim (as Watercolour). |
| 34 | Fine watercolour | Watercolour | none | vector only | Engine lacks the rim (as Watercolour). |
| 35 | Ink wash | Watercolour | none | vector only | Engine lacks the rim (as Watercolour). |
| 36 | Leaves | Stamps and texture | none | vector only | Engine can: a drawn leaf as a Picture tip, Turn with the line, a little scatter and size jitter. Needs a picture and a preset. |
| 37 | Falling leaves | Stamps and texture | none | vector only | Engine can: a leaf Picture tip with Angle jitter at full and scatter. Needs a preset. |
| 38 | Stars | Stamps and texture | Pixel stars | there on both | A picture tip stamped along the line. |
| 39 | Sparkles | Stamps and texture | Pixel sparkles | there on both | A picture tip stamped along the line. |
| 40 | Spinning leaves | Stamps and texture | none | vector only | Engine can do the leaf and the spin. It lacks Gap variety (gaps that bunch and spread): spacing never varies. |
| 41 | Paw prints | Stamps and texture | none | vector only | Engine can: a paw Picture tip. Needs a picture and a preset. |
| 42 | Hearts | Stamps and texture | Pixel hearts | there on both | A picture tip stamped along the line. |
| 43 | Dotted line | Stamps and texture | Pixel dotted line | there on both | Dabs with wide spacing. |
| 44 | Dashed line | Stamps and texture | none | vector only | Engine can: a flat square tip, Turn with the line, spacing over 100%. Needs a preset. |
| 45 | Stipple | Stamps and texture | Pixel stipple | there on both | Small dots with scatter. |
| 46 | Spatter | Stamps and texture | Pixel spatter | there on both | Pixel spatter uses a dual tip, the vector one scatters dots. |
| 47 | Confetti | Stamps and texture | Pixel confetti | there on both | Both scatter small shapes. Pixel confetti also changes colour along the line. |
| 48 | Italic nib | Calligraphy | Chisel | there but different | Chisel is a square tip, low roundness, fixed angle. |
| 49 | Broad nib | Calligraphy | none | vector only | Engine can: a square tip, low Roundness, fixed Angle. Needs a preset. |
| 50 | Copperplate | Calligraphy | none | vector only | Engine lacks pressure on Roundness (its targets are size, flow, opacity, angle, scatter and colour). The thick and thin of a pointed pen cannot follow the press. |
| 51 | Round nib | Calligraphy | none | vector only | Engine can: a round tip with pressure on size. Needs a preset. |
| 52 | Turning nib | Calligraphy | Chisel that turns | there but different | Both turn the flat of the tip with the line. |
| 53 | Hog bristle | Bristles | none | vector only | Engine can only come close with a picture tip of lines. It lacks bristles that wobble, stay stiff or run dry one by one. |
| 54 | Dry bristle | Bristles | Dry bristle brush | there on both | The pixel one is a picture tip of lines with grain. |
| 55 | Fan brush | Bristles | none | vector only | Close as a wide picture tip. Lacks the per bristle wobble and gaps. |
| 56 | Rake | Bristles | none | vector only | Close as a comb picture tip (Pixel bristles is one). Lacks the per bristle wobble. |
| 57 | Ribbon | Along the line | none | vector only | Engine lacks it: a dab is stamped at the same size and shape, never stretched down and bent along the whole line. |
| 58 | Thread | Along the line | none | vector only | Engine lacks stretching a drawing along the line (as Ribbon). |
| 59 | Chain | Along the line | none | vector only | Engine lacks Edged tips: separate drawings for the sides, the ends and the corners. |
| 60 | Beads and links | Along the line | Diamond chain | there but different | Repeated links. A picture tip repeats at a fixed spacing, but cannot bend each link round a curve. |
| 61 | Leafy vine | Along the line | none | vector only | Engine lacks stretching a drawing along the line (as Ribbon). |
| 62 | Battlements | Edged | none | vector only | Engine lacks Edged tips (as Chain). |

### Pixel brushes with no vector counterpart

| # | Pixel brush | Group | Status | What the vector stroke lacks to carry it |
|---|---|---|---|---|
| 1 | Round 6 | Pixel basics | pixel only | Sharp pixel edges and whole pixel sizes. A vector line is always a smooth outline; that is the point of each side. A Marker with a plain tip is the nearest. |
| 2 | Square 4 | Pixel basics | pixel only | A square tip with sharp corners. The vector Plain tip has round or flat ends only (Round or flat ends is one setting); a Pen nib at low Roundness is the nearest. |
| 3 | Big round | Pixel basics | pixel only | Sharp pixel edges (as Round 6). |
| 4 | Slash | Shapes | pixel only | A thin angled blade. A vector Pen nib at low Roundness can already do it. |
| 5 | Speckle | Scatter and spray | pixel only | A vector Stamp (Dot) with Wander can already do it. Needs a preset. |
| 6 | Sprinkle | Scatter and spray | pixel only | A vector Stamp (Dot) with a big Wander can already do it. Needs a preset. |
| 7 | Pressure pencil | Pen and speed | pixel only | Vector Pressure changes thickness can already do it (Pencil is that). The pixel one is sharp edged. |
| 8 | Fast is thin | Pen and speed | pixel only | Speed to size. A mouse already makes a vector line thinner when drawn faster; a pen has no speed route. Partly there. |
| 9 | Pressure spray | Pen and speed | pixel only | A vector Stamp (Dot) with Pressure sizes them can already do it. Needs a preset. |
| 10 | Pressure felt tip | Pen and speed | pixel only | Pressure on size and flow together. The vector stroke has no flow, so only the size half carries over. |
| 11 | Dry ink | Sketch and ink | pixel only | Dual tip: the brush only paints where a second tip of dots lets it. The vector stroke has no second tip. |
| 12 | Ink bleed | Sketch and ink | pixel only | A soft edge (Hardness 25%). A vector outline has a hard edge only; a blur effect on the shape is the nearest. |
| 13 | Colouring pen | Sketch and ink | pixel only | A soft edged round tip with pressure. The vector stroke has no Hardness, so the edge is always crisp. |
| 14 | Soft 6B pencil | Sketch and ink | pixel only | Dual tip grain on a big soft round. The vector stroke has no second tip (the vector Soft pencil (6B) uses the paper instead). |
| 15 | Canvas brush | Sketch and ink | pixel only | Grain at low flow with a soft edge. The vector stroke has no flow and no Hardness. |
| 16 | Chalk grain | Grain and texture | pixel only | Grain at half flow. A vector Chalk tip is close, but cannot be see through and build up, and cannot keep its own paper. |
| 17 | Pencil on paper | Grain and texture | pixel only | Grain at about two thirds flow with pressure. The vector stroke has no flow. |
| 18 | Pixel sponge | Grain and texture | pixel only | Big grainy dabs at low flow. The vector stroke has no flow. |
| 19 | Cracked paint | Grain and texture | pixel only | Dual tip. The vector stroke has no second tip. |
| 20 | Rainbow trail | Colour | pixel only | Hue wobble along the line (colour changes every dab). A vector stroke has one colour; a gradient along a stroke is not in the model. |
| 21 | Autumn leaves | Colour | pixel only | Hue and lightness wobble per dab, with scatter. A vector stroke has one colour. |
| 22 | Fades to the fill colour | Colour | pixel only | Mixes toward the Fill colour as the stroke runs out. A vector stroke has one colour. |
| 23 | Wet smear | Colour | pixel only | Wet paint: it picks up colour already on the layer and carries it. A vector stroke cannot read the pixels under it, and has no pixels there to pick up. |
| 24 | Soft round | Smooth edges | pixel only | Soft edge (Hardness 30%) at 60% flow. The vector stroke has no Hardness or flow. |
| 25 | Soft pixel brush | Soft paint | pixel only | Soft paint tool: a feathered round dab. The vector stroke has no feathered edge. |
| 26 | Pixel airbrush | Soft paint | pixel only | Soft paint tool: very soft, builds up while you hold still. A vector stroke has no build up with time. |
| 27 | Pixel highlighter | Soft paint | pixel only | Soft paint tool that multiplies colour over what is there. A vector stroke has no blend mode of its own (a layer has one). |

### Pen tips and sticks

| Vector Tip | Pixel Tip | Status | Note |
|---|---|---|---|
| Plain | Round | there but different | Plain is a smooth, solid outline. Round is a row of round dabs. Both are the default. |
| Chalk | Round with Catch on paper | there but different | Vector Chalk catches on the sheet's paper as an effect. Pixel does it per dab. |
| Charcoal | Round with Catch on paper | there but different | As Chalk. |
| Watercolour | Nothing | vector only | Engine lacks the rim of the wash. |
| Stamp: Leaf | Picture | there but different | Pixel picture tips are drawn by you; none ships a leaf. |
| Stamp: Dash | Picture | there but different | As Leaf. |
| Stamp: Dot | Round with wide spacing | there but different | Pixel Speckle and Dotted line do it. |
| Stamp: Star | Picture | there but different | Pixel stars ships. |
| Stamp: Diamond | Picture or Square at 45 degrees | there but different | Diamond chain ships. |
| Stamp: Heart | Picture | there but different | Pixel hearts ships. |
| Stamp: Paw print | Picture | there but different | Pixel picture tips are drawn by you; none ships a paw. |
| Pen nib | Square | there but different | Both make a flat blade with an angle and a roundness. |
| Along the line | Nothing | vector only | Engine lacks stretching a drawing along the line. |
| Edged | Nothing | vector only | Engine lacks Edged tips. |
| Bristles | Picture of lines | there but different | Pixel only has a still picture of lines. Vector bristles wander and run dry. |
| Yours (a stamp from a selection) | Picture, from a selection | there on both | Both turn a selection into a tip. |
| Nothing | Square | pixel only | Square has no vector Plain equivalent (a flat cap is a setting, not a tip). |

The nine sticks are the same nine on both sides, with the same names and the same hints (`src/dry/maths.ts` is the one list). The vector Stick picker only appears under the Chalk and Charcoal tips; the pixel Medium row only appears in the Chalk and charcoal tool. Only six of the nine are a pixel preset (Oil pastel, Sketch pencil and Colour pencil are not).

| Stick / medium | Pixel Medium | Status |
|---|---|---|
| Vine charcoal | Vine charcoal | there on both |
| Compressed charcoal | Compressed charcoal | there on both |
| Chalk | Chalk | there on both |
| Soft pastel | Soft pastel | there on both |
| Oil pastel | Oil pastel | there on both |
| Crayon | Crayon | there on both |
| Sketch pencil | Sketch pencil | there on both |
| Soft pencil (6B) | Soft pencil (6B) | there on both |
| Colour pencil | Colour pencil | there on both |

Soft paint kinds, which the vector Brush has nothing like:

| Soft paint kind | Where it is | Status |
|---|---|---|
| Soft brush | Soft paint tool and the Soft pixel brush preset | pixel only |
| Airbrush | Soft paint tool and the Pixel airbrush preset | pixel only |
| Highlighter | Soft paint tool and the Pixel highlighter preset | pixel only |
| Soft eraser | Soft paint tool, no preset | pixel only |
| Smudge | Soft paint tool, no preset | pixel only |

### Importing

| What | Vector | Pixel | Status |
|---|---|---|---|
| Add from a file: Photoshop .abr | Button is there, brushes land in the pixel list | Reads v1, 2, 6, 7, 9, 10 | pixel only |
| Add from a file: Krita .kpp and .bundle | Button is there, brushes land in the pixel list | Reads them | pixel only |
| Add from a file: Procreate .brush and .brushset | Button is there, brushes land in the pixel list | Reads them | pixel only |
| Add from a file: GIMP .gbr, .gih, .vbr | Button is there, brushes land in the pixel list | Reads them | pixel only |
| Add from a file: Frameling .json brush files | Works, for both sides | Works, for both sides | there on both |
| Paste from text, Copy as text, Save as a file | Works, for both sides | Works, for both sides | there on both |
| Clip Studio .sut, Affinity .afbrushes | Not read (on purpose) | Not read (on purpose) | there on both |

Every importer builds a `DabBrush` (`addImportedBrushes` in `src/brushes/presets.ts` makes it a pixel preset, always). Nothing turns a Photoshop or Procreate brush into a vector brush. That is the whole of the importer gap.

## Controls

Panel order. The first block is the vector Brush panel top to bottom (the tip specific rows sit where they appear for that tip). The second block is what only the pixel side has, in its panel order. "V1" and "P1" are positions in the panel pictures (`panels-dark.png`). Ranges are the ones in the code.

| # | Control | Vector Brush (on a vector layer) | Pixel brush (Pixel brush tool) | Status | Note |
|---|---|---|---|---|---|
| 1 | Big stroke preview | A wide S-shaped stroke drawn with the brush as set, at the top (V1) | Nothing. The picker button has a small picture of the stroke only | vector only | Pixel needs a preview drawn by the pixel engine (src/brushes/pixelPreview.ts already makes one for the rows). |
| 2 | Panel title and help icon | Title "Brush", no ? icon | Title "Pixel brush" (or "Soft paint", "Chalk and charcoal") with a ? icon | there but different | Only words; they should read the same. |
| 3 | Brush picker | Titled "Brush". 62 brushes, 11 groups, Favourites, Recent, search, Row size (V2) | Untitled. 53 brushes, 11 groups, Favourites, Recent, search, Row size (P1) | there but different | Same picker component; the pixel one has no title and a different list. Each side shows only its own list. |
| 4 | Picker popover: Size | Size slider (in px) | Size slider | there on both |  |
| 5 | Picker popover: Smoothing | Smoothing slider | Nothing | vector only | Pixel has no Smoothing; its Stabilizer is lower down. |
| 6 | Tip picker | A picker with 15 tips, each with a stroke picture (V3) | Three buttons: Round, Square, Picture (P4) | there but different | See the tip table below. The pixel side needs the same picker over its own tips. |
| 7 | Stick picker | Under Tip, for the Chalk and Charcoal tips: 9 sticks in 3 groups (V4) | Only in the separate Chalk and charcoal tool, as a Medium row of 9 buttons | there but different | The pixel Pixel brush has no stick. Sticks are a whole tool on the pixel side. |
| 8 | Paper group: Catch on paper | Switch, for Chalk and Charcoal tips (V5) | Switch (P13) | there on both | The same component (src/dry/PaperGroup.tsx). |
| 9 | Paper group: the five papers | Smooth, Fine, Medium, Laid, Rough. Always the sheet's paper | The same five. The brush can keep a paper of its own | there but different | A vector brush cannot keep its own paper (see plan.md). |
| 10 | Paper: Keep this brush on (paper name) / Use the sheet's paper | Nothing | Button pair, with a one time question when it matters | pixel only | Vector brush has no field for a paper. BrushTip has dry but not paper. |
| 11 | Paper: Use a picture as the paper | Nothing | Button (P13) | pixel only | Vector has no picture grain. The paper tooth effect on a stroke reads the sheet's paper only. |
| 12 | Paper: Catch on the dark parts instead | Nothing | Switch, with a picture paper | pixel only | As above. |
| 13 | Paper: How much it catches | Grain (amount) when Catch on paper is off | How much it catches | there but different | Different numbers: the vector one is the dust in the line, the pixel one is how deep paper pits hold paint. |
| 14 | Paper: Grain size | Grain size, 0.3x to 3x (0.5x to 3x with Catch on paper off) | Grain size, in pixels a bump | there but different | Same idea, different scale and range. |
| 15 | Paper: Soften the bumps of a bigger paper | Nothing | Switch (only when Grain size is over 1) | pixel only | Vector tooth is made by an effect, with no such switch. |
| 16 | Paper: A new patch of paper for every dab | Nothing | Switch | pixel only | Paper moves with the dab in pixels. A vector stroke has no dabs. |
| 17 | Paper: Thin the paint instead of stopping it | Nothing | Switch | pixel only | Per pixel paper maths; needs the dab engine. |
| 18 | Paper: How much it holds the whole line back | Nothing | Slider | pixel only | As above. |
| 19 | Edge (wash) | Slider, Watercolour tip only | Nothing | vector only | Engine lacks a wash rim. |
| 20 | Spacing | Slider, Stamp tips only (20 to 400%) | Slider, every tip (1 to 400%) (P7) | there but different | A vector plain line has no spacing. Pixel spacing works on dabs. |
| 21 | Size variety | Slider, Stamp tips only | Size jitter (in Shape, scatter and flow) | there but different | Same job, different name and range. |
| 22 | Wander | Slider, Stamp tips only (0 to 200%) | Scatter (0 to 200%) | there but different | Same job, different name. |
| 23 | Turn: Along the line / Upright / Any way | Choice, Stamp tips only | Turn with the line (switch) plus Angle jitter | there but different | Three way choice on one side, a switch and a slider on the other. |
| 24 | Spin | Slider, Stamp tips only | Angle jitter | there but different | Same job, different name. |
| 25 | Gap variety | Slider, Stamp tips only | Nothing | vector only | Engine lacks it: spacing is never varied. |
| 26 | Pressure sizes them | Switch, Stamp tips only | Size follows: Pen pressure | there but different | One switch against a source list. |
| 27 | Roundness (nib) | Slider, Pen nib tip only | Roundness (Shape, scatter and flow) | there on both |  |
| 28 | Angle (nib) | Slider, Pen nib tip only | Angle (Shape, scatter and flow) | there on both | Vector range is -90 to 90, pixel 0 to 359. |
| 29 | Angle stays: Fixed / With the line | Choice, Pen nib tip only | Turn with the line (switch) | there but different | Two way choice on one side, a switch on the other. |
| 30 | Bristles (count) | Slider, Bristles tip only | Nothing | vector only | Engine lacks drawn bristles. |
| 31 | Stiffness | Slider, Bristles tip only | Nothing | vector only | As above. |
| 32 | Dry gaps | Slider, Bristles tip only | Nothing | vector only | As above. |
| 33 | Bristle thickness | Slider, Bristles tip only | Nothing | vector only | As above. |
| 34 | Light and dark streaks | Slider, Bristles tip only | Nothing | vector only | Closest on pixel is Lightness wobble, which varies per dab, not per bristle. |
| 35 | On a long line: Stretch / Repeat | Choice, Along the line tip only | Nothing | vector only | Engine lacks it. |
| 36 | Use the selection as the drawing | Button, Along the line tip only | Nothing | vector only | Engine lacks it. |
| 37 | Edged parts (Sides, Start, End, Inner corner, Outer corner) | Five set and clear buttons, Edged tip only | Nothing | vector only | Engine lacks it. |
| 38 | Matte finish | Slider, any tip | Nothing | vector only | Vector does it with a colour adjust and film grain effect on the shape. Pixel could use the same two effects on the layer, or a blend, but has no control. |
| 39 | Tip note | A line about the tip in use | A line about the brush in use | there on both |  |
| 40 | Brush from selection | Button, always (V8) | Make from the selection / Use the selection instead, only when the tip is Picture. The plain Brush (B) on a pixel layer has its own Brush from selection button | there but different | Same idea. The vector button is always there; pixel buries it in the Picture tip. |
| 41 | Size | Slider, px (V9) | Slider, pixels across, 1 to 300 (P6) | there on both | Pixel Size sits after Tip and Spacing, vector Size after Brush from selection. |
| 42 | Save as... (and Update, Revert, Rename, Delete) | Under Size (V10) | Directly under the picker, above Tip (P2) | there on both | Same buttons, different place in the order. |
| 43 | Share your brushes: Save as a file, Copy as text, Add from a file..., Paste from text | Fold under Save as (V11) | Fold under Save as (P3) | there on both | Same row. Add from a file reads Photoshop, Krita, Procreate and GIMP files, but whatever it reads lands in the pixel list, even when you press it on the vector side. |
| 44 | More brush options fold | One fold, closed | Four folds: Shape, scatter and flow; Pen, speed and fade; Dual tip; Colour changes | there but different | Structure only. |
| 45 | Merge shapes together | Switch (object drawing) | Nothing | vector only | Belongs to vectors: a pixel layer has no shapes to merge. |
| 46 | Smoothing | Slider, 0 to 100% (evens the outline) | Nothing | vector only | Pixel only has the Stabilizer. |
| 47 | Pressure changes thickness | Switch | Size follows: Pen pressure (a source list) | there but different | A switch against a list of sources. |
| 48 | How much (pressure) | Slider, when the switch is on | Amount (under Size follows) | there but different | Same idea. |
| 49 | Pointy start | Slider, in pixels | Start taper, in brush widths (inside Thin to a point at the ends) | there but different | Different units. |
| 50 | Pointy end | Slider, in pixels | End taper, in brush widths | there but different | Different units. |
| 51 | Hold to tidy (and Hold time) | Switch and slider | Nothing | vector only | Vector layers only, by design: it swaps the stroke for a clean shape, and a pixel layer has no shape to swap in. |
| 52 | Stabilizer | Slider (shared pen options) | Slider (shared pen options) | there on both | The same component. |
| 53 | Stabilizer style: Pull string / Average | Choice | Choice | there on both | The same component. |
| 54 | Pen toggles (once a pen has been used) | Pressure changes strength; Leaning changes size | Pressure changes size; Pressure changes how much; Leaning changes size | there but different | Pixel has flow; vector has strength. |
| 55 | Mirror drawing: Off, Left and right, Top and bottom, Both ways (and the two Mirror line sliders) | Choice | Choice | there on both | The same component. |
| 56 | Tip: Square | Nothing | Round or Square button | pixel only | Vector Pen nib at low Roundness is the nearest. |
| 57 | Picture tip: your own picture | Stamp (Brush from selection makes one from outlines) | Picture, up to 32 by 32 (256 by 256 when soft), drawn on a grid, from a file or from a selection | there but different | Vector stamps are outline shapes; a pixel picture is cells with colour. |
| 58 | Picture tip: Its own colours | Nothing | Switch | pixel only | Vector stamps take the stroke colour only. |
| 59 | Picture tip: Draw a picture... / From a picture file... | Nothing | Two buttons (opens the tip editor) | pixel only | Vector has no editor for a stamp; it can only take a selection. |
| 60 | Edges: Sharp pixels / Smooth | Nothing | Choice | pixel only | By design: vectors are always smooth. |
| 61 | Hardness | Nothing | Slider | pixel only | A vector outline has no soft edge. A blur effect on the shape is the nearest. |
| 62 | Edge note and Make the edge smooth instead | Nothing | Note and button, when the layer keeps to a palette or Pixel perfect is on | pixel only | By design: it explains dithering, which vectors do not do. |
| 63 | Flow | Nothing | Slider | pixel only | The vector stroke has a colour and an opacity only. |
| 64 | Opacity | Nothing (the Pressure changes strength toggle for a pen) | Slider (the most any pixel can get in a stroke) | pixel only | Vector shapes keep one opacity per shape. A stroke cap is not the same thing. |
| 65 | Size follows | Pressure only, as the switch | A list: Nothing, Pen pressure, Pen tilt, Speed, Fading out, Random | pixel only | Vector points keep pressure only. They would need tilt, twist, speed and time per point. |
| 66 | Flow follows | Nothing | The same list | pixel only | Needs flow first. |
| 67 | Opacity follows | Nothing | The same list | pixel only | Needs a stroke opacity cap first. |
| 68 | Angle follows | Nothing | Nothing, Pressure, Tilt, Twist, Speed, Direction, Random | pixel only | Needs a tip with an angle that is not fixed. |
| 69 | Scatter follows | Nothing | The same list | pixel only | Needs per point scatter. |
| 70 | Mix toward the Fill colour follows | Nothing | Seven sources and Nothing | pixel only | Needs per point colour. |
| 71 | Amount / The other way round (each route) | Nothing | Slider and switch | pixel only | Goes with the routes. |
| 72 | Shape of the response (curve editor and 5 shapes) | Nothing | Curve editor with Even, Light touch, Firm hand, Soft ends, Ignore the lightest | pixel only | Goes with the routes. |
| 73 | Thin to a point at the ends: How thin / How faint the tip gets | Nothing | Two sliders | pixel only | Vector taper makes the line thinner only. |
| 74 | Fade length | Nothing | Slider, when a route uses Fading out | pixel only | Needs the fade source. |
| 75 | Dual tip (switch, Dot shape, Dot size, Use a picture for the dots, How many dots, Cut holes instead) | Nothing | Six controls, with Picture size and Use the light parts when a picture is used | pixel only | Vector has no second tip. |
| 76 | Second brush (Second brush width, spacing, scatter) | Nothing | Three sliders, when Dual tip is laid | pixel only | Vector has no second tip. |
| 77 | Hue wobble | Nothing | Slider | pixel only | A vector stroke has one colour. |
| 78 | Lightness wobble | Nothing | Slider | pixel only | A vector stroke has one colour. |
| 79 | Colourfulness wobble | Nothing | Slider | pixel only | A vector stroke has one colour. |
| 80 | Colour mixes toward the fill colour | Nothing | Source list | pixel only | A vector stroke has one colour. |
| 81 | Wet paint | Nothing | Slider | pixel only | Needs the pixels under the stroke. |
| 82 | How the paint joins what is there (18 blend modes) | Nothing (a layer has a blend mode, a shape does not) | Menu | pixel only | Shape blend mode is not in the model. |
| 83 | Builds up while you hold still (Airbrush) | Nothing | Switch, in the Airbrush tool | pixel only | Needs time per point. |
| 84 | Pressure (Chalk and charcoal) | Nothing | Slider, in the Chalk and charcoal tool | pixel only | Goes with the sticks. |
| 85 | Pixel perfect (plain Brush on a pixel layer) | Nothing | Switch | pixel only | By design: pixel art only. |
| 86 | Shape: Square / Round (plain Brush on a pixel layer, size over 2) | Nothing | Choice | pixel only | By design: pixel art only. |

### Per tool, the pixel tools that are not the Pixel brush

| Tool | Its Tool options, top to bottom |
|---|---|
| Soft brush | picker, Save as, Share, Size, Hardness, Flow, Mirror drawing, a note, Stabilizer, Stabilizer style |
| Airbrush | the same, plus Builds up while you hold still |
| Highlighter | the same as Soft brush |
| Chalk and charcoal | picker, Save as, Share, Medium (9), Paper (5), Size, Pressure, Edge, Mirror drawing, a note, Stabilizer, Stabilizer style |
| Brush (B) on a pixel layer | Size, Shape (over size 2), Pixel perfect, Brush from selection, a note, Stabilizer, Stabilizer style, Mirror drawing |

These panels are not counted row by row above; their controls are the Pixel brush's own Size, Hardness, Flow, Pressure, Edge and Medium, which come under the same vector gaps.

## Where the code and the app could disagree, and did not

- The vector Brush on a pixel layer really is the small panel (checked: Size, Pixel perfect, Brush from selection, Stabilizer, Mirror). `BrushOptions` picks `PixelBrushOptions` or `VectorBrushOptions` from the active layer; the saved brushes are only ever reached through the Pixel brush, Soft paint and Chalk and charcoal tools.
- Pick a vector brush (for example **Brush: Chalk**) while you are on a pixel layer: it fills `ui.brush` and nothing else happens. The pixel layer's Brush tool still draws at `pixelBrushSize`, 1 pixel. Checked in the app.
- Pick a pixel brush (for example **Brush: Round 6**) while you are on a vector layer: the tool changes to Pixel brush on a vector layer, which only hints "needs a pixel layer" when you draw. Checked in the app.
- Brush counts in the panels (62 and 53) match the starters in code. No saved or imported brushes in a fresh install.
- Sticks in the vector panel only show under the Chalk and Charcoal tips (checked with a Chalk tip).
