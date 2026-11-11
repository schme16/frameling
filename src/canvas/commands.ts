// View commands: zoom, fit, centre, the pixel grid.
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { center, fit, zoom100, zoomStep } from './controller';
import { getViewSettings, setViewSettings } from './viewSettings';

registerCommands([
  {
    id: 'view.zoomIn',
    label: 'Zoom in',
    category: 'View',
    keys: ['Mod+=', 'Mod++'],
    description: 'Get closer to your drawing.',
    help: 'canvas-navigation',
    run: () => zoomStep(1),
  },
  {
    id: 'view.zoomOut',
    label: 'Zoom out',
    category: 'View',
    keys: ['Mod+-'],
    description: 'Step back to see more.',
    help: 'canvas-navigation',
    run: () => zoomStep(-1),
  },
  {
    id: 'view.fit',
    label: 'Fit to window',
    category: 'View',
    keys: ['Mod+0'],
    description: 'Show the whole page, as big as fits.',
    help: 'canvas-navigation',
    keywords: ['reset view', 'whole'],
    run: () => fit(),
  },
  {
    id: 'view.zoom100',
    label: 'Actual size (100%)',
    category: 'View',
    keys: ['Mod+1'],
    description: 'One drawing pixel for each screen pixel.',
    help: 'canvas-navigation',
    keywords: ['100%', 'actual pixels', 'one to one'],
    run: () => zoom100(),
  },
  {
    id: 'view.center',
    label: 'Centre the page',
    category: 'View',
    description: 'Put the page in the middle of the window without changing the zoom.',
    help: 'canvas-navigation',
    keywords: ['center', 'middle', 'lost'],
    run: () => center(),
  },
  {
    id: 'view.pixelGrid',
    label: 'Pixel grid',
    category: 'View',
    description: 'Show the lines between pixels when you zoom in close on pixel art.',
    help: 'pixel-grid',
    keywords: ['grid', 'pixel lines'],
    checked: () => getViewSettings().pixelGrid,
    run: () => {
      setViewSettings({ pixelGrid: !getViewSettings().pixelGrid });
      // Menus read the tick from the store's state, so give them a nudge to look again.
      store().setUi({});
    },
  },
]);

registerCommands([
  {
    id: 'document.settings',
    label: 'Canvas size and speed...',
    category: 'Edit',
    keys: ['Mod+Alt+C'],
    description: 'Change the page size (canvas or image size), frame rate, DPI and background.',
    help: 'canvas-size',
    keywords: ['canvas size', 'image size', 'resize', 'page size', 'stage size', 'document settings', 'fps', 'frame rate', 'dpi', 'background', 'scale', 'crop'],
    // The dialog loads on first use.
    run: () => void import('./DocumentSettings').then((m) => m.openDocumentSettings()),
  },
]);
