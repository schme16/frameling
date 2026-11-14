// Commands for the right side: open Properties, and the list of every panel.
import { registerCommand } from '../core/registry';
import { dock, setActive } from './dock';
import { isSection } from './panelInfo';
import { rightStyle, togglePicker } from './rightStyle';

registerCommand({
  id: 'view.properties',
  label: 'Properties',
  category: 'View',
  description: 'Show the settings for what you are doing now: the tool, colours and whatever is selected.',
  help: 'properties',
  keywords: ['inspector', 'settings', 'options', 'selection', 'right side'],
  run: () => {
    const z = dock.get().layout.zones.right;
    const merged = rightStyle.get() === 'inspector';
    const to = merged ? (z.active && isSection(z.active) ? z.active : z.tabs.find(isSection)) : z.tabs[0];
    if (to) setActive('right', to);
  },
});

registerCommand({
  id: 'view.allPanels',
  label: 'All panels...',
  category: 'View',
  description: 'Every panel with what it is for. Open one, or bring back one you closed.',
  help: 'panels',
  keywords: ['find panel', 'window', 'missing panel', 'lost panel', 'show panel', 'list'],
  run: () => togglePicker(),
});
