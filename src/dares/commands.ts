// The commands: try each dare yourself, see the list, put everything back. All in the Audience menu, under "Audience dares".
import type { Command } from '../core/registry';
import { openPrefs } from '../ui/overlays';
import { toast } from '../ui/toast';
import { allDares, shortId } from './catalogue';
import { dareScreen } from './fx';
import { tryDare, stopDares } from './registry';

const anything = () => {
  const s = dareScreen.get();
  return s.held.length > 0 || !!s.banner || !!s.countdown;
};

export const daresCommands: Command[] = [
  {
    id: 'dares.list',
    label: 'What the audience can dare',
    category: 'Audience',
    description: 'Opens the list of every dare, with a switch for each, so you know what you signed up for.',
    help: 'dares',
    keywords: ['dares', 'dare', 'list', 'what can they do', 'audience', 'stream', 'challenges', 'switch off a dare', 'debuff', 'buff'],
    global: true,
    run: () => openPrefs('streaming'),
  },
  {
    id: 'dares.stop',
    label: 'Put every dare back',
    category: 'Audience',
    description: 'Ends every dare that is going right now and puts the view, the colour and the banners back as they were. A drawing change stays until you press Undo.',
    help: 'dares',
    keywords: ['stop', 'end', 'undo dare', 'cancel dare', 'put back', 'reset view', 'dares'],
    global: true,
    enabled: anything,
    reason: () => 'No dare is going right now.',
    run: () => {
      stopDares();
      toast('Put it all back.', { duration: 2000 });
    },
  },
  ...allDares.map<Command>((d) => ({
    id: `dares.try.${shortId(d.id)}`,
    label: `Try the dare: ${d.label}`,
    category: 'Audience',
    description: `${d.about} Fires it yourself, to see it. Does not need audience features, and does not count as the audience.`,
    help: d.family === 'drawing' ? 'dares-drawing' : 'dares',
    keywords: ['dare', 'try', 'test', 'preview', 'audience', 'stream', ...d.keywords],
    global: true,
    run: () => void tryDare(d.id),
  })),
];
