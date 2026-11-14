Close drawing, in the real built app (real main process, so the native "Save changes?" question is the real one), dark and light.

close-drawing-dark.mp4 and close-drawing-light.mp4 (H.264, yuv420p, 1280x800, about 16 s, Show welcome turned off):
three strokes on a new drawing, **File > Close drawing**, the question ("This drawing hasn't been saved yet, so Save will
ask where to put it"), **Don't save**, and the start screen with the cards and Start from an example.

Made by `scripts/ab/close-drawing.cjs` (xvfb, ffmpeg x11grab, xdotool presses the native button).
