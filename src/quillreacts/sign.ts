// What a viewer's words become before they can be near the screen, for a sign: the shared cleaner (src/audience/cleanText.ts)
// cut to a few words. Nothing here keeps the words, and nothing reads a name.
import { cleanChatText } from '../audience/cleanText';

/** The most a sign may say, in characters. Short on purpose: a sign is a few words, not a paragraph. */
export const SIGN_MAX = 60;

/** One sign's words, or null when nothing worth showing is left. Pure. */
export const cleanSign = (raw: unknown): { text: string } | null => cleanChatText(raw, SIGN_MAX);
