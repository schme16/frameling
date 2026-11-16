// Help for chalk and charcoal. Plain words first, the usual art-shop word second.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'chalk-charcoal',
    order: 1.6,
    media: 'chalk-charcoal.png',
    title: 'Chalk and charcoal: pastel, crayon and pencil on paper',
    section: 'Pixel art',
    summary: 'Dry drawing that catches on the paper like the real thing: charcoal, chalk, pastels, crayon and pencils, with a choice of paper from smooth to rough. On pixel layers.',
    keywords: ['charcoal', 'chalk', 'pastel', 'soft pastel', 'oil pastel', 'crayon', 'pencil', 'graphite', 'grain', 'tooth', 'paper', 'texture', 'rough', 'dry media', 'vine charcoal', 'compressed charcoal', 'conte', 'sketch'],
  },
  {
    id: 'paper',
    order: 1.65,
    media: 'paper.png',
    title: 'Paper: one sheet for chalk, charcoal and grainy brushes',
    section: 'Pixel art',
    summary: 'The paper your drawing catches on, chosen in one Paper box that is the same in every tool that uses it. A brush can keep a paper of its own.',
    keywords: ['paper', 'sheet', 'grain', 'tooth', 'texture', 'rough', 'smooth', 'fine', 'laid', 'catch on paper', 'keep this brush on', 'own paper', 'grainy brush', 'paper box'],
  },
]);
