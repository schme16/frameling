// The one switch for the explanations: on show in the panels, or tucked behind the help icons.
import { registerCommand } from '../../core/registry';
import { getPrefs, setPrefs } from '../prefs';
import { toast } from '../toast';

registerCommand({
  id: 'view.explanations',
  label: 'Show the explanations',
  category: 'View',
  description: 'The little lines that say what a panel or a setting is for. Off tucks them behind the ? icons: point at one to read it.',
  help: 'explanations',
  keywords: ['hints', 'help icons', 'tooltips', 'descriptions', 'clutter', 'notes', 'explainers', 'hide help text', 'question mark'],
  checked: () => getPrefs().showExplanations,
  run: () => {
    const on = !getPrefs().showExplanations;
    setPrefs({ showExplanations: on });
    toast(on ? 'The explanations are on show.' : 'The explanations are tucked behind the ? icons. Point at one to read it.', { kind: 'info' });
  },
});
