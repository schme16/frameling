// With ?debug in the page address, expose the pixel ways for help pictures, A/B shots and checks. Never on in normal use.
import { store } from '../core/store';
import { openChangeWay } from './ChangeWay';
import { openPixelChooser } from './Chooser';
import { askAboutKeys } from './keysAsk';
import { setPixelSettings } from './settings';
import { setShapeFilledSource } from '../tools/pixelWells';
import { changeWay, makeItMove } from './wayOps';
import { line, lineIds, type LineId } from '../ui/mascot/lines';
import { moment } from './moments';
import { newSpriteDoc, wayOf } from './way';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingPixel: unknown }).__framelingPixel = {
    /** Loads a ready sprite of a way (a size in art pixels). */
    newSprite: (way: 'picture' | 'animation' | 'boards' | 'sheet', size = 32, name?: string) => store().load(newSpriteDoc({ way, width: size, height: size, name })),
    openChooser: openPixelChooser,
    openChangeWay,
    changeWay,
    makeItMove,
    way: () => wayOf(store().get().doc),
    /** Turns the "ask once" questions back on for a picture of them (they are skipped under ?debug). */
    ask: (on = true) => void ((globalThis as { __framelingAsk?: boolean }).__framelingAsk = on),
    askKeys: askAboutKeys,
    /** Says one of Quill's moments as the real thing does (a toast with a tiny Quill), for the dialogue review shots. */
    say: (lineId: string, vars?: Record<string, string>) => {
      const ids = lineIds() as string[];
      if (!ids.includes(lineId)) return false;
      return moment(`shot-${lineId}-${Date.now()}`, () => line(lineId as LineId, vars), 'session');
    },
    /** Pixel tool settings (mirror, filled shapes...), as if set in the options. */
    settings: setPixelSettings,
    /** What the inside of a shape is filled with: nothing, Paint or Back (for the A/B in brand/ab/pixel-build-shapes). */
    shapeFill: (v: 'none' | 'paint' | 'back') => setShapeFilledSource(() => (v === 'back' ? 'back' : v === 'paint')),
  };
}
