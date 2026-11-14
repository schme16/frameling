// The "Save changes?" question, worded once for the window button, Quit, New, Open and Close drawing, so they all ask
// the same thing with the same three answers.
export interface SaveQuestion {
  message: string;
  detail: string;
  buttons: [string, string, string];
}

/** `neverSaved` is a drawing with no file yet: say so, so Save doesn't sound like it writes over something. */
export function saveChangesQuestion(name: string, neverSaved: boolean): SaveQuestion {
  return {
    message: `Save changes to "${String(name).slice(0, 80)}"?`,
    detail: neverSaved
      ? `This drawing hasn't been saved yet, so Save will ask where to put it. If you don't save, your latest changes will be lost.`
      : `If you don't save, your latest changes will be lost.`,
    buttons: ['Save', `Don't save`, 'Cancel'],
  };
}
