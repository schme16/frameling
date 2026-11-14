# Words stay on one line

Every pair is **before** then **after**, right side at its smallest (200 px) on a 1280 laptop, shot in both themes
(`-dark` and `-light`). The check that found them all is `scripts/e2e/no-wrap.cjs` (see docs/testing.md).

- **each-new-pick**: the picture you sent. **Starts afresh**, **Adds** and **Takes away** each broke in two and the three
  buttons were different heights. Now the words stay whole and, with no room side by side, the three stack one per line.
  Answer used: stack one per line on purpose.
- **effects-tiles**: **Colour adjust** broke in two inside its tile. The tiles are whole buttons now and flow onto the next
  line when the panel is narrow. Answer used: the row flows onto more lines.
- **recolour-button**: **Recolour the whole animation...** broke in two. In a narrow panel it reads **Recolour all...** (the
  tooltip and the screen reader still say the whole name); at the usual width it keeps the whole name. Answer used: shorter words.
- **mirror-drawing**: the two-by-two grid cut **Left and right** and **Both ways** off at the edge. Now one per line when
  two columns will not fit. Answer used: stack one per line on purpose.
- **preview-frame-line**: the line under the Preview's buttons wrapped onto a second row, so the panel grew as the frame
  went from 9 to 10 to 100. Now it is one line with an ellipsis, the frame number has room for the widest number the
  drawing reaches, and when tight the extras go in this order: "Following the timeline", the name and clip, the size, the speed;
  the frame number stays. The picture shows frame 8 of 150. Answer used: cut with an ellipsis.

Numbers from the check (five passes: 1280 with the right side smallest and usual, interface 150% and 200%, and 1920):
before 118 controls broke their words or stuck out (29 once the cards and help-topic rows, which are meant to wrap, are
set aside) plus 1 jumping panel; after 0 and 0.
