// The parts of stream-safe mode that need no switch and no page: what a path becomes, and a sentence with its paths
// swapped out. Always on here. src/core/streamSafe.ts uses them only while its switch is on; the stream overlay
// (src/streamoverlay, src/main) uses them always, because that page is on camera whatever the switch says.
// No React, no Electron, so the desktop side can import it.

const EXT_WORDS: [RegExp, string][] = [
  [/^(frameling|ftemplate)$/, 'drawing'],
  [/^(png|jpe?g|gif|webp|apng|svg|bmp|tiff?|psd|ase|aseprite)$/, 'picture'],
  [/^(wav|mp3|ogg|flac|m4a|aiff?)$/, 'sound'],
  [/^(mp4|webm|mov|mkv|avi)$/, 'video'],
  [/^(zip|tar|gz|7z)$/, 'bundle'],
  [/^(json|gpl|pal|hex)$/, 'file'],
];

/** The kind of thing a path names, from its ending: "drawing", "picture"... or "" when it does not say. */
export function kindOfPath(path: string): string {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(path.replace(/[\\/]+$/, ''));
  if (!m) return '';
  const ext = m[1].toLowerCase();
  return EXT_WORDS.find(([re]) => re.test(ext))?.[1] ?? '';
}

/** The stand-in for a file or folder, always. `kind: 'folder'` for a folder; `n` keeps rows of a list apart. */
export function standInPath(path: string, opts: { kind?: 'file' | 'folder'; n?: number } = {}): string {
  const suffix = opts.n ? ` ${opts.n}` : '';
  if (opts.kind === 'folder') return `A folder${suffix}`;
  const word = kindOfPath(path);
  return word ? `My ${word}${suffix}` : `A file${suffix}`;
}

// Places inside a sentence. Quoted ones may hold spaces; bare ones stop at a space or a closing mark.
const QUOTED = /(["'`])((?:[A-Za-z]:[\\/]|\\\\|~[\\/]|\/(?=[^\s/"'`])|file:\/\/)[^"'`\n]*?[\\/][^"'`\n]*?)\1/g;
const BARE = /(?<![\w/:.-])(?:file:\/\/\/?|[A-Za-z]:[\\/]|\\\\[\w.$-]+\\|~[\\/]|\/(?=[\w.@~+-]+\/))[^\s"'`<>|),;]*/g;

/** True when the text holds something that looks like a place on a computer (a path). */
export function hasPath(text: string): boolean {
  QUOTED.lastIndex = 0;
  BARE.lastIndex = 0;
  return QUOTED.test(text) || BARE.test(text);
}

/** A sentence with every path in it swapped for its stand-in, whatever the switch says. Words with no path come back as they were. */
export function scrubPathsAlways(text: string): string {
  if (!text) return text;
  const stand = (p: string) => {
    const clean = p.replace(/[.:]+$/, '');
    const tail = p.slice(clean.length);
    return standInPath(clean, { kind: /[\\/]$/.test(clean) || !kindOfPath(clean) ? 'folder' : 'file' }) + tail;
  };
  const quoted = (_all: string, q: string, p: string) => `${q}${stand(p)}${q}`;
  return text.replace(QUOTED, quoted).replace(BARE, stand);
}
