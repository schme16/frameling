// ?debug only: lets a capture script fill the brush library with a big pack to shoot the picker against.
//   __brushes.addFromText(text)   adds brushes from the text of a brushes file (see model.ts), as Paste from text does
//   __brushes.box({ w, h })       sets the size the picker panel opens at
import { setPanelBox } from './picker';
import { addBrushesFromText } from './presets';

(window as unknown as { __brushes: unknown }).__brushes = { addFromText: addBrushesFromText, box: setPanelBox };
