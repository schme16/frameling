// A stand-in Quill sheet for tests: every anim the real one has, with simple frame times.
import type { Sheet } from '../../src/ui/mascot/timing';

const row = (y: number, ms: number[]) => ms.map((m, i) => ({ x: i * 32, y, ms: m }));

export const FAKE_SHEET: Sheet = {
  frameW: 32,
  frameH: 32,
  anims: {
    idle: { frames: row(0, [400, 200, 400]), loop: true },
    wave: { frames: row(32, [100, 100, 100, 100]), loop: false },
    talk: { frames: row(64, [120, 120]), loop: true },
    point: { frames: row(96, [150, 300]), loop: false },
    cheer: { frames: row(128, [100, 100, 100]), loop: false },
    think: { frames: row(160, [500, 500]), loop: true },
    draw: { frames: row(192, [200, 200]), loop: true },
    sleep: { frames: row(224, [800, 800]), loop: true },
    oops: { frames: row(256, [100, 300]), loop: false },
  },
};
