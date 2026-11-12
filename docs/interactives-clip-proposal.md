# Proposal for the Interactives player: clips that play another way

Status: written by Frameling's side, nothing in the Interactives repos was changed. Read from
`interactives-player/src/frameling.ts` (`cleanManifest`, `clipRange`, `advanceAnimation`).

## Where it stands

The player's clip is `{name, start, end, loop}` and plays start to end forward, looping or once. Frameling clips can also
play backward, back and forth, or a set number of times. Frameling now **bakes** those into the `.flplay` so the
unchanged player shows them right (checked by running the real `cleanManifest`, `cellFor` and `advanceAnimation` on a
built package: a back-and-forth clip played twice shows 1 2 3 2 1, then holds):

- The frames of such a clip, in play order (one trip round for a clip that loops, every pass for N times, up to 5000
  frames), are appended to `frames`, and the clip's `start`, `end` and `runs` point at them.
- Markers inside the clip are repeated where its frames show again.
- New optional manifest field `documentFrames`: how many frames the document itself has. The package version stays 1
  and older players ignore the field.

## What is not right yet (needs a small player change)

1. **A layer with no clip chosen plays every frame** (`clipRange` with no name is `0 .. frameCount-1`), so it now runs
   on into the baked passes after the document frames. Fix: when `documentFrames` is present, use it instead of
   `frameCount` for that whole-animation range (`clipRange`, `cleanManifest`'s `frameCount`). One line, safe for old files.
2. Script and UI lists show a marker name once per time it is played, so a back-and-forth clip lists its footstep twice.
   That is arguably correct; no change needed unless you want them de-duplicated.

## Optional, instead of baking

Reading `direction` (`forward`, `reverse`, `pingpong`, `pingpong-reverse`) and `repeat` (number of passes, loops win) on
each clip, with the order defined by Frameling's `src/core/clipPlay.ts` (`directedPosition`), would keep files small for
big repeat counts and let a layer override them. It needs `advanceAnimation`, `msToEnd`, `copyFrame`, the marker sweep
and `ends` to count passes by direction, which is a larger change than item 1. Frameling would then stop baking and
write the two fields (the flow states already carry `direction` and `repeat`, which the player does not read today).
Do item 1 first; this only matters if 5000-frame bakes or huge repeats turn out to bite.
