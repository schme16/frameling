# Artboards for animation: A/B

A (built, default): **Shots**. Each artboard is a mini document with its own layers, timeline and length, shown
side by side on the pasteboard and switched from the Artboards panel. "Play all in order" plays them back to back;
export one, some or all (each its own file, or joined into one video).

B (mock only): **Variations**. Artboards are camera-like crops of one shared set of layers and one timeline (16:9,
square, tall), for one animation delivered at several sizes.

- `a.png`, `b.png`, `ab.png`: the two side by side (Ball film demo, `__framelingArtboards.load('shots')` with ?debug).
- `ab.mp4`: A (fit all, then Play all in order) followed by the B mock playing with its three crops.
- `pixel-workflow.mp4`: the pixel art workflow (draw on any artboard, make one with the Artboard tool, move it,
  Alt+PageUp through them). Same clip as `public/help/artboards.mp4`.

Why A: it is the same model pixel artists need (a sprite per artboard, each with its own frames), so one feature
serves both; a story told in shots needs different lengths and layers per shot, which B can't give. B's use (one
animation, several sizes) is better served later by a "variations" option on export, or by the camera.
