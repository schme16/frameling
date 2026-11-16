# Hello, Quill's home and the Great work card: before and after

Everything at 1280 x 720, dark theme, taken in the built app under xvfb with `scripts/docs/record.cjs`
(the `*.steps.json` files here are the exact steps, so either side can be taken again).

## The hello (ux-hello-shorter, ux-tuck-away-what-you-did-not-pick)

- `hello-before.mp4` (20 s) and `hello-after.mp4` (18 s): the whole hello walked through, picking Sketches and cartoons and Game sprites.
  H.264, yuv420p, 1280 x 694 (the window's content area). Before is six steps; after is five.
- `before-*.png` and `after-*.png`: the same steps as stills (page one, colours, settings, last page).
- Page one after: a plain list, no card shapes, and all six of Quill's bubbles sit inside the space with his tail showing.
  In the before clip the first bubble is cut off at the top and the five cards look pickable but are not.
- The settings step after holds Look, Sounds and Show Quill only. Units, Mouse wheel and Reduce motion are gone from it.
- The name is asked on the last page (All set!), next to a switch, **Tuck away what you didn't pick**, that says which areas it would put away.

## The right rail (ux-quill-one-home)

- `rail-before.png`: the Quill tab, and the separate tab called His things whose panel is titled Quill's things.
- `rail-after.png`: one tab called Quill, top and scrolled down to his shelves (From Quill, Yours that he keeps) and the way to Quests.

## The Great work card (quest-did-words)

- `card-before.png`: the card counts the step off ("That's step 1 of 4 done.").
- `card-after.png`: the same card, with Quill's draft words for that step ("You drew something! Look at it sitting there, full of possibilities.").
  The words are drafts for Shane to edit: `quests.did.*` in `src/ui/mascot/lines.json`.
