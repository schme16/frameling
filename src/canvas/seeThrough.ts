// "See-through page": the open page (or artboard) with no background colour. The canvas shows a checkerboard where the
// colour was, and exports keep it see-through (see wantsSeeThrough in src/export/draw.ts).
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { hint } from './controller';

/** The colour to go back to when the page stops being see-through: the one it had, or white. */
let lastColour = '#ffffff';

export function isSeeThrough(): boolean {
  return store().get().doc.background === null;
}

/** Turns the open page see-through, or back to the colour it had. One undo step. */
export function toggleSeeThrough(): void {
  const { doc } = store().get();
  if (doc.editing?.length) {
    hint('Close the symbol you are drawing inside first, then change the page.');
    return;
  }
  if (doc.background !== null) lastColour = doc.background;
  const next = doc.background === null ? lastColour : null;
  store().update(next === null ? 'See-through page' : 'Page colour', (d) => void (d.background = next));
  hint(next === null ? 'The page is see-through now. The checkerboard shows where the colour was, and exports keep it.' : 'The page has its colour back.');
}

registerCommands([
  {
    id: 'document.seeThrough',
    label: 'See-through page',
    category: 'Edit',
    description: 'Take the background colour off the open page, so it shows a checkerboard and exports keep it see-through. Press again for the colour back.',
    help: 'see-through-page',
    keywords: ['transparent', 'transparency', 'background', 'no background', 'checkerboard', 'alpha', 'page colour', 'artboard'],
    checked: () => isSeeThrough(),
    run: () => {
      toggleSeeThrough();
      // Menus read the tick from the store's state, so give them a nudge to look again.
      store().setUi({});
    },
  },
]);
