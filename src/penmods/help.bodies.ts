// The words of the topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'pen-modifiers': `A **pen modifier** changes how your brush behaves for a little while. Say a viewer spends their Channel Points: your lines start to wobble, or come out thin. You laugh, you draw on, and after a bit it all goes back to normal.

## What they are
- **Steady hand**: lots of smoothing, so lines come out calm. A kind one.
- **Shaky hand**: a tremor, as if you'd had too much coffee.
- **Thin brush**: every line about a third of the size.
- **Fat brush**: every line two and a half times the size.
- **Long rope**: the brush trails far behind your hand, so curves come out big and swooping.

## It's off until you allow it
These change the lines you go on to draw, and those lines are yours to keep. So they sit behind the same switch as the dares that reach your drawing: **Let the audience interrupt your drawing** (Preferences > Features, under Audience features). It starts **off**, and while it is off your audience can't set any of these off.

## You always know
A chip at the top right of the window names the modifier, says what it is doing (*Your lines wobble.*), counts down the seconds and has a **Put it back** button.

## Your lines are normal lines
Every line you draw while one is on is a normal line and a normal step, so **Undo** takes it back like any other. The modifier isn't an edit, it's only how the brush behaves for a while, so there's nothing of it to undo. Lines from before and after are never touched.

## It puts everything back
Your own size and smoothing settings are **never changed**. The modifier sits over them and lifts off when it ends, so everything is exactly as you left it, even a setting you changed meanwhile. Only one goes at a time; a new one takes over from the old one.

## You're in charge
- **See the list:** Preferences > Features > **Pen modifiers**, with a switch for each. Or ask the palette: **What the audience can do to your pen**.
- **Try one yourself:** **Try it**, or *Try the pen modifier* in the palette. It works even with audience features off.
- **End it:** **Put it back** on the chip, or **Put my pen back** in the palette. **Stop** (Ctrl+Alt+K) ends everything from the audience.
- **How long:** about 30 seconds, set by **How long a dare lasts** in Preferences > Behaviour. Shaky hand and Long rope last two thirds of that.

See [Audience features and the On air pill](help:audience) and [Dares](help:dares) for the limits.`,
};
