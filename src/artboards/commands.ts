// Artboard commands: palette, menus (View, and File > Export) and keys, plus the Artboards panel.
import { lazyPanel } from '../core/lazy';
import { registerCommands, registerPanel } from '../core/registry';
import type { State } from '../core/store';
import { store } from '../core/store';
import { setChoice } from '../core/choices';
import './fit';
import { activeId, artboardsOf, hasArtboards } from './model';
import { arrangeAll, deleteArtboardById, duplicateArtboardById, fitAllArtboards, goToArtboard, newArtboard, zoomToArtboard } from './ops';

registerPanel({ id: 'artboards', title: 'Artboards', icon: 'artboard', component: lazyPanel(() => import('./ArtboardsPanel').then((m) => m.ArtboardsPanel)), zone: 'right', order: 39, help: 'artboards' });

const top = (s: State) => !s.doc.editing?.length && !store().nestedTag();
const many = (s: State) => top(s) && hasArtboards(s.doc);

/** The artboard `by` steps along the list from the open one, round the end. */
function step(by: number): void {
  const doc = store().get().doc;
  const list = artboardsOf(doc);
  const i = list.findIndex((a) => a.id === activeId(doc));
  goToArtboard(list[(i + by + list.length) % list.length].id, true);
}

registerCommands([
  {
    id: 'artboards.fitBars',
    label: 'Shots of different sizes: Fit (bars)',
    category: 'Artboards',
    description: 'When shots of different sizes play or export as one film, show each whole with bars where it does not fill the picture.',
    keywords: ['letterbox', 'pillarbox', 'bars', 'fit', 'different sizes', 'join shots'],
    help: 'artboards-letterbox',
    enabled: many,
    run: () => setChoice('artboards.fit', 'bars'),
  },
  {
    id: 'artboards.fitFill',
    label: 'Shots of different sizes: Fill (crop)',
    category: 'Artboards',
    description: 'When shots of different sizes play or export as one film, make each cover the whole picture and crop what hangs over.',
    keywords: ['crop', 'fill', 'cover', 'different sizes', 'join shots'],
    help: 'artboards-letterbox',
    enabled: many,
    run: () => setChoice('artboards.fit', 'fill'),
  },
  {
    id: 'artboards.pictureFirst',
    label: 'Joined shots picture size: First shot',
    category: 'Artboards',
    description: 'When shots play or export as one film, make the picture the size of the first shot.',
    keywords: ['picture size', 'join shots', 'film size', 'resolution'],
    help: 'artboards-letterbox',
    enabled: many,
    run: () => setChoice('artboards.pictureSize', 'first'),
  },
  {
    id: 'artboards.pictureLargest',
    label: 'Joined shots picture size: Largest shot',
    category: 'Artboards',
    description: 'When shots play or export as one film, make the picture the size of the biggest shot, so none of them has to shrink.',
    keywords: ['picture size', 'join shots', 'film size', 'resolution', 'biggest'],
    help: 'artboards-letterbox',
    enabled: many,
    run: () => setChoice('artboards.pictureSize', 'largest'),
  },
  {
    id: 'artboards.pictureCustom',
    label: 'Joined shots picture size: Custom',
    category: 'Artboards',
    description: 'When shots play or export as one film, use a picture size you type in (in Play all in order or the Export dialog).',
    keywords: ['picture size', 'join shots', 'film size', 'resolution', 'custom size'],
    help: 'artboards-letterbox',
    enabled: many,
    run: () => setChoice('artboards.pictureSize', 'custom'),
  },
  {
    id: 'artboards.new',
    label: 'New artboard',
    category: 'Artboards',
    description: 'Adds an empty artboard beside the others, the same size as this one, and opens it.',
    keywords: ['artboard', 'canvas', 'sheet', 'page', 'sprite', 'scene', 'shot', 'board', 'multiple canvases'],
    help: 'artboards',
    enabled: top,
    run: () => void newArtboard(),
  },
  {
    id: 'artboards.duplicate',
    label: 'Duplicate artboard',
    category: 'Artboards',
    description: 'A copy of this artboard beside it, with its own copy of every drawing.',
    keywords: ['copy artboard', 'clone', 'variation'],
    help: 'artboards',
    enabled: top,
    run: () => void duplicateArtboardById(),
  },
  {
    id: 'artboards.delete',
    label: 'Delete artboard',
    category: 'Artboards',
    description: 'Removes this artboard and everything on it (Undo brings it back).',
    keywords: ['remove artboard'],
    help: 'artboards',
    enabled: many,
    run: () => void deleteArtboardById(),
  },
  {
    id: 'artboards.next',
    label: 'Next artboard',
    category: 'Artboards',
    keys: ['Alt+PageDown'],
    description: 'Opens the next artboard in the list.',
    help: 'artboards',
    enabled: many,
    run: () => step(1),
  },
  {
    id: 'artboards.previous',
    label: 'Previous artboard',
    category: 'Artboards',
    keys: ['Alt+PageUp'],
    description: 'Opens the artboard before this one in the list.',
    help: 'artboards',
    enabled: many,
    run: () => step(-1),
  },
  {
    id: 'artboards.zoomTo',
    label: 'Zoom to artboard',
    category: 'Artboards',
    description: 'Fills the window with the artboard you have open.',
    keywords: ['fit artboard', 'focus'],
    help: 'artboards',
    enabled: top,
    run: () => zoomToArtboard(),
  },
  {
    id: 'artboards.fitAll',
    label: 'Fit all artboards',
    category: 'Artboards',
    keys: ['Mod+Alt+0'],
    description: 'Zooms out to show every artboard at once.',
    keywords: ['overview', 'see everything', 'zoom out'],
    help: 'artboards',
    enabled: many,
    run: () => fitAllArtboards(),
  },
  {
    id: 'artboards.lineUp',
    label: 'Line up artboards',
    category: 'Artboards',
    description: 'Puts the artboards in a tidy row, in list order.',
    keywords: ['arrange artboards', 'tidy', 'align'],
    help: 'artboards',
    enabled: many,
    run: () => arrangeAll(),
  },
  {
    id: 'artboards.playAll',
    label: 'Play all artboards in order',
    category: 'Artboards',
    description: 'Plays every artboard one after another, like the shots of a film.',
    keywords: ['play shots', 'scenes', 'storyboard', 'animatic', 'preview film', 'sequence'],
    help: 'artboards-shots',
    enabled: many,
    run: () => void import('./player').then((m) => m.openShotsPlayer()),
  },
  {
    id: 'artboards.export',
    label: 'Export artboards...',
    category: 'Export',
    description: 'Exports each artboard as its own file, all of them in order as one, or packs them onto one sprite sheet.',
    keywords: ['export all', 'batch export', 'each artboard', 'zip'],
    help: 'artboards-export',
    enabled: many,
    run: () => void import('./exportDialog').then((m) => m.openArtboardExport('each')),
  },
  {
    id: 'artboards.exportAtlas',
    label: 'Pack artboards into one sprite sheet...',
    category: 'Export',
    description: 'Every frame of every artboard on one picture, with a JSON atlas that names them.',
    keywords: ['atlas', 'texture atlas', 'pack'],
    help: 'artboards-export',
    enabled: many,
    run: () => void import('./exportDialog').then((m) => m.openArtboardExport('atlas')),
  },
]);
