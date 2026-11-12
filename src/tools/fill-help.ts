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
    id: 'fill-gaps',
    title: 'Closing gaps',
    section: 'Drawing',
    media: 'fill-gaps.mp4',
    summary: 'Hand-drawn lines rarely meet perfectly. The Close gaps setting lets the paint bucket treat small gaps as closed.',
    keywords: ['gap', 'leak', 'not closed', 'spills', 'open shape', 'close gaps'],
  },
]);
