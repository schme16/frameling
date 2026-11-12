# Timeline header at 1280: A/B

`ab.png`: the timeline header at 1280 and 1400 pixel wide windows (the timeline panel is about 808 and 928 px wide there), at twice the pixel density.

A (built, the default): the everyday buttons stay on the header at both sizes, as icons with tooltips (new drawing, copy, add and remove a frame, hold, onion skin). The rarely used ones (ping-pong, add a sound, clean timeline, fit to view) go into the ... menu, which lists only what is folded away. The header is the same with or without a play range chip, so buttons don't jump.
B: every button stays on the header while it fits. It fits at 1280 with nothing showing, but a play range chip pushes the zoom off the end (clipped), so B still needs the menu and the buttons would jump in and out when a chip appears.

Check it yourself: `npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/timeline-header.cjs`.
