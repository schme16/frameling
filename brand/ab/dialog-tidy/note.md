# dialog-tidy: before and after

Cropped from the real built app under xvfb, dark (Midnight sketchbook) and light (Paper and honey). A is `development` as it was, B is this branch.
Taken on the "Interface size" question, which is the first sheet a fresh install meets.

1. `1-the-sheet`: A: "Use the usual answers for everything" with no number. B: "Answer all 25 questions the usual way and stop asking", and a line saying every answer stays listed and the message after has an Undo.
2. `2-learn-more`: A: Learn more opens the help behind the dim question, so none of it can be read. B: the question steps aside, the help is in front, and a line at the top says the question is waiting (Esc, or Back to the question).
3. `3-escape-comes-back`: after Escape, the question is back with what you had picked (No thanks) and focus back on Learn more. Nothing was answered on the way.
4. `4-after-the-button`: the message after the button. A: no way back. B: how many it answered, and an Undo.
5. `5-closed-twice` (B only): the message you get the third time a question that was closed with Esc twice would have been asked.

Pictures are `<n>-<name>-dark.png` and `<n>-<name>-light.png`.
