// When animation goes away (Turn animation off, Undo of Add animation, a still opened), a tool that needs it is no use:
// the pointer goes back to Select. Panels need nothing: a still leaves them out of view and the layout keeps their place
// (src/ui/stillZone.ts), so they come back where they were when animation does.
import { isAnimated } from '../core/animation';
import { toolForStill } from '../core/animationOnly';
import { store, type Store } from '../core/store';

/** Watches a store for the tool going stale. The app's own store is watched from the start; a test watches its own. */
export function watchStillTool(s: Store): () => void {
  return s.subscribe(() => {
    const { doc, ui } = s.get();
    const tool = toolForStill(ui.tool, isAnimated(doc));
    if (tool !== ui.tool) s.setUi({ tool });
  });
}

watchStillTool(store());
