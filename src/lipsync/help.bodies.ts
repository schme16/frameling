// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'lip-sync': `Lip sync is matching a character's mouth to what they say. Frameling listens to the sound and does a first pass, then you tidy it up. Nothing is sent anywhere.

## What you need

1. **A mouth**: a symbol with a named frame for each mouth below. **File > New drawing...** and the **Lip sync mouth chart** card gives you a face with ten ready-made ones.
2. **A sound**, lined up where the talking starts. See [Sound](help:sound).

## The mouth chart (phoneme chart)

Animators use about ten mouths, because many sounds look alike:

- **Rest**: not talking.
- **A I**: wide open ("ah", "eye").
- **E**: smiling with teeth ("ee", "eh").
- **O**: a round mouth ("oh").
- **U**: small and pursed ("oo").
- **M B P**: lips pressed together.
- **F V**: top teeth on the bottom lip.
- **L**: tongue up behind the teeth ("l", "th").
- **W Q**: lips pushed out in a small circle.
- **etc**: everything else ("c", "d", "g", "k", "n", "r", "s", "t", "y", "z").

Frameling finds each mouth by the **name of its frame** ("M B P", "mbp" and "MBP" are the same). A missing shape uses the nearest one: no "W Q" uses "O", no "etc" uses "E".

## Auto lip sync

Press **Frames and motion > Sound and lip sync > Auto lip sync...** (or the panel's button). With more than one sound or mouth layer it asks which. It writes a key for each stretch of the same mouth, as **one undo step**.

It's a good first pass, not a perfect one. Frameling listens to loudness, where the energy sits (which tells vowels apart), hiss versus hum, and the quick dips that mean the lips closed. It all happens on your computer.

## Typing the words

If you know what is said, press **Frames and motion > Sound and lip sync > Auto lip sync with the words...** (or **With the words...** in the panel) and type it. Frameling lines the mouths up with your words, which helps when the recording is noisy or mumbled. Spell the words normally: Frameling knows how common English words sound, and reads numbers out ("42" is "forty two"). Frameling remembers the words for that sound until you close the app.

## Fixing it by hand

Open the **Lip sync** panel (View menu). It shows the mouth on each frame around the playhead as a strip.

1. Click a frame in the strip to go there.
2. Click a mouth button to put that mouth on the frame. Each button shows a little picture of the mouth, with its name underneath.

Turn on **Go to the next frame after each pick** to work along quickly.

## Tips

- Mouths stay on for at least two frames so they don't flicker.
- Running Auto lip sync again replaces only the frames under the sound.
- Closed lips (M B P) and whispers are the hardest. Typing the words helps most.
- Your own character? Draw each mouth on its own frame inside one symbol, then use **Name a symbol's frames** (in Frames and motion) to give them the chart names.`,
};
