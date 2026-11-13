// Beta reports: you tell the makers what happened, and nothing goes until you press Send.
//
// There is no telemetry in Frameling. Nothing counts what you do, nothing pings on start-up, and no report is ever
// sent by itself. This whole area is one panel in Preferences > Diagnostics, one command, and a button.
import { registerCommands, registerHelpTopics } from '../core/registry';
import { betaHelp } from './help';
import { openPrefs } from '../ui/overlays';
import { watchProblems } from './problems';

export function installBeta(): () => void {
  registerHelpTopics(betaHelp);
  registerCommands([
    {
      id: 'help.sendReport',
      label: 'Tell the makers what happened...',
      category: 'Help',
      description: 'Write what went wrong and send it, after reading exactly what goes. Nothing is ever sent on its own.',
      help: 'beta-reports',
      keywords: ['report', 'bug', 'beta', 'feedback', 'crash', 'diagnostic', 'telemetry', 'send', 'problem', 'broken'],
      global: true,
      run: () => openPrefs('diagnostics'),
    },
  ]);
  return watchProblems();
}

export { recentProblems, noteProblem } from './problems';
