import type { HelpTopic } from '../core/registry';

export const lipsyncHelp: HelpTopic[] = [
  {
    id: 'lip-sync',
    title: 'Lip sync: making a character talk',
    section: 'Sound',
    media: 'lip-sync.mp4',
    summary: 'Frameling listens to a sound and puts the right mouth on every frame. You can fix any mouth by hand.',
    keywords: ['lip sync', 'words', 'script', 'transcript', 'lipsync', 'mouth', 'talking', 'speech', 'phoneme', 'viseme', 'mouth chart', 'phoneme chart', 'dialogue', 'auto', 'speak'],
    body: `Lip sync is matching a character's mouth to what they say. Frameling listens to the sound and does a first pass, then you tidy it up. Nothing is sent anywhere.

## What you need

1. **A mouth**: a symbol with a named frame for each mouth below. **File > New** and the **Lip sync mouth chart** card gives you a face with ten ready-made ones.
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

Press **Animate > Auto lip sync...** (or the button in the Lip sync panel). With more than one sound or mouth layer it asks which. It writes a key for each stretch of the same mouth, as **one undo step**.

It's a good first pass, not a perfect one. Frameling listens to how loud the sound is, where its energy sits (which tells the vowels apart), whether it is hissy or humming, and the quick dips that mean the lips closed. It all happens on your computer. Fix the rest by hand.

## Typing the words

If you know what is said, press **Animate > Auto lip sync with the words...** (or **With the words...** in the Lip sync panel) and type it. Frameling lines the mouths up with your words, which helps most when the recording is noisy or mumbled. Frameling remembers the words for that sound until you close the app.

## Fixing it by hand

Open the **Lip sync** panel (View menu). It shows the mouth on each frame around the playhead as a strip.

1. Click a frame in the strip to go there.
2. Click a mouth button to put that mouth on the frame. Each button shows a little picture of the mouth, with its name underneath.

Keys are split and joined for you. Turn on **Go to the next frame after each pick** to work along quickly.

## Tips

- Mouths stay on for at least two frames so they don't flicker.
- Running Auto lip sync again replaces only the frames under the sound.
- Your own character? Draw each mouth on its own frame inside one symbol, then use **Name a symbol's frames** (Animate > Lip sync) to give them the chart names.`,
  },
];
