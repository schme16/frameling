// A folder or a zip of pictures as frames: which files are pictures, in what order (2 before 10), which belong to the same
// run, and what is missing from it. Pure: names in, a plan out. Reading the bytes and drawing the dialog live elsewhere.

/** What a person calls a picture here. GIF is included (its first picture is used). */
export const SEQUENCE_PICTURE = /\.(png|jpe?g|webp|bmp|gif)$/i;
export const SEQUENCE_ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.gif';

/** The most pictures taken from one folder or zip. */
export const MAX_SEQUENCE = 2000;

const base = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Files a computer makes without being asked: never a frame, and not worth mentioning. */
export function isJunk(path: string): boolean {
  const b = base(path);
  return !b || b.startsWith('.') || b.startsWith('._') || /(^|\/)__MACOSX\//.test(path) || /^(thumbs\.db|desktop\.ini)$/i.test(b);
}

const CHUNK = /(\d+)|(\D+)/g;

/** Orders names the way a person does: by the numbers in them, so frame2 comes before frame10, and capitals don't matter. */
export function naturalCompare(a: string, b: string): number {
  const pa = a.toLowerCase().match(CHUNK) ?? [];
  const pb = b.toLowerCase().match(CHUNK) ?? [];
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === y) continue;
    const nx = /^\d/.test(x);
    const ny = /^\d/.test(y);
    if (nx && ny) {
      // Compare as numbers without ever making one too big to hold: fewer digits (after leading zeros) is smaller.
      const sx = x.replace(/^0+(?=\d)/, '');
      const sy = y.replace(/^0+(?=\d)/, '');
      if (sx.length !== sy.length) return sx.length - sy.length;
      if (sx !== sy) return sx < sy ? -1 : 1;
      // Same number, written differently (01 and 1): the shorter one first.
      return x.length - y.length;
    }
    return x < y ? -1 : 1;
  }
  return pa.length - pb.length || (a < b ? -1 : a > b ? 1 : 0);
}

/** The folder and the name up to the frame number: "walk/run-0012.png" is in the run "walk/run". */
export function runOf(path: string): string {
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  const name = base(path).replace(/\.[^.]+$/, '');
  const stem = name.replace(/[\s._-]*\d+$/, '');
  return dir + stem;
}

/** The number a name ends in, or null. */
export function frameNumberOf(path: string): number | null {
  const m = /(\d+)\.[^.]+$/.exec(base(path));
  return m && m[1].length < 10 ? parseInt(m[1], 10) : null;
}

export interface Run {
  /** Shown to the person: the name the frames share ("walk"), or "Pictures" when they have none. */
  label: string;
  key: string;
  /** In order. */
  paths: string[];
}

export interface Gap {
  /** The numbers that are missing between two pictures, first to last. */
  from: number;
  to: number;
}

export interface SequencePlan {
  /** Every picture, in order, up to the limit. */
  pictures: string[];
  /** Files that are not pictures (named, so it can say so). Junk is left out of this list. */
  others: string[];
  /** Pictures past the limit. */
  overLimit: number;
  /** Groups of pictures that share a name: two or more means the folder holds more than one run. */
  runs: Run[];
  /** Numbers missing from the biggest run. */
  gaps: Gap[];
}

/** Finds the missing numbers in a run of numbered pictures (first to last). */
export function gapsIn(paths: string[]): Gap[] {
  const nums = paths.map(frameNumberOf);
  if (nums.some((n) => n === null)) return [];
  const gaps: Gap[] = [];
  const list = (nums as number[]).slice().sort((a, b) => a - b);
  for (let i = 1; i < list.length; i++) if (list[i] - list[i - 1] > 1) gaps.push({ from: list[i - 1] + 1, to: list[i] - 1 });
  return gaps;
}

/** Sorts and sorts out a list of file names (paths with "/" inside a zip or a folder). */
export function planSequence(names: string[]): SequencePlan {
  const clean = names.filter((n) => !isJunk(n));
  const pics = clean.filter((n) => SEQUENCE_PICTURE.test(n)).sort(naturalCompare);
  const others = clean.filter((n) => !SEQUENCE_PICTURE.test(n)).sort(naturalCompare);
  const overLimit = Math.max(0, pics.length - MAX_SEQUENCE);
  const pictures = pics.slice(0, MAX_SEQUENCE);
  const byRun = new Map<string, string[]>();
  for (const p of pictures) {
    const k = runOf(p);
    byRun.set(k, [...(byRun.get(k) ?? []), p]);
  }
  const runs: Run[] = [...byRun.entries()].map(([key, paths]) => ({ key, label: base(key) || 'Pictures', paths }));
  const biggest = runs.slice().sort((a, b) => b.paths.length - a.paths.length)[0];
  return { pictures, others, overLimit, runs, gaps: biggest ? gapsIn(biggest.paths) : [] };
}

/** Which pictures a choice of run uses: all of them, or one run. */
export function picturesOf(plan: SequencePlan, run: string | 'all'): string[] {
  return run === 'all' ? plan.pictures : (plan.runs.find((r) => r.key === run)?.paths ?? plan.pictures);
}

// ---------------------------------------------------------------- saying it

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** "7", "7 to 9". */
export const gapText = (g: Gap): string => (g.from === g.to ? `${g.from}` : `${g.from} to ${g.to}`);

/** A list of names for a sentence: the first few, then "and 3 more". */
export function nameList(names: string[], show = 4): string {
  const shown = names.slice(0, show).map((n) => base(n));
  return names.length > show ? `${shown.join(', ')} and ${names.length - show} more` : shown.join(', ');
}

export interface FoundFacts {
  picked: string[];
  /** Pictures that could not be read, with the reason. */
  unreadable: { path: string; why: string }[];
  sizes: { width: number; height: number }[];
}

/** What it found, in a sentence or two, for the top of the dialog. */
export function foundSummary(plan: SequencePlan, f: FoundFacts): { found: string; left: string[]; notes: string[] } {
  const bad = new Set(f.unreadable.map((u) => u.path));
  const good = f.picked.filter((p) => !bad.has(p));
  const ok = good.length;
  const first = base(good[0] ?? '');
  const last = base(good[good.length - 1] ?? '');
  const bySize = new Map<string, number>();
  for (const s of f.sizes) bySize.set(`${s.width} x ${s.height}`, (bySize.get(`${s.width} x ${s.height}`) ?? 0) + 1);
  const sizeText = bySize.size === 1 ? `, all ${[...bySize.keys()][0]}` : '';
  const found = ok === 0 ? 'No pictures it could read.' : `${plural(ok, 'picture')}${ok > 1 ? ` (${first} to ${last})` : ` (${first})`}${sizeText}.`;
  const left: string[] = [];
  if (plan.others.length) left.push(`${plural(plan.others.length, 'file')} that ${plan.others.length === 1 ? "isn't" : "aren't"} ${plan.others.length === 1 ? 'a picture' : 'pictures'}: ${nameList(plan.others)}.`);
  if (f.unreadable.length) left.push(`${plural(f.unreadable.length, 'picture')} that couldn't be read: ${f.unreadable.slice(0, 3).map((u) => `${base(u.path)} (${u.why})`).join(', ')}${f.unreadable.length > 3 ? ` and ${f.unreadable.length - 3} more` : ''}.`);
  if (plan.overLimit) left.push(`${plural(plan.overLimit, 'picture')} past the limit of ${MAX_SEQUENCE.toLocaleString('en')}.`);
  const notes: string[] = [];
  if (bySize.size > 1) {
    const sorted = [...bySize.entries()].sort((a, b) => b[1] - a[1]);
    notes.push(`The pictures are not all the same size (${sorted.slice(0, 3).map(([s, n]) => `${n} at ${s}`).join(', ')}${sorted.length > 3 ? ' and more' : ''}). Smaller ones sit in the middle of a frame as big as the biggest.`);
  }
  if (plan.gaps.length) {
    const one = plan.gaps.length === 1 && plan.gaps[0].from === plan.gaps[0].to;
    notes.push(`${one ? 'Number' : 'Numbers'} ${plan.gaps.slice(0, 3).map(gapText).join(', ')}${plan.gaps.length > 3 ? ' and more' : ''} ${one ? 'is' : 'are'} missing from the run, so the animation skips ahead there.`);
  }
  return { found, left, notes };
}

/** Everything it brought in and left out, as the toast and the list say it. Pure, so it is tested. */
export function sequenceReport(name: string, where: 'add' | 'new', frames: number, size: { width: number; height: number }, plan: SequencePlan, unreadable: { path: string; why: string }[], notes: string[]): { headline: string; left: string[]; info: string[] } {
  const f = foundSummary(plan, { picked: plan.pictures, unreadable, sizes: [] });
  const headline = `${where === 'add' ? 'Added' : 'Opened'} "${name}": ${plural(frames, 'frame')} of ${size.width} x ${size.height}.`;
  return { headline, left: f.left, info: [...f.notes.filter((n) => !/same size/.test(n)), ...notes] };
}

