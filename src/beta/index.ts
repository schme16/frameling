// Beta reports: you tell the makers what happened, and nothing goes until you press Send.
//
// There is no telemetry in Frameling. Nothing counts what you do, nothing pings on start-up, and no report is ever
// sent by itself. This whole area is one panel in Preferences > Diagnostics, one command, and a button.
import { registerCommands, registerHelpTopics } from '../core/registry';
import { betaHelp } from './help';
import { openPrefs } from '../ui/overlays';
import { watchProblems } from './problems';
import { startAuto } from './auto';
import { considerCrash, registerCrashChoice } from './crashAsk';

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
  registerCrashChoice();
  registerCommands([
    {
      id: 'help.sendCrashNotes',
      label: 'Send the notes from the last crash...',
      category: 'Help',
      description: 'If Frameling crashed last time, Quill offers the crash notes again. You read them first, and nothing goes unless you press Send.',
      help: 'crash-notes',
      keywords: ['crash', 'crashed', 'notes', 'report', 'diagnostic', 'send', 'quill', 'dazed', 'froze', 'closed badly'],
      global: true,
      run: () => void considerCrash({ force: true }),
    },
  ]);
  const stops = [watchProblems(), startAuto()];
  return () => {
    for (const stop of stops) stop();
  };
}

export { recentProblems, noteProblem } from './problems';
