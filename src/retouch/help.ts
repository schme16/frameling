// Help for the retouch brushes. Plain words first, the usual paint program term second.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'clone-stamp',
    order: 1.6,
    media: 'clone-stamp.png',
    title: 'Clone stamp: copy one part of the picture onto another',
    section: 'Pixel art',
    summary: 'Pick a spot to copy from, then paint, and that spot follows your hand. Good for covering a blemish, a stray mark or a gap. On pixel layers.',
    keywords: ['clone', 'clone stamp', 'stamp', 'rubber stamp', 'copy', 'duplicate', 'patch', 'heal', 'healing', 'blemish', 'spot', 'speck', 'dust', 'scratch', 'stray', 'retouch', 'remove', 'cover up', 'source', 'aligned', 'sample', 'photoshop', 'krita', 'gimp', 'procreate'],
  },
  {
    id: 'blur-sharpen-brush',
    order: 1.61,
    media: 'blur-sharpen-brush.mp4',
    title: 'Blur and sharpen brushes: soften or crisp up one edge',
    section: 'Pixel art',
    summary: 'Paint over a hard edge to soften it, or over a soft one to crisp it up, instead of blurring the whole layer. On pixel layers.',
    keywords: ['blur', 'blur brush', 'blur tool', 'sharpen', 'sharpen brush', 'sharpen tool', 'soften', 'soft edge', 'smooth', 'smooth out', 'crisp', 'focus', 'retouch', 'feather', 'unsharp', 'photoshop', 'krita', 'gimp', 'procreate'],
  },
]);
