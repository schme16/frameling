# Fewer questions

The same first-hour run, driven in the built app under xvfb (`first-hour-steps.json`, run with `scripts/docs/record.cjs`): draw a stroke, press N, then = and - twice on the timeline, then start a pixel sprite. Every sheet that opens is answered with OK, as a person would. Before is `bf844ae` (development), after is this branch.

| | Sheets | Which |
|---|---|---|
| Before | 5 | New drawing (N), Adding or removing a frame, Empty frames at the end, Workspace follows the drawing, Coming from Aseprite? |
| After | 1 | Coming from Aseprite? (Quill's offer, which stays a sheet) |

The four that went are now a little message at the bottom with a **Change** button: "Started a blank drawing.", "Took the empty frames off the end.", "Switched workspace to match your drawing." The frame sheet is gone because there is one layer, so nothing is said at all.

- `before-dark-first-hour.png`, `before-light-first-hour.png`: the eight steps side by side, sheets open in steps 1, 2, 3, 6 and 7. The banner on the last frame counts them.
- `after-dark-first-hour.png`, `after-light-first-hour.png`: the same steps. Only step 6 and 7 have a sheet, and it now carries **Use the usual answers for everything**.
- `before-*-total.png`, `after-*-total.png`: the last frame of each run with its count.
- `after-*-toast-after-N.png`, `after-*-toasts-after-minus.png`: the messages.
- `after-*-change-button-opens-the-sheet.png`: pressing **Change** on "Started a blank drawing." opens the same question, already on the answer that was used. Picking the other one undoes the drawing and starts a copy instead.

Dark is Midnight sketchbook, light is Paper and honey; nothing else differs between a pair.
