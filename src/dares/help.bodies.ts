// The words of the topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  dares: `A **dare** is a small thing your audience can set off while you draw. Say a viewer spends their Channel Points: your view flips, or a banner drops down saying *draw with your other hand*. You laugh, you draw on, and a little later it all goes back.

**Dares are part of audience features.** They only come in while the yellow **Audience participation: on** pill is up (Preferences > Streaming > Audience features), and **Stop** (Ctrl+Alt+K) ends them all at once.

## The dares that only change the screen
These work for everyone. They never touch your drawing or your file.
- **Flip the view**: the screen is mirrored left to right.
- **Slowly spin the view**: the page turns one slow circle.
- **Shake the screen**: the drawing area shakes for a few seconds. Skipped if you have **Reduce motion** on.
- **Go greyscale**: the colour drains out of the drawing area. Your colours are not changed.
- **Zoom in somewhere**: close up on a spot, then back to exactly where you were.
- **Show a challenge banner**: a banner across the top with a small challenge. It is honour system, Frameling cannot make you.
- **Start a countdown**: a big countdown. At zero it says *Time!*

**Words from chat are your call.** A banner or a countdown can carry words somebody typed, and those never just appear. You are asked first, with the words covered until you press **Read it**, then **Put it up** or **Not that one**. Say nothing for 15 seconds and the answer is no. A challenge of Frameling's own goes straight up, since nobody wrote it at you.

## They always put it back
Only one dare that changes the view goes at a time, and a new one takes over from the old one, so they never pile up. When one ends, the view is exactly as it was. The chip at the bottom of the window says what is going on and has a **Put it back** button, so you can end one early.

## You are in charge
- **See the list.** Preferences > Streaming > **Audience dares** lists every dare, so you know what you signed up for. Or ask the palette: **What the audience can dare**.
- **Switch one off.** Each dare has its own switch. A dare you switch off is turned away, dropped from the queue and stopped if it is going.
- **Try one yourself.** **Try it** (or *Try the dare* in the palette and the Audience menu) fires one at you so you can see it. It does not need audience features on.
- **How long.** A dare that lasts for a while lasts about 30 seconds. Change it in Preferences > Streaming (**How long a dare lasts**): short, normal or long.

There are limits too: a cooldown for each kind of dare, a limit on how many can start in a minute, and a short queue. See [Audience features and the pill](help:audience).

Some dares reach your drawing. Those have their own topic, and their own switch: [Dares that reach your drawing](help:dares-drawing).`,
  'dares-drawing': `Some dares go further than the screen: they put something into your drawing. That is fun, and it can also be a surprise in the middle of a stroke, so it is **off until you turn it on**.

## The switch
**Let the audience interrupt your drawing** is in Preferences > Streaming, under Audience features. It starts **off**. While it is off, every dare in this list is turned away, and your audience is told only that it is not available. Turn it on and they can run, one at a time, with a cooldown between them.

Prefer to keep your drawing to yourself? Leave it off. Everything on the [other dares](help:dares) still works.

## What they do
All of these add or nudge. None of them delete, clear, flatten or wipe anything.
- **Googly eyes**: a pair of googly eyes lands somewhere on the drawing.
- **Drop in a shape**: a star, a heart, a blob or a triangle, in a bright colour.
- **Paint splat**: a splat of bright paint, a little see-through.
- **Jelly wobble**: the lines on your current layer ripple a tiny bit, like jelly. They stay smooth, and nothing moves further than about one and a half per cent of the page.
- **Budge the drawing**: the drawing on your current layer slides a little way. It is only moved, not redrawn.
- **Colour roulette**: the colour you draw with changes to a random one for a while, then goes back (unless you picked another in the meantime).

The first three go on a **new layer of their own** on top, so they never land among your work. Wobble and budge skip a layer that is locked or hidden, and say so if there is nothing to move.

## One Undo
Every one of these is a single step. Press **Undo** and it is gone, the same as any other change. To clear a gift for good, just delete its layer. Colour roulette changes only the colour in your hand, so there is nothing to undo: it ends by itself, or press **Put it back**.

There is also a cap: no more than six audience layers at a time. After that, extra gifts wait.

## In control
Each dare has its own switch in Preferences > Streaming > **Audience dares**, so you can keep the ones you like. **Stop** (Ctrl+Alt+K) stops everything at once, and **Try it** fires one at yourself so you can see what it does before your audience does.`,
};
