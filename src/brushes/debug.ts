// ?debug only: lets a capture script fill the brush library with a big pack to shoot the picker against.
//   __brushes.addFromText(text)   adds brushes from the text of a brushes file (see model.ts), as Paste from text does
//   __brushes.box({ w, h })       sets the size the picker panel opens at
import { setPanelBox } from './picker';
import { addBrushesFromText } from './presets';

(window as unknown as { __brushes: unknown }).__brushes = { addFromText: addBrushesFromText, box: setPanelBox };

// __brushImport.show(base64, name)   opens the "Add brushes from a file" look at a brush file's bytes (base64), as picking the file does
// __brushImport.read(base64, name)   what reading the file gives, as plain data (the brushes, what was left out and changed)
import { addImportedBrushes } from './presets';

const bytesOf = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
(window as unknown as { __brushImport: unknown }).__brushImport = {
  show: async (b64: string, name: string) => (await import('./import/run')).importBrushBytes(bytesOf(b64), name, addImportedBrushes),
  read: async (b64: string, name: string) => (await import('./import')).readBrushFile(bytesOf(b64), name),
};
