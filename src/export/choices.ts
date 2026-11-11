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
