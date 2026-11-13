# Feature review: shots

Each picture is cropped from a real run of the built app under xvfb, dark theme, same document and window for both sides.

- `fill-vector-vs-pixel.png`: A, the paint bucket on a vector layer with **Use lines from all layers**, fills inside the ellipse drawn on another layer. B, the same click on a pixel layer floods the whole layer, because the bucket only sees its own layer (task fg-pixel-bucket-layers).
- `mirror-vector-vs-pixel.png`: A, the same stroke with **Mirror drawing** on, on a vector layer: one stroke. B, on a pixel layer: the stroke and its reflection with the centre line (fg-vector-mirror).
- `tool-rail-vector-vs-pixel.png`: the tool rail on a vector layer and on a pixel layer. Text, Gradient, Edit points and Shape hints disappear with no reason (fg-pixel-text-gradient).
- `numbers-shape-vs-symbol.png`: A, a plain shape selected, no X, Y or size boxes. B, a symbol selected, with X, Y, width, height, turn and slant (fg-numbers-for-shapes).
- `symbol-markers-lane.png`: inside an open symbol the Markers and Clips lanes are the scene's, and the marker added there sits on the scene (fg-symbol-markers).
