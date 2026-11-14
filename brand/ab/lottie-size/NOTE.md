# Lottie "Pictures from effects": A / B / C

Explosion template, frame 10, drawn by lottie-web's canvas player at 2x the stage size and zoomed 3x (edges and glow).

- A, Sharpest: effect pictures as PNG at 2x the stage. File 1594 KB (before this work: 1594 KB).
- B, Balanced (the default): WebP quality 0.9 at 2x. File 1206 KB (-24%); the pictures alone 823 KB to 436 KB (-47%). Cannot be told from A.
- C, Smallest: WebP quality 0.8 at 1x the stage. File 905 KB (-43%); pictures alone 134 KB (-84%). Edges go soft on 2x screens.

Effects-heavy test document (moving Glow and Outline, 36 frames): 803 KB before; A 169 KB, B 133 KB, C 64 KB (the saving there is mostly pictures that repeat being stored once).

Pick with Export > Lottie > "Pictures from effects". To redo: `ONLY=tpl:explosion-fx AB=<dir> FRAME=9 xvfb-run -a npx electron scripts/e2e/lottie-bake.cjs`.
