The stream overlay over a drawing, one clip per drawing: a light day scene and a dark night scene, each 26 seconds, 1280x720 plus a caption strip, H.264 yuv420p.

Made with `scripts/e2e/overlay-clip.cjs` under xvfb: the real app with its real actions door, and the overlay page loaded the way OBS loads a browser source (a transparent offscreen window pointed at the overlay address). Its see-through frames are laid over a still of the drawing by ffmpeg, so what you see is what OBS composes. The audience acts through the real gate.

In order: nothing happening (empty, see-through), a challenge banner with its bar, a "Greyscale view" dare as a chip with its seconds, Quill cheering with what he says, a prompt pulled from the jar and put up with "Show on stream", a countdown and Quill having a snack, then each piece going by itself and the prompt taken off. The overlay wears the app's theme, so the cards are light on the day scene and dark on the night scene.

Stills: `overlay-over-<drawing>-drawing.png`, a moment with the banner gone but the chip, countdown, Quill and prompt all showing.
