import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'sound',
    title: 'Sound: speech, music and effects',
    section: 'Animating',
    media: 'sound.png',
    summary: 'Add a sound to your animation, line it up with your drawings, hear it as you scrub, and have it in your video.',
    keywords: ['sound', 'audio', 'music', 'voice', 'speech', 'dialogue', 'narration', 'wav', 'mp3', 'ogg', 'waveform', 'soundtrack', 'mute', 'volume', 'scrub'],
    body: `You can put a sound on the timeline: someone talking, a song, a footstep. It plays when you play the animation, and it goes into your MP4 and WebM videos.

## Adding a sound

Pick **File > Import sound...** (or press the **Sound** button above the timeline) and choose a file. WAV, MP3, OGG, M4A and FLAC files work. You can also **drop a sound file onto the window**.

The sound appears in a row under your layers as a **waveform**: a picture of how loud it is from moment to moment. The tall parts are where the sound is loud, which is where a word or a hit lands.

If the sound is longer than your animation, Frameling asks once whether to make the animation as long as the sound. (You can change your answer in Preferences > Behaviour.)

## Lining it up

- **Drag the waveform** left or right to change the frame it starts on. Dragging the sound is the easy way to match a word to a drawing.
- Right-click it for **Start at the playhead**, which moves the start to the frame you are on.
- **Click an empty part of the sound row** to move the playhead there.

## Volume, mute and taking it out

Each sound has controls on the left of its row:

- The **speaker** button mutes it (a muted sound is left out of exports too).
- The **Volume** slider makes it louder or quieter.
- The **bin** takes it out. Undo brings it back.
- **Double-click the name** to rename it.

## Hearing it

- **Play** (Enter) plays the sound with the picture, and it follows the playhead if you jump, loop or scrub.
- **Drag the playhead or step frame by frame** and you hear a short snippet at that spot. This is called *scrubbing*, and it is how you find exactly where a word starts. Turn it off with **Hear the sound while you drag the playhead** in the command palette or in Preferences > Behaviour.

## In your video

Exporting an **MP4 or WebM** mixes every unmuted sound into the video.

MP4 sound is **AAC**, the kind every player knows. The desktop app can't make AAC by itself, so it uses **ffmpeg** if it's on your computer (a free program; on Linux it's usually there already). Without ffmpeg the sound would be **Opus**, which plays in Chrome, Edge, Firefox, VLC and Windows, but QuickTime, Safari and iPhones play the video silent. The first time that happens Frameling asks whether to keep the MP4 or make a WebM instead (change it in Preferences > Behaviour).

If your computer can't make sound for video at all, the video is made without it and Frameling tells you so. GIFs, PNGs and the other formats have no sound.

Sounds are saved inside your .frameling file, so they travel with it.

Want a character to talk? See [Lip sync](help:lip-sync).`,
  },
]);
