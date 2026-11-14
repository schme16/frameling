// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'quill-pet': `**Quill** is the little hedgehog with coloured pencils for quills. He has one home in the right rail, and it's called **Quill** wherever you meet it: the tab, the **View** menu and the command palette.

**Open it:** **View > Quill**, or press the **Quill** button on the panel rail.

**What's in it, top to bottom:**
- **Him.** Click him for a scratch. He likes it, and the two of you get a touch closer. The line under him says what he's up to: he draws along while you draw, watches when you stop, [dozes off](help:quill-naps) when nothing's happened for a minute, and is proud of you when you finish something.
- **His pencils.** The quills on his back take the colours you draw with, newest last. Press **Give him this colour** to hand him the one you're on. He keeps the last five.
- **How well you know each other.** The bar fills as you two spend time making things, and it only ever goes up. **Just met**, then **Friends**, **Good friends**, **Best friends**, and **Inseparable** if you stick at it.
- **His shelves.** **From Quill** holds [the presents he makes you](help:quill-presents), and below it are [the drawings you give him](help:quill-things). Press **Give him this drawing** to add the frame you're on.
- **Lessons with Quill.** **Open Quests** takes you to the [Quests](help:quests) panel, which keeps its own tab because the list is long.

**Good to know:**
- He never minds being left alone. Come back after a week, a month or a year and he's pleased to see you. Nothing drains, nothing goes down, and he's never cross.
- Drawing is what he likes best, so you feed him by getting on with your work. There's nothing to remember to do.
- Nothing you make depends on him, and giving something back never touches your file.
- Had enough of the panel? Turn **Quill** off in **Preferences > Features** and he goes back to being just the mascot, saying hello and lending a hand where he always did.
- Had enough of Quill altogether? **Show Quill** in **Preferences** hides him everywhere, this panel included, and anything you actually need to read stays as a plain note.

help:quill-things help:quill-presents help:quill-naps help:quests help:preferences`,
  'quill-naps': `Leave Frameling alone for about a minute and **Quill** nods off, curled up with a little **Z** over his head. He's not bored, just resting.

**Waking him:** move the mouse or press any key. He doesn't jump up. He stirs, peeks out, sits up, gives a big yawning stretch, blinks, and settles back to his usual self. It takes a second or so and happens once.

**Good to know:**
- Any key or mouse move counts, so he wakes the moment you are back.
- With **Reduce motion** on, he skips the stretch and just goes back to idle.
- Hide him with **Show Quill** in **Preferences** and none of this shows.

help:quill-pet help:meet-quill`,
  'quill-things': `The drawings you've given **Quill**, on his shelves in the **Quill** tab, with **From Quill** above them for the things he's made you. He keeps a little picture of each one, about 72 pixels across, so nothing you make depends on him.

**Give him one:** press **Give him this drawing** and he keeps the frame you're on. **View > Give this drawing to Quill** does the same from anywhere.

**Ask him about one:** press it, and he'll tell you what he thinks of it.

**Have it back:** the small **x** in its corner. He doesn't mind, and nothing happens to your drawing either way.

**Good to know:**
- He keeps the last 24. Give him a 25th and the oldest quietly makes room.
- The newest three keep their shapes as well as their picture, so he has something to work from when he makes you [a present](help:quill-presents). A drawing too big to tuck away keeps its picture alone.
- What you give him is kept on this computer, with the rest of your settings, not in your file.
- Giving him a drawing is one of the things that brings you closer, so his collection and the bar at the top of the [Quill](help:quill-pet) tab grow together.

help:quill-pet help:quill-presents`,
  'quill-presents': `Now and then **Quill** takes one of the drawings you've given him, redraws it with a wobbly hand, and leaves it on his shelf for you. It opens as a drawing of your own, to carry on with however you like.

**Where they go:** **From Quill**, on his shelves in the [Quill](help:quill-pet) tab, above the [things you gave him](help:quill-things). One you haven't opened has a little dot on it.

**Open one:** press it. It opens as a new document called **<name> in crayon**, with your work asked about first if you have any unsaved.

**Let one go:** the small **x** in its corner, the same as the things you gave him.

**When he makes one:** he decides. When the two of you reach a new step of knowing each other, or when he's been given a few drawings and hasn't made you anything in a while. Never while you're drawing, and never more than one a day. The first time, he asks whether you'd like him to carry on; **Preferences > Behaviour** changes your mind any time.

**Good to know:**
- Nothing is generated and nothing leaves your computer. A crayon copy is your own shapes with every point nudged a little, the lines uneven and the colouring a touch outside the lines. It's arithmetic, not a machine inventing things.
- He works from the newest drawing of yours he still has the shapes of, which is one of the last three you gave him.
- A present is never a comment on your drawing, and he'll never offer to improve one.
- Pixel layers, tiles and bones aren't something he can hold a crayon to, so he works from the vector shapes.

help:quill-things help:quill-pet`,
};
