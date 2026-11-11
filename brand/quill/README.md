# brand/quill (historical)

This is the generator Quill was first drawn with: ascii part grids (`quill-frames.mjs`, `quill-icons.mjs`) composed
into poses by `build.mjs`. **It is no longer the source.** The mascot now lives in `brand/mascot/mascot.frameling`
and `brand/mascot/mascot-icon.frameling`, edited in Frameling and built with `npm run build:mascot` (see the main
README, "Editing the mascot").

`build.mjs` no longer writes into the app. It writes its sheet to `b/quill.png` + `b/quill.json` and its icon grids
to `icons/`, which is what `brand/mascot/convert-from-quill.mjs` converted from once. `test/io/mascot-source.test.ts`
checks the `.frameling` files still build to exactly these pictures, but only while they are unedited (the file's
manifest still says it came from the converter). Once someone saves them from Frameling, that check steps aside and
the "committed files are up to date" checks are the ones that matter.
