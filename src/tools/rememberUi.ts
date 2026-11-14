/**
 * Keeps the brush, the two colours, loop playback and the onion skin from one launch to the next. They sit in the shared
 * UI state, which is rebuilt every launch, so this copies them into the tool settings (src/tools/settings.ts, the same
 * saved options the eraser, pencil and shapes already use) whenever one changes, and puts them back at launch. What
 * is kept, and what is checked on the way back in, is in src/core/uiMemory.ts.
 */
import { currentChoice, registerChoice, setChoice } from '../core/choices';
import { registerCommands } from '../core/registry';
import { initialUi, store } from '../core/store';
import { applyRemembered, readRemembered, rememberedOf, sameRemembered } from '../core/uiMemory';
import { toast } from '../ui/toast';
import { getToolSettings, setToolSettings } from './settings';
import './remember-help';

export type OnionMemory = 'remember' | 'fresh';

registerChoice<OnionMemory>({
  id: 'memory.onion',
  title: 'Onion skin at launch',
  question: 'When Frameling opens, should the onion skin be on if you left it on?',
  options: [
    { value: 'remember', label: 'Yes, as I left it', detail: 'The onion skin comes back on, with the same frames and strength.' },
    { value: 'fresh', label: 'No, start with it off', detail: 'Your frames before and after, and the strength, are still remembered. Only on or off starts off.' },
  ],
  default: 'remember',
  category: 'Drawing',
  help: 'remembered-settings',
  silent: true,
});

/** True when the onion skin should come back on at launch if it was on. */
export const onionComesBack = (): boolean => currentChoice<OnionMemory>('memory.onion') === 'remember';

/** Puts the saved values into the open store, and starts saving every change after that. Called once, at launch. */
export function startRememberingUi(): () => void {
  const s = store();
  const base = rememberedOf(s.get().ui);
  const saved = readRemembered(getToolSettings().remembered, base);
  if (Object.keys(saved).length) s.setUi((ui) => applyRemembered(ui, saved, onionComesBack()));
  let last = rememberedOf(s.get().ui);
  return s.subscribe(() => {
    const now = rememberedOf(s.get().ui);
    if (sameRemembered(last, now)) return;
    last = now;
    setToolSettings({ remembered: now });
  });
}

/** Every remembered thing back to how a new install has it, now and for next time. */
export function forgetDrawingSettings(): void {
  const start = rememberedOf(initialUi(store().get().doc));
  store().setUi(applyRemembered(store().get().ui, start));
  setToolSettings({ remembered: null });
}

registerCommands([
  {
    id: 'settings.rememberOnion',
    label: 'Bring the onion skin back on at launch',
    category: 'Draw',
    description: 'The brush, colours, loop playback and onion skin settings are always remembered. This is only whether the onion skin starts on when you left it on.',
    help: 'remembered-settings',
    keywords: ['onion skin', 'remember', 'launch', 'start', 'restart', 'forget'],
    checked: onionComesBack,
    run: () => {
      const next: OnionMemory = onionComesBack() ? 'fresh' : 'remember';
      setChoice('memory.onion', next);
      toast(next === 'remember' ? 'The onion skin will come back on at launch, if you left it on.' : 'The onion skin will start off at launch.');
    },
  },
  {
    id: 'settings.forgetDrawing',
    label: 'Put the brush, colours, onion skin and looping back to the start',
    category: 'Draw',
    description: 'Forgets what Frameling remembered about your brush, stroke and fill colours, loop playback and onion skin, and goes back to the starting values.',
    help: 'remembered-settings',
    keywords: ['reset', 'forget', 'defaults', 'brush', 'colours', 'colors', 'onion skin', 'loop', 'starting values'],
    run: () => {
      forgetDrawingSettings();
      toast('Brush, colours, onion skin and looping are back to the starting values.');
    },
  },
]);
