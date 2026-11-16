# Hello fix: every page, looked at

Taken with `scripts/e2e/hello-fit.cjs` in the built app under xvfb, then opened and looked at one by one.

- `stills/`: every page of the hello at 1280 x 720 and 1600 x 900, dark and light, interface size 100% (hello, what to make with three picked,
  colours, settings, last page). 20 pictures.
- `wide-scales/`: all pages in one sheet per size and theme at interface size 150% and 200%.
- `before-vs-after-1280x720-dark.jpg`: left is the hello before the first rework (first bubble cut off, a scrollbar on the colours page, card
  sentences running out of their cards), right is now.

hello-fit.cjs result: 1280 x 720 and 1600 x 900 at 100% and 150%, and 1600 x 900 at 200%: 0 problems.
1280 x 720 at 200% (the whole app is then 640 x 360 pixels): the page column scrolls on every page. Left as it is.
