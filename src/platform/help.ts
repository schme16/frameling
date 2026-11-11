import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'web-browser',
    title: 'Frameling in a web browser',
    section: 'Files',
    summary: 'Frameling also runs in a browser tab, with nothing to install. Here is what works a little differently.',
    keywords: ['browser', 'web', 'chrome', 'edge', 'firefox', 'safari', 'download', 'install', 'offline', 'pwa', 'locked down'],
    media: 'web-browser.png',
    body: `Can't install apps on your computer? Frameling runs in a web browser too. Drawing, animating and exporting all work the same. Only a few things about **files** are different, because a web page isn't allowed to roam around your computer.

## Saving and opening

**In Chrome or Edge**, it's just like the desktop app. The first **Save** asks where to put the file, and after that **Ctrl+S** quietly updates the same file. The browser may ask "Let this site edit files?" once. Choose **Allow** (or **Edit files**).

**In Firefox or Safari**, the browser can't update a file in place. So:

- **Save** downloads a fresh copy of your **.frameling** file each time, into your Downloads folder.
- **Open** shows the usual "choose a file" box.
- Frameling also keeps its own copy in the browser, so **Open recent...** still works.

## Exporting

GIFs, videos and pictures work the same. Where the browser can't pick a save spot, the file simply downloads.

Exports made of several files (a **sprite sheet** with its data file, a tileset) go into a folder you choose in Chrome and Edge. Other browsers download them together as one **.zip** file. Unzip it to get the files.

There's no **Show in folder** button in a browser. Look in the folder you picked, or your Downloads.

**ProRes video** needs the desktop app (it uses FFmpeg on your computer), and text can use Frameling's own fonts, Nunito and Inter, but not fonts installed on your computer.

## Your safety copies

**Autosave** works the same: every minute, and whenever you switch away from the tab, Frameling keeps a copy of unsaved work inside the browser. If the tab closes with unsaved changes, the next visit offers it back, and **File > Recover unsaved work...** keeps it for 7 days. See [Autosave](help:autosave).

These copies, your recent files list and your preferences live in **this browser on this computer**. A different browser, or a private window, starts fresh. Clearing the browser's site data clears them too, so always **Save** work you care about.

## Closing the tab

A browser can't ask "Save changes?" with a Save button when you close a tab. It shows its own "Leave site?" question instead. If you leave anyway, your work is put aside in **Recover unsaved work...**, just like choosing **Don't save**.

## Keyboard shortcuts

A few shortcuts belong to the browser and can't be used by any web page, such as **Ctrl+N** (new window), **Ctrl+W** (close tab) and **Ctrl+T** (new tab). Use the menus or the command palette (**Ctrl+K**) for those.

## Install it as an app

**Help > Install Frameling as an app...** adds Frameling to your apps (in Chrome and Edge). It then opens in its own window, works **offline**, and can open .frameling files when you double-click them. In Safari, use **Share > Add to Dock** (or **Add to Home Screen** on an iPad). Firefox can't install it, but the page still works offline once it has loaded.`,
  },
]);
