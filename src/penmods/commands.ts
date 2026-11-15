// The commands: try each modifier yourself, see the list, put the pen back. All in the Audience menu, under "Pen modifiers".
import type { Command } from '../core/registry';
import { dareScreen } from '../dares/fx';
import { openPrefs } from '../ui/overlays';
import { toast } from '../ui/toast';
import { penMods, shortId } from './catalogue';
import { stopPenMods, tryPenMod } from './registry';

const isOn = () => dareScreen.get().held.some((h) => h.resource === 'pen');

export const penModCommands: Command[] = [
  {
    id: 'penmods.list',
    label: 'What the audience can do to your pen',
    category: 'Audience',
    description: 'Opens the list of every pen modifier (steady hand, shaky hand, thin brush and more), with a switch for each, so you know what you signed up for.',
    help: 'pen-modifiers',
    keywords: ['pen modifiers', 'pen modifier', 'steady hand', 'shaky hand', 'thin brush', 'fat brush', 'debuff', 'buff', 'list', 'audience', 'stream', 'switch off'],
    global: true,
    run: () => openPrefs('features'),
  },
  {
    id: 'penmods.stop',
    label: 'Put my pen back',
    category: 'Audience',
    description: 'Takes the pen modifier off right now. Your own settings were never changed, so nothing needs putting back but the feel. Strokes you already drew stay, and Undo takes them back like any other.',
    help: 'pen-modifiers',
    keywords: ['stop', 'end', 'cancel', 'normal pen', 'put back', 'reset pen', 'pen modifier', 'debuff'],
    global: true,
    enabled: isOn,
    reason: () => 'No pen modifier is on right now.',
    run: () => {
      stopPenMods();
      toast('Your pen is back to normal.', { duration: 2000 });
    },
  },
  ...penMods.map<Command>((m) => ({
    id: `penmods.try.${shortId(m.id)}`,
    label: `Try the pen modifier: ${m.label}`,
    category: 'Audience',
    description: `${m.about} Puts it on your own pen to see it. Does not need audience features, and does not count as the audience.`,
    help: 'pen-modifiers',
    keywords: ['pen modifier', 'try', 'test', 'preview', 'audience', 'stream', ...m.keywords],
    global: true,
    run: () => void tryPenMod(m.id),
  })),
];
