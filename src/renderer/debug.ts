// With ?debug in the page address (the screenshot script and local checks use it), expose the store so a test can
// read and drive state. Never on in normal use.
import { store } from '../core/store';
import { allCommands, getCommand } from '../core/registry';

if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __frameling: unknown }).__frameling = {
    store,
    run: (id: string) => getCommand(id)?.run(),
    commands: () => allCommands().map((c) => c.id),
  };
}
