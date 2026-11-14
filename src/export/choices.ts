// The export area's remembered choices (see core/choices.ts). Preferences > Behaviour lists them.
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export type WebmCodecPref = 'av1' | 'vp9';

registerChoice<WebmCodecPref>({
  id: 'export.webmCodec',
  title: choiceWord('choice.export.webmCodec.title'),
  question: choiceWord('choice.export.webmCodec.question'),
  category: 'Export',
  silent: true,
  default: 'av1',
  help: 'AV1 makes smaller files at the same quality and plays in today\'s browsers and players. VP9 is the safer one for an older player or phone. If this computer cannot make the one you pick, Frameling quietly uses another that works.',
  options: [
    { value: 'av1', label: choiceWord('choice.export.webmCodec.av1.label'), detail: choiceWord('choice.export.webmCodec.av1.detail') },
    { value: 'vp9', label: choiceWord('choice.export.webmCodec.vp9.label'), detail: choiceWord('choice.export.webmCodec.vp9.detail') },
  ],
});

export type ClipEngineBounce = 'bake' | 'engine';

registerChoice<ClipEngineBounce>({
  id: 'export.clipEngineBounce',
  title: choiceWord('choice.export.clipEngineBounce.title'),
  question: choiceWord('choice.export.clipEngineBounce.question'),
  category: 'Export',
  silent: true,
  default: 'bake',
  help: 'Only Godot and Phaser can bounce a clip themselves; every other format always lists the frames. The engine\'s own back and forth loop (Godot calls it ping-pong) works for clips that loop (and in Phaser, for an even number of directions); other back and forth clips are always listed frame by frame.',
  options: [
    { value: 'bake', label: choiceWord('choice.export.clipEngineBounce.bake.label'), detail: choiceWord('choice.export.clipEngineBounce.bake.detail') },
    { value: 'engine', label: choiceWord('choice.export.clipEngineBounce.engine.label'), detail: choiceWord('choice.export.clipEngineBounce.engine.detail') },
  ],
});

export type IconFitPref = 'fit' | 'fill';

registerChoice<IconFitPref>({
  id: 'export.iconFit',
  title: choiceWord('choice.export.iconFit.title'),
  question: choiceWord('choice.export.iconFit.question'),
  category: 'Export',
  silent: true,
  default: 'fit',
  help: 'App icons, favicons and stickers are square. "Show it all" keeps the whole drawing and leaves empty margins at the sides. "Fill the square" fills it edge to edge and cuts off what sticks out. A square drawing is the same either way.',
  options: [
    { value: 'fit', label: choiceWord('choice.export.iconFit.fit.label'), detail: choiceWord('choice.export.iconFit.fit.detail') },
    { value: 'fill', label: choiceWord('choice.export.iconFit.fill.label'), detail: choiceWord('choice.export.iconFit.fill.detail') },
  ],
});
