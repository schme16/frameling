// What is aimed at and drawn over the picked layer goes through that layer's own camera speed: the pointer, the tool
// overlay, the stage overlays and handles (one matrix, overlayCamera) and the eyedropper (reads the camera's picture).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { addCamera, canvasCamera, canvasLayerCamera, overlayCamera, setDepth, setView, toggleThroughCamera } from '../../src/camera/ops';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { applyMat } from '../../src/core/symbols';
import { STAGE_TOOLS } from '../../src/rig/pose';

const seen: { opts: { camera?: boolean } | undefined; at: number[] | null }[] = [];
vi.mock('../../src/core/render', async (orig) => ({
  ...(await orig<typeof import('../../src/core/render')>()),
  renderFrame: (g: { last: number[] | null }, _d: unknown, _f: number, opts?: { camera?: boolean }) => void seen.push({ opts, at: g.last }),
}));

// A one pixel canvas that remembers where the picture was moved to, and answers with a fixed colour.
class FakeCanvas {
  last: number[] | null = null;
  getContext() {
    return {
      get last() {
        return fake.last;
      },
      setTransform: (...a: number[]) => void (fake.last = a),
      clearRect() {},
      getImageData: () => ({ data: new Uint8ClampedArray([10, 20, 30, 255]) }),
    };
  }
}
const fake = new FakeCanvas();
vi.stubGlobal('OffscreenCanvas', class {
  getContext() {
    return fake.getContext();
  }
});

beforeEach(() => {
  resetStore(newDoc({ width: 200, height: 100, length: 10 }));
  setViewSettings({ throughCamera: false });
  seen.length = 0;
});

const lookThrough = (depth: number) => {
  setDepth(store().get().doc.layers[0].id, depth);
  addCamera();
  setView({ x: 120, y: 40, zoom: 2, rotation: 20 });
  store().setUi({ activeLayerId: store().get().doc.layers[0].id });
  toggleThroughCamera(true);
};

describe('overlayCamera', () => {
  it('is null with no camera, whatever the tool', () => {
    expect(overlayCamera(false)).toBeNull();
    expect(overlayCamera(true)).toBeNull();
  });

  it('is the picked layer at its own speed for drawing tools, and the plain camera for stage tools', () => {
    lookThrough(1);
    const plain = canvasCamera()!.matrix;
    const layer = overlayCamera(false)!;
    expect(layer).toEqual(canvasLayerCamera());
    expect(layer).not.toEqual(plain);
    expect(overlayCamera(true)).toEqual(plain);
    // Bone, pose, hand and the like are the stage tools.
    expect(STAGE_TOOLS.has('hand') && STAGE_TOOLS.has('eyedropper') && !STAGE_TOOLS.has('pencil')).toBe(true);
  });

  it('is the same matrix for both on the stage (depth 0)', () => {
    lookThrough(0);
    expect(overlayCamera(false)).toEqual(overlayCamera(true));
  });
});

describe('the eyedropper on a layer at another depth', () => {
  it('reads the picture where the pointer is, through the camera', async () => {
    const { sampleColor } = await import('../../src/tools/eyedropper');
    lookThrough(1);
    const cam = canvasCamera()!.matrix;
    // The pointer is over screen point (60, 30): the stage point the engine hands the stage tool is that point put back through the plain camera.
    const screen = { x: 60, y: 30 };
    const [a, b, c, d, e, f] = cam;
    const det = a * d - b * c;
    const stage = { x: (d * (screen.x - e) - c * (screen.y - f)) / det, y: (-b * (screen.x - e) + a * (screen.y - f)) / det };
    expect(applyMat(cam, stage.x, stage.y).x).toBeCloseTo(60);
    expect(sampleColor(stage.x, stage.y, false)).toBe('#0a141e');
    expect(seen.at(-1)!.opts).toMatchObject({ camera: true });
    // The one pixel read is the one under the pointer on screen, not under the stage point.
    expect(fake.last![4]).toBeCloseTo(0.5 - 60);
    expect(fake.last![5]).toBeCloseTo(0.5 - 30);
  });

  it('is unchanged when the canvas is not looking through the camera', async () => {
    const { sampleColor } = await import('../../src/tools/eyedropper');
    lookThrough(1);
    toggleThroughCamera(false);
    expect(sampleColor(60, 30, true)).toBe('#0a141e');
    expect(seen.at(-1)!.opts).toMatchObject({ camera: false });
    expect(fake.last![4]).toBeCloseTo(0.5 - 60);
    expect(fake.last![5]).toBeCloseTo(0.5 - 30);
  });
});
