// Hooks for the shot scripts and local checks, only with ?debug in the page address (see src/renderer/debug.ts).
import { submitAudience } from '../audience';
import { react } from './react';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingQuillReacts: unknown }).__framelingQuillReacts = {
    react: (which: Parameters<typeof react>[0]) => react(which),
    submit: submitAudience,
  };
}
