/**
 * A dotLottie file (`.lottie`): the Lottie animation and its pictures in one small zip, the way the dotLottie players
 * (LottieFiles, the web, iOS, Android and Flutter players) take it. Format 1: `manifest.json`, `animations/<id>.json`
 * and `images/<file>`. Pure: Lottie data in, zip bytes out.
 */
import { strFromU8, strToU8, zipSync, type Zippable } from 'fflate';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export interface DotLottieOptions {
  /** Written into the manifest. */
  generator?: string;
  /** Should it play again when it ends? */
  loop?: boolean;
}

const MEDIA = /^data:image\/(png|webp|jpeg|gif);base64,/;
const EXT: Record<string, string> = { png: 'png', webp: 'webp', jpeg: 'jpg', gif: 'gif' };

/** A name that is safe as a file name and as the animation's id. */
export function dotLottieId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'animation'
  );
}

function bytesOf(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Takes the pictures out of the animation (they sit inside it as data addresses) and into `images/`. Pictures that are
 * the same are stored once. Returns the animation to write and the files.
 */
export function splitPictures(data: Json): { animation: Json; images: Map<string, Uint8Array> } {
  const images = new Map<string, Uint8Array>();
  const names = new Map<string, string>();
  const assets = (data.assets ?? []).map((a: Json) => {
    const m = typeof a.p === 'string' ? MEDIA.exec(a.p) : null;
    if (!m) return a;
    let file = names.get(a.p);
    if (!file) {
      file = `image_${names.size}.${EXT[m[1]]}`;
      names.set(a.p, file);
      images.set(file, bytesOf(a.p.slice(m[0].length)));
    }
    const { p: _p, u: _u, e: _e, ...rest } = a;
    return { ...rest, u: '/images/', p: file, e: 0 };
  });
  return { animation: { ...data, assets }, images };
}

/** The zip: manifest first, then the animation, then the pictures (already compressed, so stored as they are). */
export function dotLottieBytes(data: Json, opts: DotLottieOptions = {}): Uint8Array {
  const id = dotLottieId(String(data.nm ?? ''));
  const { animation, images } = splitPictures(data);
  const manifest = {
    version: '1.0',
    generator: opts.generator ?? 'Frameling',
    animations: [{ id, autoplay: true, loop: opts.loop ?? true, speed: 1, direction: 1, playMode: 'normal' }],
  };
  const files: Zippable = {
    'manifest.json': [strToU8(JSON.stringify(manifest)), { level: 6 }],
    [`animations/${id}.json`]: [strToU8(JSON.stringify(animation)), { level: 9 }],
  };
  for (const [name, bytes] of images) files[`images/${name}`] = [bytes, { level: 0 }];
  return zipSync(files);
}

/** What a dotLottie file holds, for checking: the manifest, each animation and the pictures by name. */
export function readDotLottie(bytes: Uint8Array, unzip: (b: Uint8Array) => Record<string, Uint8Array>): { manifest: Json; animations: Record<string, Json>; images: Record<string, Uint8Array> } {
  const entries = unzip(bytes);
  const animations: Record<string, Json> = {};
  const images: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(entries)) {
    if (name.startsWith('animations/') && name.endsWith('.json')) animations[name.slice('animations/'.length, -'.json'.length)] = JSON.parse(strFromU8(data));
    else if (name.startsWith('images/')) images[name.slice('images/'.length)] = data;
  }
  return { manifest: JSON.parse(strFromU8(entries['manifest.json'])), animations, images };
}
