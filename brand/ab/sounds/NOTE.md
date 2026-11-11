# Sounds

`sounds.mp4` (H.264 + AAC): every cue once, in order, with its name on screen, at about the default volume. Not an
A/B: listen and say which ones to change. All are synthesised by `src/ui/sounds/synth.ts` (no sampled or licensed
audio), and the Try button in Preferences > General plays the same set.

1. Quest step done: two-note ting (E5, A5).
2. Quest finished: rising C major arpeggio with a soft sparkle on top.
3. Export finished: calm open fifth (G4 then D5 + G5).
4. Can't do that: two low soft notes sliding down a touch (refusal and error messages).
5. Nothing left to undo: one wooden tock that drops in pitch.
6. Frame step: a tiny paper flick, shown as six steps in a row (rate-limited to one per 70 ms, silent while playing
   and under reduce motion).
7. Quill's goodbye: E5, C5, A4, the last note drooping a little. Sad but gentle.

Sounds stay off by default. The volume slider appears once they're on.
