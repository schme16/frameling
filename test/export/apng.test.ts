import { describe, expect, it } from 'vitest';
import { apngDelays, encodeApng } from '../../src/export/apng';
import { decodePng, makeChunk, PNG_SIGNATURE, readChunks, joinBytes } from '../../src/io/png';
import { rgba } from './helpers';

describe('apng', () => {
  const frames = [0, 1, 2].map((i) => ({ width: 3, height: 2, pixels: rgba(3, 2, (x, y) => [i * 80, x * 50, y * 90, i === 1 ? 128 : 255]) }));

  it('has an animation control chunk, one frame control per frame, and a valid first image', () => {
    const bytes = encodeApng(frames, { width: 3, height: 2, fps: 10, loop: true });
    const chunks = readChunks(bytes);
    const types = chunks.map((c) => c.type);
    expect(types[0]).toBe('IHDR');
    expect(types[1]).toBe('acTL');
    expect(types.filter((t) => t === 'fcTL').length).toBe(3);
    expect(types.filter((t) => t === 'IDAT').length).toBe(1);
    expect(types.filter((t) => t === 'fdAT').length).toBe(2);
    expect(types[types.length - 1]).toBe('IEND');
    const actl = chunks[1].data;
    expect([(actl[0] << 24) | (actl[1] << 16) | (actl[2] << 8) | actl[3], actl[7]]).toEqual([3, 0]);
    // Sequence numbers run 0..4 across frame controls and frame data.
    const seqs = chunks.filter((c) => c.type === 'fcTL' || c.type === 'fdAT').map((c) => c.data[3]);
    expect(seqs).toEqual([0, 1, 2, 3, 4]);
    // The first frame doubles as a plain PNG: pull the pieces out and it should decode to frame 0.
    const plain = joinBytes([PNG_SIGNATURE, makeChunk('IHDR', chunks[0].data), makeChunk('IDAT', chunks.find((c) => c.type === 'IDAT')!.data), makeChunk('IEND', new Uint8Array(0))]);
    expect(decodePng(plain).pixels).toEqual(frames[0].pixels);
  });

  it('plays once when loop is off, and gives each frame its delay in thousandths', () => {
    const bytes = encodeApng(frames, { width: 3, height: 2, fps: 10, loop: false });
    const chunks = readChunks(bytes);
    expect(chunks[1].data[7]).toBe(1);
    const fc = chunks.find((c) => c.type === 'fcTL')!.data;
    expect((fc[20] << 8) | fc[21]).toBe(100);
    expect((fc[22] << 8) | fc[23]).toBe(1000);
    expect(apngDelays(24, 24).reduce((a, b) => a + b, 0)).toBe(1000);
  });
});
