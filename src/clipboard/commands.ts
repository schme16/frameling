/**
 * Copy and paste with the rest of the computer, and between vector and pixel layers.
 *
 * Copy still keeps Frameling's own copy (which holds everything: curves, groups, layers of colour), and now also puts a
 * picture of it on the system clipboard, so Ctrl+V in a chat or another app pastes it. Paste looks at the system
 * clipboard first: a picture put there by another app is pasted in; if it is Frameling's own, the richer copy is used.
 * A copy of the other kind is converted to fit the layer, and a toast says plainly what was changed.
 */
import { registerChoice, withChoice } from '../core/choices';
import { getCommand, registerCommand, registerCommands } from '../core/registry';
import { store } from '../core/store';
import { freeSymbolName } from '../core/symbols';
import { toast } from '../ui/toast';
import { clipboardHasShapes, pasteFromClipboard } from '../tools/clipboard';
import { activeLayer, editActiveDrawing, EDIT_HINTS } from '../tools/edit';
import { selectedShapes } from '../tools/edit-commands';
import { trimPixels } from '../core/pixelBounds';
import { reduceToPalette, docPalette, paletteRgb } from '../pixel/palette';
import { decodePicture, PictureProblem } from '../pixel/import/picture';
import { cancelFloating, activePixelGrid, floatPixels, PIXEL_SELECT_TOOL } from '../select/pixel-state';
import { isPixelSelectTool } from '../select/ways';
import { maskEmpty, maskFromAlpha } from '../select/mask';
import { pixelClipboard } from '../select/commands';
import type { Doc, PixelLayer, Shape } from '../core/format';
import { pictureSymbol, shapesToPicture, shapesToPixels, shapesToSvg, toPng } from './convert';
import { copyScale, decidePaste, fitPicture, placeOnGrid, sayPicture, sayPixelsToPicture, sayShapesToPixels, upscalePixels, type BigPicture, type Copied } from './plan';
import { canReadSystem, readSystemPicture, type SystemPicture, writeSystemPicture, writeSystemText } from './system';

registerChoice<BigPicture>({
  id: 'clipboard.bigPicture',
  title: 'Pasting a picture bigger than the page',
  question: 'This picture is bigger than the layer. Shrink it to fit, or keep its size and cut off what hangs over?',
  options: [
    { value: 'shrink', label: 'Shrink it to fit', did: 'Shrank the picture to fit.', detail: 'The whole picture stays, smaller, with its shape kept. A picture that already fits is never made bigger.' },
    { value: 'crop', label: 'Keep its size, cut the edges', did: 'Kept its size and cut off the edges.', detail: 'It stays at its own size, centred, so the edges that hang over the page are cut off.' },
  ],
  default: 'shrink',
  category: 'Edit',
  help: 'clipboard-system',
});

const say = (msg: string, kind: 'info' | 'warn' = 'info'): void => void toast(msg, { kind, duration: 9000 });

// ---------------------------------------------------------------- copy out

let lastCopied: Copied | null = null;
/** The write to the system clipboard that is still under way, so a paste straight after a copy waits for it. */
let writing: Promise<unknown> | null = null;
const writeThen = (p: Promise<unknown>): void => {
  const mine: Promise<unknown> = p.finally(() => {
    if (writing === mine) writing = null;
  });
  writing = mine;
};

/** For tests and the harness. */
export const lastCopiedKind = (): Copied | null => lastCopied;
export function _forgetCopies(): void {
  lastCopied = null;
}

const onPixel = (): boolean => !!activePixelGrid();

/** The pixels as a picture other apps can take: only the part that shows, at the size they are on the page. */
export function pixelsToPictureBytes(pixels: Uint8ClampedArray, w: number, h: number, pixelSize: number): Uint8Array | null {
  const t = trimPixels(pixels, w, h);
  if (t.width <= 0 || t.height <= 0) return null;
  const k = copyScale(t.width, t.height, pixelSize);
  return toPng({ width: t.width * k, height: t.height * k, pixels: upscalePixels(t.pixels, t.width, t.height, k) });
}

function putShapes(shapes: Shape[]): void {
  const pic = shapesToPicture(store().get().doc, shapes);
  if (pic) writeThen(writeSystemPicture(toPng(pic)));
}

function putPixels(): void {
  const c = pixelClipboard();
  const png = c && pixelsToPictureBytes(c.pixels, c.width, c.height, c.pixelSize);
  if (png) writeThen(writeSystemPicture(png));
}

/** Wraps Copy or Cut so they also fill the system clipboard and remember which kind of thing was copied last. */
function wrapCopy(id: 'edit.copy' | 'edit.cut'): void {
  const orig = getCommand(id);
  if (!orig) return;
  registerCommand({
    ...orig,
    run: () => {
      const pixels = onPixel();
      // A cut takes the shapes off the canvas, so they are read first.
      const shapes = pixels ? [] : selectedShapes();
      orig.run();
      if (pixels) {
        if (pixelClipboard()) {
          lastCopied = 'pixels';
          putPixels();
        }
      } else if (shapes.length) {
        lastCopied = 'shapes';
        putShapes(shapes);
      }
    },
  });
}

// ---------------------------------------------------------------- paste in

/** Puts lifted pixels on the layer, ready to drag, with the Select tool picked so they can be moved. */
function liftOnLayer(pixels: Uint8ClampedArray, label: string): boolean {
  const a = activePixelGrid();
  if (!a) return false;
  const mask = maskFromAlpha(pixels, a.width, a.height);
  if (maskEmpty(mask)) return false;
  if (!isPixelSelectTool(store().get().ui.tool)) store().setUi({ tool: PIXEL_SELECT_TOOL });
  return floatPixels(pixels, mask, label);
}

/** A picture of pixels placed on the active vector layer as a symbol of pixels you can move, turn and resize. */
function placePicture(pixels: Uint8ClampedArray, gw: number, gh: number, pixelSize: number, label: string): boolean {
  const doc = store().get().doc;
  const sym = pictureSymbol(pixels, gw, gh, pixelSize, freeSymbolName(doc, 'Picture'));
  if (!sym) return false;
  const r = editActiveDrawing(
    label,
    'vector',
    (d, draft) => {
      draft.drawings[sym.drawing.id] = sym.drawing;
      (draft.symbols ??= {})[sym.symbolId] = sym.symbol;
      d.shapes.push(sym.instance);
    },
    { adds: true },
  );
  if (r !== 'ok') {
    say(EDIT_HINTS[r], 'warn');
    return false;
  }
  store().setUi({ selection: [sym.instance.id], tool: 'select' });
  return true;
}

async function pastePicture(png: Uint8Array): Promise<void> {
  let pic;
  try {
    pic = await decodePicture(png);
  } catch (e) {
    return say(e instanceof PictureProblem ? e.message : 'Frameling could not read the picture on the clipboard.', 'warn');
  }
  const frame = pic.frames[0];
  if (!frame) return;
  const { layer } = activeLayer();
  if (!layer || (layer.kind !== 'pixel' && layer.kind !== 'vector')) return;
  const doc = store().get().doc;
  const pixelLayer = layer.kind === 'pixel';
  const grid = pixelLayer ? activePixelGrid()! : { width: doc.width, height: doc.height };
  const gw = grid.width;
  const gh = grid.height;
  const pixelSize = pixelLayer ? (layer as PixelLayer).pixelSize : 1;
  const big = pic.width > gw || pic.height > gh;
  const go = (mode: BigPicture): void => {
    const fit = fitPicture(pic.width, pic.height, gw, gh, mode);
    let px = placeOnGrid(frame.pixels, pic.width, pic.height, gw, gh, fit);
    let lock: { changed: number } | null = null;
    if (pixelLayer && (layer as PixelLayer).paletteLock) {
      const r = reduceToPalette(px, paletteRgb(docPalette(store().get().doc).colors));
      px = r.pixels;
      lock = { changed: r.changed };
    }
    const done = pixelLayer ? liftOnLayer(px, 'Paste picture') : placePicture(px, gw, gh, pixelSize, 'Paste picture');
    if (!done) return say('Nothing of that picture shows on this layer.', 'warn');
    say(sayPicture({ from: { w: pic.width, h: pic.height }, fit, into: pixelLayer ? 'pixel' : 'vector', lock }));
  };
  // Same place and size whichever way it goes when the picture fits, so nothing is asked then.
  withChoice<BigPicture>('clipboard.bigPicture', go, { matters: big, gently: { undo: () => (pixelLayer ? cancelFloating() : store().undo()) } });
}

function pasteShapesOnPixelLayer(): void {
  const a = activePixelGrid();
  if (!a) return;
  const shapes = pasteFromClipboard(null);
  if (!shapes.length) return;
  const doc = store().get().doc;
  const locked = !!a.layer.paletteLock;
  const r = shapesToPixels(doc, shapes, { width: a.width, height: a.height, pixelSize: a.layer.pixelSize }, locked);
  if (!liftOnLayer(r.pixels, 'Paste shapes as pixels')) return say('What you copied is off the edge of the page, so none of it landed on this layer.', 'warn');
  say(sayShapesToPixels({ count: shapes.length, pixelSize: a.layer.pixelSize, locked, offPage: r.offPage, instances: shapes.some((s) => s.type === 'instance') }));
}

function pastePixelsOnVectorLayer(): void {
  const c = pixelClipboard();
  if (!c) return;
  if (!placePicture(c.pixels, c.width, c.height, c.pixelSize, 'Paste pixels as a picture')) return say('There were no pixels in what you copied.', 'warn');
  const t = trimPixels(c.pixels, c.width, c.height);
  say(sayPixelsToPicture({ width: t.width, height: t.height, pixelSize: c.pixelSize }));
}

function pasteWith(sys: SystemPicture | null): void {
  const { layer, problem } = activeLayer();
  if (!layer || (layer.kind !== 'vector' && layer.kind !== 'pixel')) return say('Pasting needs a vector or pixel layer. Pick one in the timeline first.');
  if (problem) return say(EDIT_HINTS[problem]);
  const use = decidePaste({ layer: layer.kind, external: !!sys && !sys.ours, lastCopied, haveShapes: clipboardHasShapes(), havePixels: !!pixelClipboard() });
  if (use === 'nothing') return say('There is nothing to paste yet. Copy something in Frameling, or a picture from another app, and try again.');
  if (use === 'picture') return void pastePicture(sys!.png);
  if (use === 'shapes') return layer.kind === 'vector' ? previousPaste() : pasteShapesOnPixelLayer();
  return layer.kind === 'pixel' ? previousPaste() : pastePixelsOnVectorLayer();
}

/** Paste: looks at the system clipboard first (waiting for a copy of our own that is still being put there), then pastes the right thing. */
export function pasteAnything(): void {
  // With no clipboard to ask (tests, a bare page) there is nothing to wait for, so it happens at once.
  if (!canReadSystem()) return pasteWith(null);
  void (async () => {
    if (writing) await writing;
    pasteWith(await readSystemPicture());
  })();
}

let previousPaste: () => void = () => undefined;

function wrapPaste(): void {
  const orig = getCommand('edit.paste');
  if (!orig) return;
  previousPaste = () => orig.run();
  registerCommand({
    ...orig,
    description: 'Paste what you copied: shapes, pixels, or a picture from another app. Shapes pasted on a pixel layer become pixels, and pixels pasted on a vector layer become a picture.',
    enabled: () => {
      const l = activeLayer().layer;
      return l?.kind === 'vector' || l?.kind === 'pixel';
    },
    run: pasteAnything,
  });
}

// ---------------------------------------------------------------- copy as SVG

const hasVectorSelection = (): boolean => !onPixel() && selectedShapes().length > 0;

function copySvg(): void {
  const doc: Doc = store().get().doc;
  const out = shapesToSvg(doc, selectedShapes());
  if (!out) return say('There is nothing in the selection that can be written as SVG.', 'warn');
  writeThen(writeSystemText(out.svg));
  say(out.left ? `Copied as SVG text. ${out.left === 1 ? 'One thing' : `${out.left} things`} in the selection (a symbol, say) couldn't be written as SVG, so ${out.left === 1 ? 'it was' : 'they were'} left out.` : 'Copied as SVG text. Paste it into a code editor, or an app that reads SVG, such as Inkscape or Figma.');
}

wrapCopy('edit.copy');
wrapCopy('edit.cut');
wrapPaste();
registerCommands([
  {
    id: 'edit.copySvg',
    label: 'Copy as SVG',
    category: 'Edit',
    description: 'Copy the selected shapes as SVG text, for pasting into another app (Inkscape, Figma, a code editor). Ctrl+C already copies a picture of them.',
    help: 'clipboard-system',
    keywords: ['clipboard', 'svg', 'vector', 'export', 'copy to another app', 'illustrator', 'inkscape'],
    enabled: hasVectorSelection,
    run: copySvg,
  },
]);
