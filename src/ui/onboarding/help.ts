// Help for Quill's first-run hello and for units. Plain data, so the help tests can load it without the UI.
import { registerHelpTopics } from '../../core/registry';

registerHelpTopics([
  {
    id: 'first-run',
    title: "Quill's hello",
    section: 'Getting started',
    media: 'first-run.mp4',
    summary: 'The first time Frameling opens, Quill says hello and helps you set things up. Meet him again from Help.',
    keywords: ['onboarding', 'tour', 'intro', 'setup', 'first time', 'quill', 'start'],
  },
  {
    id: 'units',
    media: 'units.png',
    title: 'Units: pixels, mm, cm, inches',
    section: 'Getting started',
    summary: 'Show sizes in pixels, or in millimetres, centimetres, inches or points for print.',
    keywords: ['units', 'mm', 'cm', 'inches', 'in', 'pt', 'points', 'dpi', 'ppi', 'print', 'size', 'resolution'],
  },
]);
