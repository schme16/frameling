// The export area's remembered choices (see core/choices.ts). Preferences > Behaviour lists them.
import { registerChoice } from '../core/choices';

export type WebmCodecPref = 'av1' | 'vp9';

registerChoice<WebmCodecPref>({
  id: 'export.webmCodec',
  title: 'WebM video codec',
  question: 'Which codec should WebM videos use?',
  category: 'Export',
  silent: true,
  default: 'av1',
  help: 'If this computer cannot make the one you pick, Frameling quietly uses another that works.',
  options: [
    { value: 'av1', label: 'AV1', detail: 'Smaller files at the same quality. Takes longer to make.' },
    { value: 'vp9', label: 'VP9', detail: 'Quicker to make, and plays in a few more older players.' },
  ],
});

export type GameArtSize = 'art' | 'keep';

registerChoice<GameArtSize>({
  id: 'export.gameArtSize',
  title: 'Pixel art size for game engines',
  question: 'Export this pixel art at its real size for the game engine?',
  category: 'Export',
  default: 'art',
  help: 'Game engines usually load pixel art at its real size (one art pixel is one pixel) and scale it up on screen, which keeps files small and edges sharp.',
  options: [
    { value: 'art', label: 'Yes, art size', detail: 'One art pixel becomes one pixel. Smallest files; the game scales it up.' },
    { value: 'keep', label: 'Keep the size I picked', detail: 'Each art pixel stays as big as the Size buttons say.' },
  ],
});

export type Mp4SoundChoice = 'mp4' | 'webm';

registerChoice<Mp4SoundChoice>({
  id: 'export.mp4Sound',
  title: 'MP4 videos with sound',
  question:
    "This computer can't make the usual kind of sound for MP4 (AAC), so the sound would be Opus. Opus plays in Chrome, Edge, Firefox, VLC and Windows, but Apple's QuickTime, Safari and iPhones play the video silent. What would you like?",
  category: 'Export',
  default: 'mp4',
  help: 'Installing ffmpeg fixes this for good: Frameling finds it and makes the sound AAC, which plays everywhere.',
  options: [
    { value: 'mp4', label: 'Keep it MP4', detail: 'Sound plays almost everywhere, but not in QuickTime, Safari or on iPhones.' },
    { value: 'webm', label: 'Make a WebM instead', detail: 'Made for the web: plays with sound in every browser, though not in QuickTime.' },
  ],
});
