// Camera commands: palette, menus (Animate and View) and keys, plus the Camera panel.
import { lazyPanel } from '../core/lazy';
import { registerCommands, registerPanel } from '../core/registry';
import { store } from '../core/store';
import { getViewSettings, setViewSettings } from '../canvas/viewSettings';
import { addCamera, resetView, stageCamera, toggleThroughCamera } from './ops';

registerPanel({ id: 'camera', title: 'Camera', icon: 'camera', component: lazyPanel(() => import('./CameraPanel').then((m) => m.CameraPanel)), zone: 'right', order: 37, help: 'camera' });

registerCommands([
  {
    id: 'camera.add',
    label: 'Add a camera',
    category: 'Animate',
    description: 'Adds a camera that frames the scene: pan, zoom and turn it, and it glides between keys.',
    keywords: ['camera', 'pan', 'zoom', 'rotate', 'tilt', 'viewport', 'framing', 'parallax', 'dolly'],
    help: 'camera',
    enabled: (s) => !s.doc.editing?.length && !stageCamera(s.doc),
    run: () => void addCamera(),
  },
  {
    id: 'camera.lookThrough',
    label: 'Look through the camera',
    category: 'View',
    keys: ['Shift+C'],
    description: 'Shows just what the camera sees, the way exports will. Press again to see the whole stage.',
    keywords: ['camera view', 'preview', 'framing', 'viewport', 'through the lens'],
    help: 'camera',
    enabled: (s) => !!stageCamera(s.doc),
    checked: () => getViewSettings().throughCamera,
    run: () => toggleThroughCamera(),
  },
  {
    id: 'camera.whilePlaying',
    label: 'Look through the camera while playing',
    category: 'View',
    keywords: ['camera', 'playback', 'preview'],
    help: 'camera',
    checked: () => getViewSettings().cameraWhilePlaying,
    run: () => setViewSettings({ cameraWhilePlaying: !getViewSettings().cameraWhilePlaying }),
  },
  {
    id: 'camera.reset',
    label: 'Camera: whole stage again',
    category: 'Animate',
    description: 'Puts the camera back to showing the whole stage on this frame.',
    keywords: ['reset camera', 'camera', 'unzoom'],
    help: 'camera',
    enabled: (s) => !!stageCamera(s.doc),
    run: () => void resetView(),
  },
  {
    id: 'camera.pick',
    label: 'Move the camera',
    category: 'Animate',
    description: 'Picks the camera layer and the Camera tool, so you can drag its frame.',
    keywords: ['camera tool', 'pan', 'zoom'],
    help: 'camera',
    enabled: (s) => !!stageCamera(s.doc),
    run: () => {
      const cam = stageCamera();
      if (cam) store().setUi({ activeLayerId: cam.id, tool: 'camera' });
    },
  },
]);
