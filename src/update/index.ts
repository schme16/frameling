// New versions: Frameling looks at this project's GitHub releases (when you let it), offers a newer one when nobody is
// drawing, and puts it in only when you press Update now. This file is the command and the help; the rest is beside it.
import { registerCommands, registerHelpTopics } from '../core/registry';
import { updateHelp } from './help';
import { checkForUpdates } from './state';

export function installUpdates(): void {
  registerHelpTopics(updateHelp);
  registerCommands([
    {
      id: 'help.checkUpdates',
      label: 'Check for updates',
      category: 'Help',
      description: 'Look for a newer Frameling now, and say plainly if this is already the newest. Nothing is downloaded until you press Update now.',
      help: 'updates',
      keywords: ['update', 'updates', 'upgrade', 'new version', 'latest', 'release', 'newest', 'version', 'download', 'github'],
      global: true,
      run: () => void checkForUpdates({ manual: true }),
    },
  ]);
}
