// The help topic for Repeat. Its words are in help.bodies.ts, which loads only when Help is opened.
import { registerHelp } from '../core/registry';

registerHelp({
  id: 'repeat',
  title: 'Repeat a shape',
  section: 'Drawing',
  media: 'repeat.png',
  summary: 'Make rows and columns of a shape, a ring of it round a centre you can snap, or a mirror image across a line. Change the original and every copy follows (pattern, array, mirror).',
  keywords: ['repeat', 'pattern', 'array', 'grid', 'ring', 'circle', 'circular', 'polar', 'radial', 'mirror', 'mirror image', 'symmetry', 'reflect', 'copies', 'tile', 'rows', 'columns', 'petals', 'fan', 'kaleidoscope', 'snap the centre'],
});
