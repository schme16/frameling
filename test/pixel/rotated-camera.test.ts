// Pixel shapes and strokes through a turned camera: the pointer lands on the grid cell it is over, sizes stay in
// what-you-see terms, and a layer at another depth is aimed at through its own camera speed.
import { asGrid } from '../helpers/grid';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getPx } from '../../src/canvas/pixels';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { addCamera, canvasLayerCamera, setView, toggleThroughCamera } from '../../src/camera/ops';
import { cameraMatrix, layerCameraMatrix } from '../../src/core/camera';
import { applyMat, invert } from '../../src/core/symbols';
import { brushTool } from '../../src/tools/brush';
import { ellipseTool, lineTool, rectTool } from '../../src/tools/shapes';
import { viewPixelSize, viewSizeFactor } from '../../src/tools/view-size';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { DEFAULT_PIXEL_SETTINGS, setPixelSettings } from '../../src/pixel/settings';
import type { Tool } from '../../src/core/registry';
import '../../src/pixel';
import { ctx, drag, pixelStore } from '../tools/helpers';

// 64 x 64 document at 8 per pixel: an 8 x 8 grid.
const PS = 8;
const drawing = () => asGrid(Object.values(store().get().doc.drawings).find((d) => d.kind === 'pixel') as PixelDrawing);
const cells = (): string[] => {
  const d = drawing();
  const out: string[] = [];
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) if (getPx(d.pixels, d.width, x, y)[3] > 0) out.push(`${x},${y}`);
  return out;
};

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS, pixelBrushSize: 1, pixelBrushShape: 'square' });
  setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
  setViewSettings({ perspective: false, snap: false, throughCamera: false, guides: false, grid: 'off' });
  forgetLastPixelEnd();
});

/** A document looking through a camera; the picked layer sits at `depth`. */
function through(view: { x: number; y: number; zoom: number; rotation: number }, depth = 0) {
  const s = pixelStore();
  const layerId = s.get().doc.layers[0].id;
  if (depth) s.update('Depth', (d) => void (d.layers.find((l) => l.id === layerId)!.depth = depth));
  addCamera();
  setView(view);
  s.setUi({ activeLayerId: layerId, color: '#ff0000', fillColor: '#00ff00', strokeOn: true });
  toggleThroughCamera(true);
}

/**
 * What the engine does for a mouse point: screen (camera space) back to stage space through the picked layer's matrix.
 * The mouse is aimed at the middle of cell (cx, cy) as the picture shows it, nudged by `nudge` of a cell on screen.
 */
function aim(cx: number, cy: number, nudge: [number, number] = [0, 0]): [number, number] {
  const m = canvasLayerCamera()!;
  const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const s = applyMat(m, (cx + 0.5) * PS, (cy + 0.5) * PS);
  const p = applyMat(invert(m), s.x + nudge[0] * PS * scale, s.y + nudge[1] * PS * scale);
  return [p.x, p.y];
}

function shapeCells(tool: Tool, pts: [number, number][], nudge: [number, number] = [0, 0]): string[] {
  drag(tool, ctx(), pts.map(([x, y]) => aim(x, y, nudge)));
  return cells();
}

const VIEWS: [string, { x: number; y: number; zoom: number; rotation: number }, number][] = [
  ['turned 30, zoomed 1.5', { x: 32, y: 32, zoom: 1.5, rotation: 30 }, 0],
  ['turned 90', { x: 32, y: 32, zoom: 1, rotation: 90 }, 0],
  ['turned -45 and panned', { x: 40, y: 28, zoom: 2, rotation: -45 }, 0],
  ['turned 25 on a far layer', { x: 36, y: 28, zoom: 2, rotation: 25 }, 1],
  ['turned 60 on a near layer', { x: 30, y: 34, zoom: 1.5, rotation: 60 }, -0.5],
];

describe('the matrix tools use for the picked layer', () => {
  it('is the layer camera matrix, so a layer at another depth is aimed at at its own speed', () => {
    through({ x: 40, y: 20, zoom: 2, rotation: 30 }, 1);
    const s = store().get();
    const layer = s.doc.layers[0];
    const view = { x: 40, y: 20, zoom: 2, rotation: 30 };
    expect(canvasLayerCamera()).toEqual(layerCameraMatrix(s.doc, layer, view));
    expect(canvasLayerCamera()).not.toEqual(cameraMatrix(s.doc, view));
  });

  it('is the plain camera matrix on the camera layer and null with no camera', () => {
    pixelStore();
    expect(canvasLayerCamera()).toBeNull();
    through({ x: 32, y: 32, zoom: 2, rotation: 0 }, 1);
    const cam = store().get().doc.layers.find((l) => l.kind === 'camera')!;
    store().setUi({ activeLayerId: cam.id });
    expect(canvasLayerCamera()).toEqual(cameraMatrix(store().get().doc, { x: 32, y: 32, zoom: 2, rotation: 0 }));
  });
});

describe('sizes through a turned camera', () => {
  it('turning does not change a size, zooming does', () => {
    through({ x: 32, y: 32, zoom: 2, rotation: 37 });
    expect(viewPixelSize(4)).toBe(2);
    expect(viewPixelSize(1)).toBe(1);
  });

  it('uses the layer depth: zoom 4 at depth 1 is a 2x zoom on that layer', () => {
    through({ x: 32, y: 32, zoom: 4, rotation: 20 }, 1);
    expect(viewSizeFactor()).toBeCloseTo(0.5, 6);
    expect(viewPixelSize(4)).toBe(2);
  });
});

describe('pixel shapes through a turned camera land on the cells under the pointer', () => {
  for (const [name, view, depth] of VIEWS) {
    describe(name, () => {
      it('rectangle, ellipse and line match the flat result', () => {
        for (const [tool, pts] of [
          [rectTool, [[2, 2], [6, 5]]],
          [ellipseTool, [[1, 1], [7, 6]]],
          [lineTool, [[1, 6], [6, 1]]],
        ] as [Tool, [number, number][]][]) {
          // Flat reference
          pixelStore();
          setViewSettings({ throughCamera: false });
          store().setUi({ color: '#ff0000', fillColor: '#00ff00', strokeOn: true });
          drag(tool, ctx(), pts.map(([x, y]) => [(x + 0.5) * PS, (y + 0.5) * PS]));
          const flat = cells();
          expect(flat.length).toBeGreaterThan(4);
          through(view, depth);
          expect(shapeCells(tool, pts), `${tool.id}`).toEqual(flat);
          // A pointer anywhere within the cell lands on the same cell, even with the picture turned.
          through(view, depth);
          expect(shapeCells(tool, pts, [0.3, -0.3]), `${tool.id} nudged`).toEqual(flat);
          through(view, depth);
          expect(shapeCells(tool, pts, [-0.3, 0.3]), `${tool.id} nudged back`).toEqual(flat);
        }
      });

      it('a single click paints the cell under the pointer and no other', () => {
        through(view, depth);
        store().setUi({ color: '#0000ff' });
        drag(brushTool, ctx(), [aim(3, 4, [0.2, 0.2]), aim(3, 4, [0.2, 0.2])]);
        expect(cells()).toEqual(['3,4']);
      });
    });
  }
});
