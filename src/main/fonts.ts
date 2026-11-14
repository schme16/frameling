// The fonts installed on this computer, by what their files say about themselves, so Illustrator text can be saved with the
// font's real PostScript name. Looked at the first time somebody asks and kept until the app closes.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { facesOfTables, pickFace, type FontFace } from '../fonts/fontnames';

export interface FontWant {
  family: string;
  weight: number;
  italic: boolean;
}

const FONT_FILE = /\.(ttf|otf|ttc|otc)$/i;

function fontFolders(): string[] {
  const home = os.homedir();
  if (process.platform === 'darwin') return ['/System/Library/Fonts', '/Library/Fonts', path.join(home, 'Library/Fonts')];
  if (process.platform === 'win32') {
    return [path.join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData/Local'), 'Microsoft/Windows/Fonts')];
  }
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(home, '.fonts'), path.join(home, '.local/share/fonts')];
}

function walk(dir: string, out: string[], depth = 0): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth < 6) walk(p, out, depth + 1);
    } else if (FONT_FILE.test(e.name)) out.push(p);
  }
}

/** Linux: fontconfig knows every folder it was set up with, so ask it for the files. */
function fontconfigFiles(): Promise<string[] | null> {
  if (process.platform !== 'linux') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile('fc-list', ['--format', '%{file}\\n'], { maxBuffer: 64 * 1024 * 1024, timeout: 15000 }, (err, out) => {
      if (err) return resolve(null);
      const files = [...new Set(out.split('\n').filter((f) => FONT_FILE.test(f)))];
      resolve(files.length ? files : null);
    });
  });
}

/** The tables a face needs (names, weight, slant, variable styles) from a font file, reading only those parts of it. */
function facesOfFile(file: string): FontFace[] {
  const out: FontFace[] = [];
  let fd = -1;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const read = (at: number, len: number) => {
      const n = Math.max(0, Math.min(len, size - at));
      const b = Buffer.alloc(n);
      fs.readSync(fd, b, 0, n, at);
      return new Uint8Array(b.buffer, b.byteOffset, n);
    };
    const head = read(0, 16 + 4 * 64);
    const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const tag = String.fromCharCode(head[0], head[1], head[2], head[3]);
    const offsets: number[] = [];
    if (tag === 'ttcf') for (let i = 0; i < Math.min(64, dv.getUint32(8)); i++) offsets.push(dv.getUint32(12 + i * 4));
    else offsets.push(0);
    for (const at of offsets) {
      const dir = read(at, 12);
      const count = new DataView(dir.buffer, dir.byteOffset, dir.byteLength).getUint16(4);
      const recs = read(at + 12, count * 16);
      const rv = new DataView(recs.buffer, recs.byteOffset, recs.byteLength);
      const tables = new Map<string, Uint8Array>();
      for (let i = 0; i < count; i++) {
        const t = String.fromCharCode(recs[i * 16], recs[i * 16 + 1], recs[i * 16 + 2], recs[i * 16 + 3]);
        if (t === 'name' || t === 'OS/2' || t === 'head' || t === 'fvar') tables.set(t, read(rv.getUint32(i * 16 + 8), t === 'OS/2' || t === 'head' ? 96 : rv.getUint32(i * 16 + 12)));
      }
      out.push(...facesOfTables(tables));
    }
  } catch {
    // an unreadable or broken file has nothing to offer
  } finally {
    if (fd >= 0) fs.closeSync(fd);
  }
  return out;
}

let index: Promise<FontFace[]> | null = null;

function installedFaces(): Promise<FontFace[]> {
  index ??= (async () => {
    let files = await fontconfigFiles();
    if (!files) {
      files = [];
      for (const f of fontFolders()) walk(f, files);
    }
    const faces: FontFace[] = [];
    for (const f of files) faces.push(...facesOfFile(f));
    return faces;
  })();
  return index;
}

/** The PostScript name of each wanted font as installed here (null where that font is not installed). */
export async function psNamesFor(wants: FontWant[]): Promise<(string | null)[]> {
  const faces = await installedFaces();
  return wants.map((w) => {
    if (!w || typeof w.family !== 'string' || typeof w.weight !== 'number') return null;
    return pickFace(faces, w.family, w.weight, !!w.italic)?.ps ?? null;
  });
}
