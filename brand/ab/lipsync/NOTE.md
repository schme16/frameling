# Lip sync: before and after

`lipsync-before-after.mp4` (H.264 with AAC sound, 1280x520, 24 fps, 6 s, still: `lipsync-before-after-still.png`). Four talking mouths
play the same two spoken lines (neither was used to train anything):

1. Said: the true mouths, from the speech synthesiser's own phoneme timing.
2. Before: the old guesser (loudness, hiss and a rough vowel peak, per frame).
3. After: the new one (10 ms listening steps, resonances by linear prediction, voicing, a small classifier, steady smoothing).
4. After + words: the same, with the line typed in (Animate > Auto lip sync with the words...).

Under each mouth is a strip of the mouth on the 13 frames around the playhead; a red mark under a cell means that frame
differs from what was said. On this clip: before 39% of frames right, after 76%, after with the words 80%.

Held-out reference set (32 clips, 4 sentences the model never saw): frame accuracy 35% before, 82% after (74% in noise).
See scripts/lipsync/eval.mjs; rebuild this clip with scripts/lipsync/ab_data.mjs and ab_clip.py.
