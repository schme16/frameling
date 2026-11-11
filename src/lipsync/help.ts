import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'lip-sync',
    title: 'Lip sync: making a character talk',
    section: 'Animating',
    media: 'lip-sync.mp4',
    summary: 'Frameling listens to a sound and puts the right mouth on every frame. You can fix any mouth by hand.',
    keywords: ['lip sync', 'lipsync', 'mouth', 'talking', 'speech', 'phoneme', 'viseme', 'mouth chart', 'phoneme chart', 'dialogue', 'auto', 'speak'],
    body: `Lip sync is matching a character's mouth to what they are saying. Frameling can do a first pass for you by listening to the sound, then you tidy it up. It all happens on your computer: nothing is sent anywhere.

## What you need

1. **A mouth**: a symbol whose frames have names, one for each mouth shape on the chart below. The quickest way is **File > New** and the **Lip sync mouth chart** card, which gives you a face with ten ready-made mouths.
2. **A sound**: add one with **File > Import sound...** and drag it so it starts where the talking starts. See [Sound](help:sound).

## The mouth chart (phoneme chart)

Animators use about ten mouth shapes, because lots of sounds look the same on a mouth:

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

Frameling finds each mouth in your symbol by the **name of its frame**, ignoring capital letters and spaces, so "M B P", "mbp" and "MBP" are the same. If your symbol has no frame for a shape it uses the nearest one (no "W Q" frame means it uses "O", then "U"; no "etc" means "E").

## Auto lip sync

Press **Animate > Auto lip sync...** (or the button in the Lip sync panel). If you have one sound and one mouth layer it just does it. With several it asks which ones. It writes **one key for each stretch of the same mouth** on the mouth layer, over the length of the sound, and it is **one undo step**. Play it and see how it reads.

It is a good first pass, not a perfect one: it works from how loud and how hissy the sound is, and roughly which vowel it is. Fix anything that looks wrong by hand.

## Fixing it by hand

Open the **Lip sync** panel (View menu). It shows the mouth on each frame around the playhead as a strip.

1. Click a frame in the strip to go there.
2. Click a mouth button to put that mouth on the frame.

Keys are split and joined for you, so you never have to. Turn on **Go to the next frame after each pick** to work your way along quickly. If you have **Hear the sound while you drag the playhead** on, you hear each frame as you step to it.

## Tips

- Mouths should be on for at least two frames, or they flicker. Frameling does this for you, and you can hold a mouth longer by picking it on the next frame too.
- Move the sound with the playhead on the word you care about, then run Auto lip sync again. It replaces only the frames under the sound.
- Using your own character? Draw each mouth on its own frame inside one symbol, then use **Name a symbol's frames** (command palette, or Animate > Lip sync) and give the frames the chart names. Everything above then works with it.`,
  },
]);
