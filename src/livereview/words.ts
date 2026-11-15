// The words live review says on screen, in one place. Plain words, the industry term second, no em dashes.
export const keepSummary = (n: number): string => (n === 0 ? 'Nothing new to keep.' : n === 1 ? 'Kept 1 comment in your drawing. Undo takes it back.' : `Kept ${n} comments in your drawing. Undo takes them back.`);
/** What the toast says once comments have gone into the drawing by themselves. Says why Undo did not move. */
export const addedSummary = (n: number): string => (n === 1 ? 'A reviewer\'s comment is in your drawing. Your Undo is untouched.' : `${n} reviewer comments are in your drawing. Your Undo is untouched.`);
