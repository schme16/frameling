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
  help: 'AV1 makes smaller files at the same quality and plays in today\'s browsers and players. VP9 is the safer one for an older player or phone. If this computer cannot make the one you pick, Frameling quietly uses another that works.',
  options: [
    { value: 'av1', label: 'AV1', detail: 'Smaller files at the same quality. Today\'s browsers and players handle it; it takes a little longer to make.' },
    { value: 'vp9', label: 'VP9', detail: 'The safe one: plays in older browsers, phones and players too. Files are a little bigger.' },
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
  help: 'Only Godot and Phaser can bounce a clip themselves; every other format always lists the frames. The engine\'s own back and forth loop (Godot calls it ping-pong) works for clips that loop (and in Phaser, for an even number of directions); other back and forth clips are always listed frame by frame.',
  options: [
    { value: 'bake', label: 'Baked, ends show once', detail: 'Every frame is listed in the order it plays, so the ends show once and it looks exactly like Frameling. A little more data.' },
    { value: 'engine', label: "The engine's own back and forth", detail: 'Smaller data: only one direction is listed and the engine bounces it. In Godot the two end frames show twice, and it needs Godot 4.7 or newer (older Godot plays it forward only); Phaser plays it the same as baked.' },
  ],
});

export type IconFitPref = 'fit' | 'fill';

registerChoice<IconFitPref>({
  id: 'export.iconFit',
  title: 'Icons from a drawing that is not square',
  question: 'An icon is square. What should happen to a drawing that is wider or taller?',
  category: 'Export',
  silent: true,
  default: 'fit',
  help: 'App icons, favicons and stickers are square. "Show it all" keeps the whole drawing and leaves empty margins at the sides. "Fill the square" fills it edge to edge and cuts off what sticks out. A square drawing is the same either way.',
  options: [
    { value: 'fit', label: 'Show it all', detail: 'Keeps the whole drawing, with empty margins at the sides.' },
    { value: 'fill', label: 'Fill the square', detail: 'Fills the square edge to edge and cuts off what sticks out.' },
  ],
});
