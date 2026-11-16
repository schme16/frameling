# A question's options wrap again

The one no-wrap rule in `src/renderer/theme.css` catches `[role='radio']`, and an option in a question is a button
with that role, so each option's detail ran off the right edge of the dialog instead of wrapping.

- **before-dark**: "Changed your mind? U" and "the one you ha" run off the edge.
- **after-dark**: the detail wraps onto as many lines as it takes and the dialog grows to fit.

Fixed with `data-wraps` on the option and `min-width: 0` on its text. Four questions are in
`scripts/e2e/no-wrap.cjs` now, and the harness can pop any question by id with
`window.__frameling.choices.ask('<id>')`.
