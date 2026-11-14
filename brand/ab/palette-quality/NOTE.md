A is the colour picking before a0e18ee (widest-range median cut, `src/old-quantise.ts`, taken from git history). B is the
picking now (`src/pixel/quantise.ts`). Source: `scripts/docs/help/assets/scenery.png`. Each picture shows the picture,
then the old and new colours as a strip with the picture redrawn in only those colours. "Average miss" is the mean
distance from each pixel to its nearest picked colour (lower is closer). To redo it: dump the picture's RGBA bytes,
bundle `src/run.ts` with esbuild and run it for `picks.json`, then `python3 src/render.py <png> picks.json .`.
