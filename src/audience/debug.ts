// Hooks for the shot scripts and local checks, only with ?debug in the page address (see src/renderer/debug.ts).
import { audience, registerAudienceAction, setAudienceOn, submitAudience } from './index';
import { limitsFor } from './gate';
import { setChoice } from '../core/choices';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  let demoed = false;
  (window as unknown as { __framelingAudience: unknown }).__framelingAudience = {
    audience,
    submit: submitAudience,
    // Pretend actions, so the pill and the queue have something to show. They change nothing.
    demo: () => {
      if (demoed) return;
      demoed = true;
      const none = () => undefined;
      registerAudienceAction({ id: 'demo.cheer', label: 'Quill cheers', kind: 'quill', cooldown: 0, run: none });
      registerAudienceAction({ id: 'demo.hop', label: 'Quill hops about', kind: 'quill2', cooldown: 0, run: none });
      registerAudienceAction({ id: 'demo.flip', label: 'Flip the view for a while', kind: 'dare', cooldown: 0, run: none });
      registerAudienceAction({ id: 'demo.banner', label: 'Show a challenge banner', kind: 'banner', cooldown: 0, run: none });
      registerAudienceAction({ id: 'demo.snack', label: 'Give Quill a snack', kind: 'snack', cooldown: 0, run: none });
    },
    // Switches on without asking how careful, and fills a few of the queue.
    on: (n = 0) => {
      setChoice('audience.strictness', 'balanced');
      setAudienceOn(true);
      const ids = ['demo.cheer', 'demo.hop', 'demo.flip', 'demo.banner', 'demo.snack'];
      for (let i = 0; i < n; i++) submitAudience(ids[i % ids.length]);
    },
    limits: (name: string) => limitsFor(name),
  };
}
