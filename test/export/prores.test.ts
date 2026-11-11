import { describe, expect, it } from 'vitest';
import { proresArgs } from '../../src/main/video';

describe('ProRes through FFmpeg', () => {
  it('asks for ProRes 4444, with alpha only when see-through', () => {
    const a = proresArgs({ width: 640, height: 360, fps: 24, alpha: true, out: 'x.mov' });
    expect(a.join(' ')).toContain('-f rawvideo -pix_fmt rgba -s 640x360 -r 24 -i -');
    expect(a.join(' ')).toContain('-c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le');
    expect(a[a.length - 1]).toBe('x.mov');
    const b = proresArgs({ width: 640, height: 360, fps: 12, alpha: false, out: 'y.mov' });
    expect(b).toContain('yuv444p10le');
    expect(b).not.toContain('-alpha_bits');
  });
});
