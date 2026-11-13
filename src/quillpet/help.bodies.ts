// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'quill-pet': `**Quill** is the little hedgehog with coloured pencils for quills. Open **Quill's corner** and he has a panel of his own, where he potters about while you draw.

**Open it:** **View > Quill's corner**, or press the **Quill** button on the panel rail.

**Give him a stroke:** click him. He likes it, and the two of you get a touch closer.

**How he's feeling:** the line under him says what he's up to. He draws along while you're drawing, watches when you stop, dozes off when nothing's happened for a minute, and is proud of you when you finish something.

**His pencils:** the quills on his back take the colours you draw with, newest last. Press **Give him this colour** to hand him the one you're on. He keeps the last five, and any pencil you haven't given a colour to stays as the art drew it.

**His things:** they live in their own panel, [Quill's things](help:quill-things), along with [the presents he makes you](help:quill-presents).

**How well you know each other:** the bar at the bottom. It fills as you two spend time making things, and it only ever goes up. **Just met**, then **Friends**, **Good friends**, **Best friends**, and **Inseparable** if you stick at it.

**Good to know:**
- He never minds being left alone. Come back after a week, a month or a year and he's pleased to see you. Nothing drains, nothing goes down, and he's never cross.
- Drawing is what he likes best, so you feed him by getting on with your work. There's nothing to remember to do.
- Nothing you make depends on him, and giving something back never touches your file. He keeps a little picture of each thing, and the shapes of the newest few, which is what lets him make you [a present](help:quill-presents).
- Had enough of the panel? Turn **Quill's corner** off in **Preferences > Features** and he goes back to being just the mascot, saying hello and lending a hand where he always did.
- Had enough of Quill altogether? **Show Quill** in **Preferences** hides him everywhere, this panel included, and anything you actually need to read stays as a plain note.

help:quill-things help:quill-presents help:quests help:preferences`,
  'quill-things': `The drawings you've given **Quill**, all in one place, with **From Quill** at the top for the things he's made you. He keeps a little picture of each one, about 72 pixels across, so nothing you make depends on him.

**Give him one:** press **Give him this** and he keeps the frame you're on. **View > Give this drawing to Quill** does the same from anywhere.

**Ask him about one:** press it, and he'll tell you what he thinks of it.

**Have it back:** the small **x** in its corner. He doesn't mind, and nothing happens to your drawing either way.

**Good to know:**
- He keeps the last 24. Give him a 25th and the oldest quietly makes room.
- The newest three keep their shapes as well as their picture, so he has something to work from when he makes you [a present](help:quill-presents). A drawing too big to tuck away keeps its picture alone.
- His things are kept on this computer, with the rest of your settings, not in your file.
- Giving him a drawing is one of the things that brings you closer, so his collection and the bar in [his corner](help:quill-pet) grow together.

help:quill-pet help:quill-presents`,
  'quill-presents': `Now and then **Quill** takes one of the drawings you've given him, redraws it with a wobbly hand, and leaves it on his shelf for you. It opens as a drawing of your own, to carry on with however you like.

**Where they go:** **From Quill**, at the top of [Quill's things](help:quill-things). One you haven't opened has a little dot on it.

**Open one:** press it. It opens as a new document called **<name> in crayon**, with your work asked about first if you have any unsaved.

**Let one go:** the small **x** in its corner, the same as his other things.

**When he makes one:** he decides. When the two of you reach a new step of knowing each other, or when he's been given a few drawings and hasn't made you anything in a while. Never while you're drawing, and never more than one a day. The first time, he asks whether you'd like him to carry on; **Preferences > Behaviour** changes your mind any time.

**Good to know:**
- Nothing is generated and nothing leaves your computer. A crayon copy is your own shapes with every point nudged a little, the lines uneven and the colouring a touch outside the lines. It's arithmetic, not a machine inventing things.
- He works from the newest drawing of yours he still has the shapes of, which is one of the last three you gave him.
- A present is never a comment on your drawing, and he'll never offer to improve one.
- Pixel layers, tiles and bones aren't something he can hold a crayon to, so he works from the vector shapes.

help:quill-things help:quill-pet`,
};
