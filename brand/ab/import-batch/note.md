# Bringing work in: a folder or zip of pictures, an SVG, a layered Photoshop or OpenRaster file

Every picture is in both themes (`-dark`, `-light`). "Before" is a build of the commit this branch started from; it has no way in for these files, so each is handed to the nearest thing it had (the picture reader). "After" is this branch. Made with `scripts/docs/ab-import/after.cjs` and `scripts/docs/ab-import-before/before.cjs` (see docs/testing.md).

## Where they are found

- `palette-import-before-*.png`, `palette-import-after-*.png`: the command palette searched for "import". After: **Pictures or a zip, as frames...**, **SVG or logo...** and the answer-once question about where things go are there (the same four commands are under File > Import).

## fn-image-sequence-import

- `sequence-dialog-before-*.png`: one picture of the run in the old picture dialog, the only way in; the other eleven are not part of it.
- `sequence-dialog-after-*.png`: twelve frames named run_1 to run_13 (run_7 is not there, run_13 is damaged, notes.txt came along). It says what it found before anything happens: 11 pictures, run_1 to run_12, all 96 x 72; what it left out (notes.txt, and run_13 which couldn't be read); that number 7 is missing so the animation skips. Frames per second, how long each picture is held, play backwards, and a player to watch it.

## fn-svg-import

- `svg-in-before-*.png`: the old app handed the SVG: "Frameling could not read that picture."
- `svg-in-after-*.png`: a three-layer badge (Background, Badge, Words) as vector shapes on layers, with gradients and the text kept as text. The toast says "6 shapes and 1 piece of text on 3 layers. 3 things couldn't be brought in." with a **See what was left out** button.
- `svg-left-out-after-*.png`: that button's list: the blur, the mask and the dashed ring, each named and counted, and under **Good to know** that text came in as text.
- `svg-broken-after-*.png`: a file with a tag that doesn't close. A plain sentence with the line, and the drawing is untouched.

## fn-psd-import

- `layered-in-before-*.png`: the old app handed the .psd: the same "could not read that picture".
- `layered-in-after-*.png`: a small scene opened as a new drawing: Title, Hero, Shadow (multiply, 60%) and the Scenery folder (Sky, Hills) in the Layers panel, as pixel layers. "5 layers in 1 group, 192 x 120. 2 things couldn't be brought in."
- `layered-left-out-after-*.png`: the list: the text layer ("came in as a picture of the words, so the text can't be edited") and the adjustment layer (Levels 1).
- `layered-broken-after-*.png`: a file cut short. "That Photoshop file ends too early: it is cut short or damaged." Nothing changes.
- `ora-in-after-*.png`: the same scene as an OpenRaster file, nothing left out.
