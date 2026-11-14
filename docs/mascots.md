# Mascots

Quill is the only mascot for now, but the app no longer reaches for him by name. It asks a registry for the current
mascot, so a second one is an entry and a drawing rather than a hunt through the code.

## What a mascot is

One entry in `src/ui/mascot/mascots.json`, read by the app (`mascots.ts`) and by the build (`scripts/build-mascot.mjs`):

| Part | Where | Notes |
|---|---|---|
| Identity | `id`, `name`, `blurb` | `id` is what the `mascot` preference stores. |
| The drawing | `source` (a `.frameling` file in `brand/`) | One animation each: an artboard of its own (Quill's, one stack of layers shared by every artboard), or a clip on one timeline. Both build the same way, in the artboard order or the clip order, and an artboard with one clip across all of it is named after the artboard. |
| The sprite sheet | `sheet` and `meta`, served from `public/` | Made from `source` by `npm run build:mascot`. Never edited by hand. |
| The pencils | `pencils` (optional) | The coloured parts the pet repaints with your colours. No pencils, no repainting. |
| His words | `lines` on the registered mascot (optional) | Overrides by line id. A line he doesn't have falls back to the standard one in `lines.json`. |
| The app icon | `appIcon` (optional, one mascot only) | The icon and logo belong to the app, not to whoever is showing, so they stay Quill's. |

Not part of a mascot, because they are the pet's and work through the clips below: moods, closeness, gifts, the pet
panel. They look the same whoever is showing.

## The clip contract

The app asks a mascot for clips by name. `CLIPS` in `src/ui/mascot/timing.ts` is the list, and `QuillAnim` is derived
from it, so a misspelt name fails the type check.

| Clip | Loops | When the app asks for it |
|---|---|---|
| `idle` | yes | Standing about. Also the stand-in for any clip a sheet lacks. |
| `sleep` | yes | Nothing touched for a minute. Replaces `idle` while bored. |
| `wake` | no | Waking up, then back to `idle`. |
| `wave` | any | Hello, and the welcome. |
| `talk` | any | A bubble is up. |
| `point` | any | A quest step is pointing at something. |
| `cheer` | any | A step done, a quest finished, a welcome back. |
| `think` | any | A hint, or something is being worked out. |
| `draw` | any | The pet, while you are drawing. |
| `oops` | any | A warning or an error. |
| `sad` | any | Being switched off, before the goodbye. |
| `wave-sad` | any | The goodbye wave. |
| `dazed` | any | The crash offer, after the app closed badly. |

`sheetProblems` (in `timing.ts`) is the check: every clip present, `idle` and `sleep` looping. A mascot that fails it
stops `npm run build:mascot`, and `test/ui/mascots.test.ts` fails for every mascot in the manifest whose built sheet
breaks the contract, whose frames fall outside the picture, or whose source file is missing. Adding a clip to `CLIPS`
means every mascot has to draw it.

The sheet builder (`scripts/mascot/sheet.ts`, `docToSheet`) draws the way the canvas does for what a pixel sheet can
hold: a layer's opacity and blend mode, a folder's opacity and blend mode (a fading folder is drawn as one picture and
then faded, so its layers don't show through each other), hidden folders left out, and a key's offset (a part nudged
without redrawing it; the same drawing in two places is two tiles). Effects, clipping and masks are not applied, and the
build says so for any layer that has them. `npm run build:mascot` and `node brand/mascot/mascot.mjs check` fail if a
frame of the sheet that ships differs from what the file builds. Blend maths for plain bytes is `src/effects/blendPure.ts`.

## Adding a mascot

1. Draw the source as a Frameling file with all the clips above, under `brand/<name>/`.
2. Add an entry to `mascots.json`. Leave `appIcon` out.
3. `npm run build:mascot`, then `npm test`. Both say in plain words which clip is missing.
4. Give him his own `lines` if he talks differently, and add a help topic for the picker (see below).

## Choosing

The choice is the `mascot` preference. Anything unknown (a mascot that was removed, a damaged file) means the
standard one. The picker, `MascotRow` in `PrefsModal.tsx`, draws nothing while there is only one mascot, because a
setting with one option looks broken. It appears by itself when the second is in the manifest. Switching reloads the
sheet and the pet repaints the new one's pencils, with no restart.

Still to do when the second one arrives: a help topic with pictures for the picker, and the places that spell the
name "Quill" in plain words (the Show Quill switch, the About box, a few menu and command names) following
`currentMascot().name`. They are left alone now so nothing changes for anyone.
