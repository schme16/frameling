import { ipcRenderer } from 'electron';

// The picture window's whole link to the desktop side: it is handed one end of a message port and passes it to the page.
// It has no file, save or app calls at all.
ipcRenderer.on('popout:port', (e) => window.postMessage('frameling-popout-port', '*', e.ports));
