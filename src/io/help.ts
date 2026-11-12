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
    id: 'version-history',
    media: 'version-history.png',
    title: 'Versions: go back to an earlier drawing',
    section: 'Files',
    summary: 'Frameling keeps earlier versions of your drawing as you work. Look back through them and bring one back.',
    keywords: ['version', 'versions', 'version history', 'history', 'restore', 'revert', 'go back', 'earlier', 'older', 'snapshot', 'checkpoint', 'time machine', 'backup'],
  },
]);
