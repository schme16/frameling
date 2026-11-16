// The colours of an imported sprite, picked without holding the page up. A big photo brought in as a sprite used to be
// counted in one go on the page; this counts it on a worker in small pieces (see quantiseRun.ts) and the result is
// handed to the builder through BuildOptions.colours. Small sprites are quick, so they skip the worker.
import type { DocPalette } from '../../core/format';
import { paletteOfKeys } from '../palette-io';
import { startScan, type Pixels } from '../quantiseRun';
import { sampledFrames, spritePalette, type Sprite } from './build';

/** The most colours a sprite's palette takes. */
export const SPRITE_COLOURS = 256;
/** Up to this many pixel bytes (about 64 thousand pixels) the pick is quicker done here than handed to a worker. */
export const SMALL_BYTES = 256 * 1024;

/** The pixel arrays the colours come from: the sampled frames, as they are (nothing is copied). */
export function spritePixels(s: Sprite): Pixels[] {
  return sampledFrames(s).map((f) => f.image.pixels);
}

/** True when the sprite is small enough to pick in one go. */
export function isSmall(s: Sprite): boolean {
  return spritePixels(s).reduce((n, a) => n + a.length, 0) <= SMALL_BYTES;
}

/**
 * The palette for a sprite, picked in small steps that give the page back in between. Null when it has no solid
 * colours. `onProgress` gets 0..1. Same colours as spritePalette gives.
 */
export async function pickSpritePalette(s: Sprite, name: string, onProgress?: (fraction: number) => void): Promise<DocPalette | null> {
  if (isSmall(s)) return spritePalette(s, name);
  const scan = startScan(spritePixels(s), onProgress);
  const r = await scan.pick(SPRITE_COLOURS);
  return r.solid === 0 || !r.colours.length ? null : paletteOfKeys(r.colours, name);
}
