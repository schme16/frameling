// The little cheers: a one-word "Nice!" when a step is ticked, and the badge card (with confetti) when a quest is
// finished. Plain state the components read; the runtime fills it in from engine events.
import { lines } from '../ui/mascot/lines';
import { createStore } from '../ui/mini';
import type { Badge, Quest } from './types';

export interface Celebration {
  key: number;
  quest: Quest;
  badge: Badge | null;
  /** Show a still badge instead of confetti (people who asked for less motion). */
  still: boolean;
}

export interface Feedback {
  praise: { key: number; text: string } | null;
  celebration: Celebration | null;
}

export const feedback = createStore<Feedback>({ praise: null, celebration: null });

const WORDS = lines('quests.praise');
let key = 0;
let praiseTimer: ReturnType<typeof setTimeout> | null = null;
let partyTimer: ReturnType<typeof setTimeout> | null = null;

export function praise(): void {
  if (praiseTimer) clearTimeout(praiseTimer);
  const k = ++key;
  feedback.set((f) => ({ ...f, praise: { key: k, text: WORDS[k % WORDS.length] } }));
  praiseTimer = setTimeout(() => feedback.set((f) => ({ ...f, praise: null })), 1800);
}

export function celebrate(quest: Quest, badge: Badge | null, still: boolean, ms = 9000): void {
  if (partyTimer) clearTimeout(partyTimer);
  feedback.set((f) => ({ ...f, praise: null, celebration: { key: ++key, quest, badge, still } }));
  partyTimer = setTimeout(dismissCelebration, ms);
}

export function dismissCelebration(): void {
  if (partyTimer) clearTimeout(partyTimer);
  partyTimer = null;
  feedback.set((f) => (f.celebration ? { ...f, celebration: null } : f));
}

/** A soft three-note chime, only when sounds are on in Preferences. Silent where there's no audio. */
let audio: AudioContext | null = null;
export function chime(): void {
  if (typeof AudioContext === 'undefined') return;
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    [523.25, 659.25, 783.99].forEach((hz, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = 'sine';
      o.frequency.value = hz;
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.07, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.5);
      o.connect(g).connect(audio!.destination);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.55);
    });
  } catch {
    // No audio here. Fine.
  }
}
