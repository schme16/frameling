import { newDoc } from '../core/doc';
import type { Doc } from '../core/format';
import { addClip, addMarker, addPixelLayer, emptyOf, hold, pixelDrawing, swatchesFrom, type PixelPalette } from './build';

// w cream, y sunny: the star itself. o peach, r rose: the sparks flying off it.
const PALETTE: PixelPalette = { w: '#fffaf0', y: '#ffc94a', o: '#ff9e6d', r: '#ff6f91' };

const FRAMES: string[][] = [
  // 0: a seed of light
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......ww.......',
    '.......ww.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  // 1: a small cross
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......yy.......',
    '.......ww.......',
    '.....yywwyy.....',
    '.....yywwyy.....',
    '.......ww.......',
    '.......yy.......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  // 2: the full star, with the first sparks
  [
    '................',
    '.......yy.......',
    '.......yy.......',
    '...o...ww...o...',
    '.......ww.......',
    '......wwww......',
    '......wwww......',
    '..yywwwwwwwwyy..',
    '..yywwwwwwwwyy..',
    '......wwww......',
    '......wwww......',
    '.......ww.......',
    '...o...ww...o...',
    '.......yy.......',
    '.......yy.......',
    '................',
  ],
  // 3: the star shrinks as the sparks fly out
  [
    '................',
    '.r............r.',
    '..r..........r..',
    '...o...yy...o...',
    '.......ww.......',
    '.......ww.......',
    '....yywwwwyy....',
    '...yywwwwwwyy...',
    '...yywwwwwwyy...',
    '....yywwwwyy....',
    '.......ww.......',
    '.......ww.......',
    '...o...yy...o...',
    '..r..........r..',
    '.r............r.',
    '................',
  ],
  // 4: a ring of drifting sparks
  [
    '................',
    '................',
    '..r....yy....r..',
    '................',
    '....o......o....',
    '................',
    '................',
    '..y....ww....y..',
    '..y....ww....y..',
    '................',
    '................',
    '................',
    '....o......o....',
    '..r....yy....r..',
    '................',
    '................',
  ],
  // 5: the last glints fade out
  [
    '................',
    '.......r........',
    '................',
    '.r..........r...',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...r............',
    '................',
    '.......o...r....',
    '................',
    '................',
  ],
];

/** A 6-frame sparkle burst that loops: a star pops out, throws sparks and fades. */
export function makeSparkle(): Doc {
  const doc = emptyOf(newDoc({ name: 'Sparkle FX', width: 256, height: 256, fps: 12, length: FRAMES.length, background: null }));
  swatchesFrom(doc, [['Cream', PALETTE.w], ['Sunny', PALETTE.y], ['Peach', PALETTE.o], ['Rose', PALETTE.r]]);

  // The star and the sparks sit on separate layers, so either can be recoloured or retimed on its own.
  const sparks = addPixelLayer(doc, 'Sparks', 16);
  const star = addPixelLayer(doc, 'Star', 16);

  FRAMES.forEach((rows, f) => {
    const grid = rows.map((r) => r.split(''));
    const starOnly = grid.some((r) => r.some((c) => 'wy'.includes(c)));
    const sparkOnly = grid.some((r) => r.some((c) => 'or'.includes(c)));
    if (starOnly) hold(star, pixelDrawing(doc, rows, PALETTE, 'wy').id, f);
    if (sparkOnly) hold(sparks, pixelDrawing(doc, rows, PALETTE, 'or').id, f);
  });

  addClip(doc, 'burst', 0, FRAMES.length - 1, true);
  addMarker(doc, 'flash', 2);
  return doc;
}
