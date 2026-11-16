# Lip sync on a real voice: before and after

`lipsync-real-before-after.mp4` is one of the user's own recordings ("Pop the bubble, Mabel, and pass the pepper.",
normal and then faster), with their voice on it so you can judge the mouths by ear as well as by eye. It is their voice,
published with their say-so.

Four mouths side by side, each with a strip of the frames around the playhead:

- **Said (estimated)**: the mouths an espeak reading of the sentence has, stretched to fit the recording. It is good to a
  few frames, not exact, so a red dot under a strip is "differs from the estimate", not proof of a mistake.
- **Before**: the classifier as it was (trained on synthetic voices only).
- **After**: the retrained classifier. It is scored by a model that never heard this sentence (cross-validation fold 3),
  so this is not the clip it was fitted to.
- **After + words**: the same, with the sentence typed in.

Frame match with the estimate on this clip: before 65%, after 73%, after with words 73%. Across all 30 clips (held out,
mouth shape on spoken frames): 42% before, 47% after, and 49% to 58% when the words are typed.

`lipsync-real-before-after-still.png` is one frame of it.
