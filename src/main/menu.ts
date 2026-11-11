import { app, Menu } from 'electron';

// Frameling draws its own menu bar inside the window, so Windows and Linux get no native one. A Mac always shows a
// menu bar at the top of the screen, so it keeps a minimal one: the app menu (so Quit works) and Edit (so copy and
// paste work in text boxes).
export function setupMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
      },
      {
        label: 'Edit',
        // The shortcuts stay with the page (registerAccelerator off), so Cmd+Z and friends reach Frameling's own
        // undo and clipboard handling, and still work natively inside text boxes.
        submenu: [
          { role: 'undo', registerAccelerator: false },
          { role: 'redo', registerAccelerator: false },
          { type: 'separator' },
          { role: 'cut', registerAccelerator: false },
          { role: 'copy', registerAccelerator: false },
          { role: 'paste', registerAccelerator: false },
          { role: 'selectAll', registerAccelerator: false },
        ],
      },
      { role: 'windowMenu' },
    ]),
  );
}
