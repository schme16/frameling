Layer masks, as they work now. Clips (H.264, yuv420p): layer-masks-dark.mp4 and layer-masks-light.mp4, about 12 seconds, one held frame of the Bouncing ball.

What the clip shows, in order: the Ball layer; **Add a mask** (one press) puts a purple mask layer above it and picks it, so the Ball vanishes and shows faintly where it is hidden; the Ellipse tool paints on the mask and the Ball shows through the circle (the purple wash is the painted part); **Switch between the mask and its layer** picks the Ball; the mask switch on the mask's row turns the mask off (the whole Ball shows) and on again, with the drawing kept.

Stills: export-vs-screen-dark.png and export-vs-screen-light.png, the same frame twice. Left is the canvas as the Ball layer sees it (no mask wash, since the mask isn't the layer being painted), right is that frame exported as a PNG by the real exporter. They agree.

Made by scripts/ab/layer-masks.cjs (npm run build first, then run it inside xvfb).
