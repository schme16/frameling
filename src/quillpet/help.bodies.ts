// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'quill-pet': `**Quill** is the little hedgehog with coloured pencils for quills. Open **Quill's corner** and he has a panel of his own, where he potters about while you draw.

**Open it:** **View > Quill's corner**, or press the **Quill** button on the panel rail.

**Give him a stroke:** click him. He likes it, and the two of you get a touch closer.

**How he's feeling:** the line under him says what he's up to. He draws along while you're drawing, watches when you stop, dozes off when nothing's happened for a minute, and is proud of you when you finish something.

**His pencils:** the quills on his back take the colours you draw with, newest last. Press **Give him this colour** to hand him the one you're on. He keeps the last five, and any pencil you haven't given a colour to stays as the art drew it.

**His things:** they live in their own panel, [Quill's things](help:quill-things).

**How well you know each other:** the bar at the bottom. It fills as you two spend time making things, and it only ever goes up. **Just met**, then **Friends**, **Good friends**, **Best friends**, and **Inseparable** if you stick at it.

**Good to know:**
- He never minds being left alone. Come back after a week, a month or a year and he's pleased to see you. Nothing drains, nothing goes down, and he's never cross.
- Drawing is what he likes best, so you feed him by getting on with your work. There's nothing to remember to do.
- He keeps a picture of your drawing, not the drawing. Nothing you make depends on him, and giving something back never touches your file.
- Had enough of the panel? Turn **Quill's corner** off in **Preferences > Features** and he goes back to being just the mascot, saying hello and lending a hand where he always did.
- Had enough of Quill altogether? **Show Quill** in **Preferences** hides him everywhere, this panel included, and anything you actually need to read stays as a plain note.

help:quill-things help:quests help:preferences`,
  'quill-things': `The drawings you've given **Quill**, all in one place. He keeps a little picture of each one, about 72 pixels across, not the drawing itself, so nothing you make depends on him.

**Give him one:** press **Give him this** and he keeps the frame you're on. **View > Give this drawing to Quill** does the same from anywhere.

**Ask him about one:** press it, and he'll tell you what he thinks of it.

**Have it back:** the small **x** in its corner. He doesn't mind, and nothing happens to your drawing either way.

**Good to know:**
- He keeps the last 24. Give him a 25th and the oldest quietly makes room.
- His things are kept on this computer, with the rest of your settings, not in your file.
- Giving him a drawing is one of the things that brings you closer, so his collection and the bar in [his corner](help:quill-pet) grow together.

help:quill-pet`,
};
