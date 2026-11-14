import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'fill',
    title: 'Fill',
    section: 'Drawing',
    media: 'fill-bucket.mp4',
    summary: 'The paint bucket pours colour into any area your lines close off. Click inside a shape to fill it.',
    keywords: ['paint bucket', 'colour', 'color', 'flood', 'fill in', 'bucket'],
  },
  {
    id: 'fill-pixel',
    title: 'Filling pixel art under your lines',
    section: 'Drawing',
    media: 'fill-pixel.png',
    summary: 'On a pixel layer the paint bucket can stop at lines on other layers, and fill colours that are close but not the same.',
    keywords: ['pixel', 'bucket', 'fill', 'under lines', 'all layers', 'colour layer', 'flats', 'tolerance', 'colour match', 'anti-aliased'],
  },
  {
    id: 'fill-gaps',
    title: 'Closing gaps',
    section: 'Drawing',
    media: 'fill-gaps.mp4',
    summary: 'Hand-drawn lines rarely meet perfectly. The Close gaps setting lets the paint bucket treat small gaps as closed.',
    keywords: ['gap', 'leak', 'not closed', 'spills', 'open shape', 'close gaps'],
  },
]);
