import { ipcRenderer } from 'electron';

// The Stream control board's whole link to the desktop side: it is handed one end of a message port and passes it to the
// page. It has no file, save or app calls at all.
ipcRenderer.on('streamboard:port', (e) => window.postMessage('frameling-streamboard-port', '*', e.ports));
