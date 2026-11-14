import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'saving-and-opening',
    order: 1,
    media: 'saving-and-opening.png',
    title: 'Saving and opening',
    section: 'Files',
    summary: 'Save your drawing as a .frameling file, and open it again any time.',
    keywords: ['save', 'open', 'file', 'load', 'recent', 'frameling file'],
  },
  {
    id: 'autosave',
    media: 'autosave.png',
    title: 'Autosave',
    section: 'Files',
    summary: 'Frameling keeps a safety copy of unsaved work every minute, in case something goes wrong.',
    keywords: ['recover', 'crash', 'lost', 'backup', 'restore', 'safety', 'lost my work', 'lost work', 'safety copy'],
  },
  {
    id: 'recent-drawings',
    media: 'recent-drawings.png',
    title: 'Open recent: a picture of each drawing',
    section: 'Files',
    summary: 'Open recent shows a little picture of each drawing, so you find your work by what it looks like, not by its file name.',
    keywords: ['recent', 'open recent', 'thumbnail', 'thumbnails', 'preview', 'picture', 'last opened', 'history', 'remove from list', 'missing file', 'file has gone'],
  },
  {
    id: 'restart',
    media: 'restart.png',
    title: 'Restarting Frameling',
    section: 'Getting around',
    summary: 'When something needs a restart, Frameling closes and opens again by itself, on the same drawing, frame and place on your screen.',
    keywords: ['restart', 'relaunch', 'reopen', 'start again', 'close and open', 'hardware drawing', 'gpu', 'update', 'new version', 'plugin memory', 'next start'],
  },
  {
    id: 'version-history',
    media: 'version-history.png',
    title: 'Versions: go back to an earlier drawing',
    section: 'Files',
    summary: 'Frameling keeps earlier versions of your drawing as you work. Look back through them and bring one back.',
    keywords: ['version', 'versions', 'version history', 'history', 'restore', 'revert', 'go back', 'earlier', 'older', 'snapshot', 'checkpoint', 'time machine', 'backup'],
  },
]);
