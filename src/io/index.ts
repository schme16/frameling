// Registers the io area's commands, panels, tools and help topics, and starts the file services (autosave, window
// title, files opened from outside). Other areas can import the helpers below.
import './commands';
import './help';
import { startFileServices } from './autosave';

export { askAboutUnsavedChanges, documentTitle, listRecentFiles, openDocument, openPath, saveDocument, saveDocumentAs } from './document';
export { openRecentDialog } from './RecentDialog';
export { autosaveNow } from './autosave';

// Wait a tick so the rest of the app has registered and mounted before anything pops a message.
if (typeof window !== 'undefined' && typeof document !== 'undefined') setTimeout(startFileServices, 0);
