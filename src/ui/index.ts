// The UI shell's entry point: registers its commands, help topics, panels and quests, and loads its styles.
// The shell itself (layout, dock, menus, dialogs) is rendered by src/renderer/App.tsx from the files in this folder.
import { lazyPanel } from '../core/lazy';
import { registerPanel } from '../core/registry';
import './ui.css';
import './commands';
import './helpTopics';
import './quests';
import './onboarding';
import './sounds/commands';
import { applyPrefs } from './prefs';

// Apply the saved theme and look straight away, before anything paints.
applyPrefs();

registerPanel({ id: 'help', title: 'Help', icon: 'help', component: lazyPanel(() => import('./HelpBrowser').then((m) => m.HelpPanel)), zone: 'right', order: 90, help: 'using-help' });
