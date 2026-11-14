// A tilemap on two keys, with an animated tile in it, exports two different pictures (not one picture used twice).
import { describe, expect, it } from 'vitest';
import '../../src/tiles/kind';
import { docToLottie } from '../../src/export/lottie';
import { sampleTileDoc } from './helpers';

describe('Lottie: a flattened tilemap with animated tiles', () => {
  it('gets a picture per key when the animation differs between them', () => {
    const { doc } = sampleTileDoc();
    doc.length = 8;
    const layer = doc.layers.find((l) => l.kind === 'tilemap')!;
    // The same map on frame 0 and again on frame 3: the water tile is on its other frame by then.
    layer.cels[0].length = 3;
    layer.cels.push({ id: 'c2', start: 3, length: 3, drawingId: layer.cels[0].drawingId });
    const data = docToLottie(doc) as { assets: { id: string; p?: string }[]; layers: { refId?: string; ty: number }[] };
    const refs = data.layers.filter((l) => l.ty === 2).map((l) => l.refId);
    expect(refs).toHaveLength(2);
    expect(refs[0]).not.toBe(refs[1]);
    const pics = data.assets.filter((a) => refs.includes(a.id)).map((a) => a.p);
    expect(pics[0]).not.toBe(pics[1]);
  });

  it('shares one picture when no tile moves', () => {
    const { doc } = sampleTileDoc();
    doc.length = 8;
    for (const t of doc.tileset!.tiles) t.frames.length = 1;
    const layer = doc.layers.find((l) => l.kind === 'tilemap')!;
    layer.cels[0].length = 3;
    layer.cels.push({ id: 'c2', start: 3, length: 3, drawingId: layer.cels[0].drawingId });
    const data = docToLottie(doc) as { layers: { refId?: string; ty: number }[] };
    const refs = data.layers.filter((l) => l.ty === 2).map((l) => l.refId);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toBe(refs[1]);
  });
});
