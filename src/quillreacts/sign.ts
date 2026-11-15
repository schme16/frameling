// What a viewer's words become before they can be near the screen. This is the one place chat text is touched: it is
// cut short, stripped to plain text and checked, and it only ever reads the `text` of what came in. Nothing here keeps
// the words, and nothing reads a name: a sender in the body is ignored, never looked at.

/** The most a sign may say, in characters. Short on purpose: a sign is a few words, not a paragraph. */
export const SIGN_MAX = 60;

/** How much of what came in is even looked at. Anything longer is cut first, so rubbish is cheap to throw away. */
const LOOKED_AT = 400;

// Web addresses, with or without a scheme. A link has no business on someone else's stream.
const LINKS = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S*|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|tv|gg|io|ly|me|co|xyz|ru|cn|to|app|dev|uk|au|de)\b\S*/gi;
// @mentions: they name people.
const MENTIONS = /@\w+/g;
// Plain text: letters and digits of any language, spaces, and ordinary punctuation. Everything else goes, which takes
// emoji, symbols, brackets, markup characters, control and zero-width marks, text-direction marks and stray accents.
const NOT_PLAIN = /[^\p{L}\p{N} .,!?'’":;()\-&+%#$*/~]/gu;
// Any one character repeated more than three times in a row.
const RUNS = /(.)\1{3,}/gsu;

/** One sign's words, or null when nothing worth showing is left. Pure. */
export function cleanSign(raw: unknown): { text: string } | null {
  const v = typeof raw === 'string' ? raw : raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { text?: unknown }).text : undefined;
  if (typeof v !== 'string') return null;
  const text = Array.from(
    v
      .slice(0, LOOKED_AT)
      .normalize('NFC')
      .replace(LINKS, ' ')
      .replace(MENTIONS, ' ')
      .replace(/[\s ]+/g, ' ')
      .replace(NOT_PLAIN, '')
      .replace(RUNS, '$1$1$1')
      .replace(/ {2,}/g, ' ')
      .trim(),
  )
    .slice(0, SIGN_MAX)
    .join('')
    .trim();
  // Needs a real letter or digit: a sign that is all punctuation says nothing.
  return /[\p{L}\p{N}]/u.test(text) ? { text } : null;
}
