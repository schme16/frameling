// The plain Brush on a pixel layer now takes its size, shape and picture from the shared pixel brush instead of its own
// settings. These hashes were taken from the Brush BEFORE that change (the same paths, the same layer, the same colour),
// so a pass means every pixel of every stroke is where it was. The second hash adds a click and a Shift+click line.
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing } from '../../src/core/format';
import { store } from '../../src/core/store';
import { dabFromPencil, type Footprint } from '../../src/dab/pencil';
import { setWholeDab } from '../../src/dab/settings';
import { setPixelSettings } from '../../src/pixel/settings';
import '../../src/dab';
import { getTool } from '../../src/core/registry';
import { brushTool } from '../../src/tools/brush';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { asGrid } from '../helpers/grid';
import { ctx, drag, pixelStore } from './helpers';

const TWO = { w: 2, h: 2, colours: ['#ff0000', '#0000ff'], cells: [1, 2, 2, 1], keep: true };
const SHAPE = { w: 3, h: 3, colours: ['#ffffff'], cells: [0, 1, 0, 1, 1, 1, 0, 1, 0], keep: false };
const PS = 2;
const at = (px: number, py: number): [number, number] => [px * PS + 1, py * PS + 1];
const path: [number, number][] = [at(2, 2), at(3, 2), at(3, 3), at(4, 3), at(4, 4), at(8, 4), at(10, 9), at(13, 9), at(13, 12), at(7, 14), at(7, 7), at(3, 12), at(2, 2)];

function hash(): string {
  const { doc } = store().get();
  const g = asGrid(doc.drawings[doc.layers[0].cels[0].drawingId] as PixelDrawing);
  return createHash('sha1').update(Buffer.from(g.pixels.buffer, g.pixels.byteOffset, g.pixels.byteLength)).digest('hex').slice(0, 12);
}

const sq = (size: number): Footprint => ({ size, shape: 'square', stamp: null });
const rd = (size: number): Footprint => ({ size, shape: 'round', stamp: null });
const pic = (stamp: typeof TWO): Footprint => ({ size: 1, shape: 'square', stamp });

// [name, footprint, pixel perfect, symmetry, hash of the path, hash after the click and the Shift+click line]
const CASES: [string, Footprint, boolean, 'off' | 'h', string, string][] = [
  ['size 1 square, perfect on', sq(1), true, 'off', '0803575bdc7d', '69a75e0bc93b'],
  ['size 3 square, perfect on', sq(3), true, 'off', '4fc515b5edc9', '4674a845b974'],
  ['size 4 round, perfect on', rd(4), true, 'off', '0f1c6fa76b59', '049c66d16ee3'],
  ['size 7 round, perfect on', rd(7), true, 'off', '0fb6bf427e8a', '868d275bdc36'],
  ['picture in its own colours, perfect on', pic(TWO), true, 'off', '3474c561156c', '63f53430ac9a'],
  ['picture shape only, perfect on', pic(SHAPE), true, 'off', '5c222ae6595a', '406a68a93251'],
  ['size 1 square, perfect off', sq(1), false, 'off', '77cf59dd80a4', '54c7a26e9249'],
  ['size 3 square, perfect off', sq(3), false, 'off', '4fc515b5edc9', '4674a845b974'],
  ['size 4 round, perfect off', rd(4), false, 'off', '0f1c6fa76b59', '049c66d16ee3'],
  ['size 7 round, perfect off', rd(7), false, 'off', '0fb6bf427e8a', '868d275bdc36'],
  ['picture in its own colours, perfect off', pic(TWO), false, 'off', '3474c561156c', '63f53430ac9a'],
  ['picture shape only, perfect off', pic(SHAPE), false, 'off', '5c222ae6595a', '406a68a93251'],
  ['size 3 square, mirrored across', sq(3), true, 'h', '91ebaa190170', 'c1f6d7531d32'],
];

beforeEach(() => {
  forgetLastPixelEnd();
  setPixelSettings({ symmetry: 'off' } as never);
});

describe('the plain Brush on a pixel layer draws every pixel where it did before', () => {
  it.each(CASES)('%s', (_name, fp, perfect, symmetry, first, second) => {
    pixelStore(PS);
    store().setUi({ color: '#33aa66' });
    setPixelSettings({ symmetry } as never);
    setToolSettings({ ...DEFAULT_TOOL_SETTINGS, pixelPerfect: perfect });
    setWholeDab(dabFromPencil(fp));
    drag(brushTool, ctx(), path);
    expect(hash()).toBe(first);
    drag(brushTool, ctx(), [at(12, 2), at(12, 2)]);
    drag(brushTool, ctx(), [at(1, 13), at(1, 13)], { shift: true });
    expect(hash()).toBe(second);
  });
});

describe('a brush the pencil cannot draw', () => {
  it('is drawn by B exactly as the Pixel brush tool draws it', () => {
    const run = (tool: typeof brushTool): string => {
      pixelStore(PS);
      store().setUi({ color: '#33aa66' });
      setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
      setWholeDab({ ...dabFromPencil({ size: 5, shape: 'round', stamp: null }), hardness: 0.4, aliased: false, spacing: 0.3 });
      drag(tool, ctx(), path);
      return hash();
    };
    const viaB = run(brushTool);
    const viaPixelBrush = run(getTool('pixel-brush')!);
    expect(viaB).toBe(viaPixelBrush);
  });
});
