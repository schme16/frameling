// Hooks for the shot scripts and local checks, only with ?debug in the page address (see src/renderer/debug.ts).
import { offer, showOffer } from './state';
import type { Release, UpdateFacts } from './logic';

const NOTES = `## What is new

- Turn and flip the view while you draw, so a tricky angle feels natural
- Line things up and space them out evenly
- A window that always keeps its canvas, even on a small screen
- Copy and paste pictures with the rest of your computer

Thank you to everyone who sent a report.`;

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingUpdate: unknown }).__framelingUpdate = {
    // Puts the offer on show for a pretend release. `how` is what this copy can do: appimage, installer or page.
    show: (how: 'appimage' | 'installer' | 'page' = 'appimage', phase?: 'asking' | 'getting' | 'ready' | 'failed') => {
      const release: Release = {
        tag: 'v0.2.0',
        name: 'Frameling 0.2.0',
        notes: NOTES,
        page: 'https://github.com/schme16/frameling/releases/tag/v0.2.0',
        draft: false,
        prerelease: false,
        assets: [],
      };
      const facts: UpdateFacts = { how, beta: false, why: how === 'page' ? 'On a Mac the new app is a download to open and drag over this one. Get it from the page.' : '', version: '0.1.0', platform: 'linux', arch: 'x64', canCheck: true };
      showOffer(release, facts);
      if (phase === 'getting') offer.set((o) => (o ? { ...o, phase: { kind: 'getting', pct: 42 } } : o));
      if (phase === 'ready') offer.set((o) => (o ? { ...o, phase: { kind: 'ready', next: 'restart' } } : o));
      if (phase === 'failed') offer.set((o) => (o ? { ...o, phase: { kind: 'failed', text: "The download stopped part way. Check the internet and try again." } } : o));
    },
    hide: () => offer.set(null),
  };
}
