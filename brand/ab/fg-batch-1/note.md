# fg-batch-1: before and after

Every pair is the same document, window size and steps, in the dark theme (Midnight sketchbook) and the light one (Paper and honey). Before is `development` at dceddb4; after is `wip/fg-batch-1`.

## Each artboard has its own speed (fg-artboard-fps)

- `speeds-before-*.png`: three blob sprites on a sheet. The Artboards panel says size and frames; there is no speed anywhere but the one shared number.
- `speeds-after-*.png`: the same sprites at 6, 12 and 24 fps. Once the speeds differ, each row names its own, and the artboard's **Speed** box sits under the list.

## Recolour can be limited (fg-recolour-scope)

- `recolour-before-*.png`: swapping the dark outline for blue always changes every layer and frame (1,364 pixels, 40 drawings, swatches too).
- `recolour-after-*.png`: the **Where** buttons (**Everything**, **This layer**, **This frame**, **The selection**) with **This layer** picked. Only Pip's outline changes (1,084 pixels, 20 drawings); the ground keeps its dark line. **The selection** is greyed because nothing is selected.

## Markers and clips stay out of symbols (fg-symbol-markers)

- `symbol-before-*.png`: inside a symbol, **Add a marker here** drops "Marker 1" on the scene at the symbol's frame 1.
- `symbol-after-*.png`: the Markers and Clips rows give way to one line saying why, and the command says the same in a message instead of adding anything.

Chose hiding over giving symbols their own markers: markers and clips are events for the exported scene (Godot, Interactives), and no exporter reads a symbol's, so symbol-level ones would be flags nothing fires. Named frames (`frameLabels`) already cover the symbol's own moments.
