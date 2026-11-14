// Resets the state that lives outside the store and belongs to one drawing (see src/core/fresh.ts) whenever the store
// loads a drawing: New, Open, a template, an import, Close drawing.
import { resetDrawingState } from '../core/fresh';
import { store } from '../core/store';

export { resetDrawingState };

/** Hooks the current store. Returns the way to stop. */
export function installDrawingReset(): () => void {
  return store().onLoad(resetDrawingState);
}
