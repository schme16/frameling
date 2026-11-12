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

export type ClipEngineBounce = 'bake' | 'engine';

registerChoice<ClipEngineBounce>({
  id: 'export.clipEngineBounce',
  title: 'Back-and-forth clips in game engines',
  question: 'How should a back and forth clip go into Godot and Phaser?',
  category: 'Export',
  silent: true,
  default: 'bake',
  help: 'Only Godot and Phaser can bounce a clip themselves; every other format always lists the frames. The engine\'s own ping-pong works for clips that loop (and in Phaser, for an even number of directions); other back and forth clips are always listed frame by frame.',
  options: [
    { value: 'bake', label: 'Baked, ends show once', detail: 'Every frame is listed in the order it plays, so the ends show once and it looks exactly like Frameling. A little more data.' },
    { value: 'engine', label: "Engine's own ping-pong", detail: 'Smaller data: only one direction is listed and the engine bounces it. In Godot the two end frames show twice; Phaser plays it the same as baked.' },
  ],
});
