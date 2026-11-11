/**
 * The mouth chart (phoneme chart): the ten mouth shapes animators use for speech, and how they map onto whatever names
 * a mouth symbol's frames carry.
 */

export type Mouth = 'rest' | 'A' | 'E' | 'O' | 'U' | 'MBP' | 'FV' | 'L' | 'WQ' | 'etc';

export interface MouthInfo {
  id: Mouth;
  /** The name on the chart, and on the frame of the mouth symbol (the Lip sync template uses these). */
  label: string;
  /** Plain words: what makes the mouth do this. */
  sounds: string;
  /** Names a symbol's frames might use for it, compared ignoring case, spaces and punctuation. First is the best match. */
  aliases: string[];
  /** Other chart shapes to use when the symbol has no frame for this one, in order. */
  fallbacks: Mouth[];
}

export const CHART: MouthInfo[] = [
  { id: 'rest', label: 'Rest', sounds: 'Not talking: a relaxed, closed mouth.', aliases: ['rest', 'neutral', 'silence', 'x', 'idle', 'closed', 'sil'], fallbacks: ['MBP'] },
  { id: 'A', label: 'A I', sounds: 'Wide open: "ah", "eye", "i".', aliases: ['ai', 'a', 'ah', 'aa', 'i'], fallbacks: ['E', 'O'] },
  { id: 'E', label: 'E', sounds: 'Smiling, teeth showing: "ee", "eh".', aliases: ['e', 'ee', 'eh'], fallbacks: ['A', 'etc'] },
  { id: 'O', label: 'O', sounds: 'A round mouth: "oh".', aliases: ['o', 'oh', 'ow'], fallbacks: ['U', 'A'] },
  { id: 'U', label: 'U', sounds: 'Small and pursed: "oo", "you".', aliases: ['u', 'oo', 'uh'], fallbacks: ['O', 'WQ'] },
  { id: 'MBP', label: 'M B P', sounds: 'Lips pressed together: "m", "b", "p".', aliases: ['mbp', 'mb', 'm', 'b', 'p', 'lipsclosed', 'closed', 'pressed'], fallbacks: ['rest'] },
  { id: 'FV', label: 'F V', sounds: 'Top teeth on the bottom lip: "f", "v".', aliases: ['fv', 'f', 'v', 'teethlip'], fallbacks: ['etc', 'E'] },
  { id: 'L', label: 'L', sounds: 'Tongue up behind the teeth: "l", "th".', aliases: ['l', 'th', 'lth', 'tongue'], fallbacks: ['etc', 'E'] },
  { id: 'WQ', label: 'W Q', sounds: 'Lips pushed out in a small circle: "w", "q", "oo" at the start.', aliases: ['wq', 'w', 'q', 'ooh', 'pucker'], fallbacks: ['O', 'U'] },
  { id: 'etc', label: 'etc', sounds: 'Everything else: "c", "d", "g", "k", "n", "r", "s", "t", "y", "z".', aliases: ['etc', 'other', 'cdgknrstyz', 'consonant', 'consonants', 'cons', 'misc'], fallbacks: ['E', 'A'] },
];

export const MOUTHS: Mouth[] = CHART.map((m) => m.id);

export const mouthInfo = (m: Mouth): MouthInfo => CHART.find((c) => c.id === m)!;

/** A frame label with case, spaces and punctuation taken out, for comparing ("M B P" and "mbp" are the same). */
export const normLabel = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The frame to use for a mouth in a symbol with these frame labels: an exact name first, then the aliases, then the
 * fallbacks (for example "W Q" becomes "O" then "U"), then the first frame. Returns the frame index.
 */
export function frameForMouth(labels: readonly string[], mouth: Mouth): number {
  const norm = labels.map(normLabel);
  const seen = new Set<Mouth>();
  const tryMouth = (m: Mouth): number => {
    if (seen.has(m)) return -1;
    seen.add(m);
    const info = mouthInfo(m);
    for (const a of [normLabel(info.label), ...info.aliases]) {
      const i = norm.indexOf(a);
      if (i >= 0) return i;
    }
    for (const f of info.fallbacks) {
      const i = tryMouth(f);
      if (i >= 0) return i;
    }
    return -1;
  };
  const i = tryMouth(mouth);
  return i >= 0 ? i : 0;
}

/** The chart shape a frame label stands for, or null when it matches none (so the editor can show it as a plain name). */
export function mouthForLabel(label: string): Mouth | null {
  const n = normLabel(label);
  for (const m of CHART) if (normLabel(m.label) === n) return m.id;
  for (const m of CHART) if (m.aliases.includes(n)) return m.id;
  return null;
}
