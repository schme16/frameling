// "Coming from Aseprite?": the first time a pixel file opens, Quill asks once which keys to use. The answer is a
// remembered choice (src/core/choices.ts), so it is listed in Preferences > Behaviour and can be changed there.
// Picking Aseprite keys sets the shortcut set; the person's own key changes always stay on top.
import { onChoiceChange, registerChoice, rememberedChoice, withChoice } from '../core/choices';
import { DEFAULT_KEYMAP_SET } from '../ui/keymapSets';
import { line } from '../ui/mascot/lines';
import { getPrefs, setPrefs } from '../ui/prefs';
import { toast } from '../ui/toast';

export const KEYS_CHOICE = 'pixel.keys';
/** The id of the Aseprite set in src/ui/keymapSets.ts (kept as `pixel` so a saved choice keeps working). */
export const ASEPRITE_SET = 'pixel';

registerChoice({
  id: KEYS_CHOICE,
  title: 'Coming from Aseprite?',
  question: line('pixel.keys.ask'),
  category: 'Keyboard',
  help: 'pixel-aseprite-habits',
  default: 'frameling',
  quill: true,
  options: [
    { value: 'aseprite', label: 'Use Aseprite keys', detail: 'B is the pencil, X swaps Paint and Back, [ and ] step the palette, 1 to 6 zoom.' },
    { value: 'frameling', label: 'Use Frameling keys', detail: "Frameling's own keys. Aseprite keys are one pick away in Preferences, Keyboard." },
  ],
});

/** The shortcut set an answer means. */
export const setFor = (answer: string): string => (answer === 'aseprite' ? ASEPRITE_SET : DEFAULT_KEYMAP_SET);

/** Asks once, the first time a pixel file opens (not if you already picked another key set yourself). */
export function askAboutKeys(): void {
  if (rememberedChoice(KEYS_CHOICE) !== undefined) return;
  if (getPrefs().keymapSet !== DEFAULT_KEYMAP_SET) return;
  withChoice(KEYS_CHOICE, (v) => {
    const next = setFor(v);
    if (next !== getPrefs().keymapSet) setPrefs({ keymapSet: next });
    // Closing the question without picking counts as Frameling keys, quietly.
    if (v === 'aseprite' || rememberedChoice(KEYS_CHOICE) === 'frameling') toast(line(v === 'aseprite' ? 'pixel.keys.aseprite' : 'pixel.keys.frameling'), { kind: 'success', quill: v === 'aseprite' ? 'cheer' : null });
  });
}

// Changing the answer in Preferences > Behaviour changes the keys with it.
onChoiceChange((id, value) => {
  if (id !== KEYS_CHOICE || value === undefined) return;
  const next = setFor(value);
  if (next !== getPrefs().keymapSet) setPrefs({ keymapSet: next });
});
