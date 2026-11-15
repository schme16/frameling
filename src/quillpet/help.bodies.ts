// The words of the topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'quill-pet': `**Quill** is the little hedgehog with coloured pencils for quills. He has one house in the right rail, and it's called **Quill** wherever you meet it: the tab, the **View** menu and the command palette. The house has three tabs along the top: **Room**, **His things** and **Presents**.

**Open it:** **View > Quill**, or press the **Quill** button on the panel rail. It opens on the **Room**, and after that it stays on whichever tab you last chose. **View > Quill's house > Quill: his things** and **View > Quill's house > Quill: his presents** open it on those tabs.

**Room** is where he lives:
- **Him.** Click him for a scratch. He likes it, and the two of you get a touch closer. The line under him says what he's up to: he draws along while you draw, watches when you stop, [dozes off](help:quill-naps) when nothing's happened for a minute, and is proud of you when you finish something. In between he potters round his room: a wander, a doodle at his desk, a look out of the window, a snack, a nap. He only does it while you can see him, and with **Reduce motion** on he sits still.
- **His pencils.** The quills on his back take the colours you draw with, newest last. Press **Give him this colour** to hand him the one you're on. He keeps the last five.
- **How well you know each other.** The bar fills as you two spend time making things, and it only ever goes up. **Just met**, then **Friends**, **Good friends**, **Best friends**, and **Inseparable** if you stick at it.
- **Lessons with Quill.** **Open Quests** takes you to the [Quests](help:quests) panel, which keeps its own tab because the list is long.


**His things** holds [the drawings you give him](help:quill-things), with **Give him this drawing** to add the frame you're on.

**Presents** holds [the presents he makes you](help:quill-presents). When he has left one you haven't opened, a small dot shows on the **Presents** tab, so it's easy to spot from the **Room**.

**Good to know:**
- He never minds being left alone. Come back after a week or a year and he's pleased to see you. Nothing drains, he's never cross. [What he got up to](help:quill-lately).
- Drawing is what he likes best, so you feed him by getting on with your work. There's nothing to remember to do.
- There's only one of him. If a message, a lesson or the welcome wants him, he steps out of his room for a moment and comes back when it's done.
- Nothing you make depends on him, and giving something back never touches your file.
- Had enough of the panel? Turn **Quill** off in **Preferences > Features** and he goes back to being just the mascot, saying hello and lending a hand where he always did.
- Had enough of Quill altogether? **Show Quill** in **Preferences** hides him everywhere, this panel included, and anything you actually need to read stays as a plain note.

help:quill-things help:quill-presents help:quill-naps help:quests help:preferences`,
  'quill-lately': `Open Frameling and **Quill** may have been busy. His **Room** shows a short list called **What he got up to**: a drawing of his own, a toy of yours he moved somewhere new, a good look out of the window, his pencils put in a better order. Sometimes he is found fast asleep somewhere that isn't his bed, and a scratch wakes him.

**The longer you were out, the more there is.** A day or two gives you one thing, a week gives you a few, and a long time gives you the most, plus a rare find in his pocket. It never goes the other way: he is never worse off for being left, and he is never sad about it. He was fine. He was busy.

**What he remembers** is what you gave him and the date you gave it: press one of his things and he says it, like "on 3 March". He never counts how long you were out, and nothing in Frameling does either.

**Good to know:**
- It's only news. There is nothing to press, nothing to keep up and nothing you owe him.
- It shows the first time you open Frameling on a new day. If you open it again the same day, you get the same news.
- Turn it off in **Preferences > Behaviour** under **Quill gets up to things**. He still says hello.
- The **Show Quill** switch in **Preferences** hides him, and this, everywhere.

help:quill-pet help:quill-things help:preferences`,
  'quill-naps': `Leave Frameling alone for about a minute and **Quill** nods off, curled up with a little **Z** over his head. He's not bored, just resting.

**Waking him:** move the mouse or press any key. He doesn't jump up. He stirs, peeks out, sits up, gives a big yawning stretch, blinks, and settles back to his usual self. It takes a second or so and happens once.

**Good to know:**
- Any key or mouse move counts, so he wakes the moment you are back.
- With **Reduce motion** on, he skips the stretch and just goes back to idle.
- Hide him with **Show Quill** in **Preferences** and none of this shows.

help:quill-pet help:meet-quill`,
  'quill-things': `The drawings you've given **Quill**, on the **His things** tab of Quill's house. The presents he's made you have their own tab beside it. He keeps a little picture of each one, about 72 pixels across, so nothing you make depends on him.

**Find it:** **View > Quill's house > Quill: his things**, or the **His things** tab in the Quill panel.

**Give him one:** press **Give him this drawing** and he keeps the frame you're on. **View > Quill's house > Give this drawing to Quill** does the same from anywhere.

**Ask him about one:** press it, and he'll tell you what he thinks of it.

**Have it back:** the small **x** in its corner. He doesn't mind, and nothing happens to your drawing either way.

**Good to know:**
- He keeps the last 24. Give him a 25th and the oldest quietly makes room.
- The newest three keep their shapes as well as their picture, so he has something to work from when he makes you [a present](help:quill-presents). A drawing too big to tuck away keeps its picture alone.
- What you give him is kept on this computer, with the rest of your settings, not in your file.
- Giving him a drawing is one of the things that brings you closer, so his collection and the bar on the [Room](help:quill-pet) tab grow together.

help:quill-pet help:quill-presents`,
  'quill-presents': `Now and then **Quill** takes one of the drawings you've given him, redraws it with a wobbly hand, and leaves it for you on the Presents tab. It opens as a drawing of your own, to carry on with however you like.

**Where they go:** the **Presents** tab of [Quill's house](help:quill-pet), or **View > Quill's house > Quill: his presents**. One you haven't opened has a little dot on it, and the **Presents** tab shows a dot too, so you can see it from the other tabs. The [things you gave him](help:quill-things) have their own tab.

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
