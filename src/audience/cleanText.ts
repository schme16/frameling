// What other people's words become before they can be near the screen. This is the one place chat text is cleaned: it
// is cut short, stripped to plain text and checked, and it only ever reads the `text` of what came in. Nothing here
// keeps the words, and nothing reads a name: a sender in the body is ignored, never looked at. Signs, the prompt jar
// and anything later that carries chat's words all go through this, so there is one cleaner to trust and to test.

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

/** Web addresses and @mentions swapped for a space. For the places that clean in their own way but must never show either. */
export const withoutLinksAndMentions = (text: string): string => text.replace(LINKS, ' ').replace(MENTIONS, ' ');

/** Plain words cut to `max` characters (by whole code points), or null when nothing worth keeping is left. Pure. */
export function cleanChatText(raw: unknown, max: number): { text: string } | null {
  const v = typeof raw === 'string' ? raw : raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { text?: unknown }).text : undefined;
  if (typeof v !== 'string') return null;
  const text = Array.from(
    v
      .slice(0, LOOKED_AT)
      .normalize('NFC')
      .replace(LINKS, ' ')
      .replace(MENTIONS, ' ')
      .replace(/[\s\u00a0]+/g, ' ')
      .replace(NOT_PLAIN, '')
      .replace(RUNS, '$1$1$1')
      .replace(/ {2,}/g, ' ')
      .trim(),
  )
    .slice(0, max)
    .join('')
    .trim();
  // Needs a real letter or digit: words that are all punctuation say nothing.
  return /[\p{L}\p{N}]/u.test(text) ? { text } : null;
}
