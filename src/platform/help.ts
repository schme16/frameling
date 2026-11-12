import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'web-browser',
    title: 'Frameling in a web browser',
    section: 'Files',
    summary: 'Frameling also runs in a browser tab, with nothing to install. Here is what works a little differently.',
    keywords: ['browser', 'web', 'chrome', 'edge', 'firefox', 'safari', 'download', 'install', 'offline', 'pwa', 'locked down'],
    media: 'web-browser.png',
    body: `Can't install apps on your computer? Frameling runs in a web browser too. Drawing, animating and exporting work the same. Only **files** work a little differently, because a web page can't roam around your computer.

## Saving and opening

**In Chrome or Edge**, it's just like the desktop app. The first **Save** asks where to put the file, and after that **Ctrl+S** quietly updates the same file. The browser may ask "Let this site edit files?" once. Choose **Allow** (or **Edit files**).

**In Firefox or Safari**, the browser can't update a file in place. So:

- **Save** downloads a fresh copy of your **.frameling** file each time, into your Downloads folder.
- **Open** shows the usual "choose a file" box.
- Frameling also keeps its own copy in the browser, so **Open recent...** still works.

In any browser you can also **drop a .frameling file onto the page** to open it.

## Exporting

Exports work the same. Where the browser can't pick a save spot, the file downloads. Exports of several files (a **sprite sheet** and its data, a tileset) go into a folder you choose in Chrome and Edge, and download as one **.zip** elsewhere. In Safari, a long export shows a **Save** button when your file is ready. Press it to download.

**ProRes video** needs the desktop app, and text can use Frameling's own fonts but not ones installed on your computer.

## Your safety copies

[Autosave](help:autosave) works the same, every minute and whenever you switch tabs. The next visit offers unsaved work back, and **File > Recover unsaved work...** keeps it for 7 days.

These copies, your recent files and your preferences live in **this browser on this computer**. Another browser, a private window or clearing site data starts fresh, so always **Save** work you care about. Safari clears a site's storage after about a week away. Frameling asks the browser to keep it, and tells you once if it can't. Saved files, or **Add to Dock**, are safe.

## Closing the tab

A browser shows its own "Leave site?" question instead of "Save changes?". If you leave anyway, your work waits in **Recover unsaved work...**.

## Keyboard shortcuts

A few shortcuts belong to the browser and can't be used by any web page, such as **Ctrl+N** (new window), **Ctrl+W** (close tab) and **Ctrl+T** (new tab). Use the menus or the command palette (**Ctrl+K**) for those.

## Install it as an app

**Help > Install Frameling as an app...** adds Frameling to your apps (in Chrome and Edge). It then opens in its own window, works **offline**, and can open .frameling files when you double-click them. In Safari, use **Share > Add to Dock** (or **Add to Home Screen** on an iPad). Firefox can't install it, but the page still works offline once it has loaded.

One thing needs a connection: **plugins**. A plugin runs in a sealed box that the offline copy can't open, so it starts again when you are back online.`,
  },
]);
