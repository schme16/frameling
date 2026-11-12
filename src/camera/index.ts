// The camera: a layer that frames the scene (pan, zoom, turn), keyed and tweened, with parallax depth per layer. A
// feature that can be turned off (Preferences > Features). The camera layer itself stays in the document, and exports
// and playback keep following it whether or not the feature is on; what goes is the Camera tool, panel and commands.
import { defineFeature } from '../features/feature';
import { cameraTool, registerCameraFrame } from './canvas';
import { cameraCommands, cameraPanel } from './commands';
import { cameraHelp } from './help';

export const cameraFeature = defineFeature({
  id: 'camera',
  name: 'Camera',
  about: 'A camera you can move, zoom and shake over the scene, for parallax and cut-scenes.',
  optional: true,
  commands: cameraCommands,
  panels: [cameraPanel],
  tools: [cameraTool],
  help: cameraHelp,
  templates: ['camera-parallax'],
  // A drawing with a camera layer (its keys and the depth of other layers stay in the file).
  usedBy: (doc) => doc.layers.some((l) => l.kind === 'camera'),
  activate: registerCameraFrame,
});
