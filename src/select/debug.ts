// With ?debug in the page address, expose a few things for the help pictures and the A/B shots of the selection edge and
// saved selections: a ready picture, a round selection, and a copy and paste at a distance.
import { store } from '../core/store';
import { getCommand } from '../core/registry';
import { newSpriteDoc } from '../pixel/way';
import { setActivePixels } from '../tools/edit';
import { emptyMask, maskCount, rectMask, type Mask } from './mask';
import { loadSelection, savedList, saveSelection } from './saved-commands';
import { applyEdge, type EdgeWay } from './edge';
import { pixelClipboard } from './commands';
import { activePixelGrid, floatingOffset, isFloating, moveFloatingTo, pixelSelection, setPixelSelection } from './pixel-state';

function discMask(w: number, h: number, cx: number, cy: number, r: number): Mask {
  const m = emptyMask(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m.bits[y * w + x] = 1;
  return m;
}

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingSelect: unknown }).__framelingSelect = {
    /** A pixel picture: a pale sky with a sun on the left, a dark purple field on the right. */
    scene(w = 64, h = 40) {
      store().load(newSpriteDoc({ way: 'picture', width: w, height: h, name: 'Sun' }));
      const px = new Uint8ClampedArray(w * h * 4);
      const put = (x: number, y: number, c: number[]) => px.set([...c, 255], (y * w + x) * 4);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (x < w / 2) put(x, y, [196 - y, 226 - y, 255]);
          else put(x, y, [54 + (x % 2) * 6, 38, 94 + (y % 2) * 6]);
        }
      const cx = 16;
      const cy = 18;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= 7) put(x, y, d < 4 ? [255, 236, 120] : [255, 178, 56]);
        }
      setActivePixels('Scene', px);
      store().setUi({ dirty: false });
    },
    /** Selects a round patch, with the sun in the middle and a ring of sky round it. */
    disc(cx = 16, cy = 18, r = 12) {
      const g = activePixelGrid();
      if (g) setPixelSelection(discMask(g.width, g.height, cx, cy, r));
    },
    edge: (way: EdgeWay, px: number) => applyEdge(way, px),
    /** Copies the selection and pastes it in place, lifted. Move it with `move`, land it with `drop`. */
    paste() {
      getCommand('edit.copy')?.run();
      getCommand('edit.paste')?.run();
    },
    move: (dx: number, dy = 0) => moveFloatingTo(dx, dy),
    drop: () => getCommand('select.none')?.run(),
    state: () => ({ floating: isFloating(), off: floatingOffset(), hasCopy: !!getCommand('edit.copy'), clip: !!pixelClipboard() }),
    /** Selects a box of art pixels. */
    box(x0: number, y0: number, x1: number, y1: number) {
      const g = activePixelGrid();
      if (g) setPixelSelection(rectMask(g.width, g.height, x0, y0, x1, y1));
    },
    /** Saves what is selected under a name, and brings back one by name. */
    save: (name: string) => !!saveSelection(name),
    bringBack(name: string, how: 'replace' | 'add' | 'subtract' = 'replace') {
      const s = savedList().find((x) => x.name === name);
      return s ? loadSelection(s.id, how) : null;
    },
    count: () => maskCount(pixelSelection() ?? emptyMask(1, 1)),
  };
}
