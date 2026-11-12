// Help for Quill's pen check.
import { registerHelpTopics } from '../../core/registry';

registerHelpTopics([
  {
    id: 'pen-check',
    order: 10,
    title: 'Check my pen with Quill',
    section: 'Drawing',
    media: 'pen-check.png',
    summary: 'Quill walks you through hovering, pressing, leaning and the buttons, then saves a report file of what Frameling saw.',
    keywords: ['pen', 'tablet', 'diagnostics', 'report', 'test', 'huion', 'wacom', 'check', 'stylus', 'express keys', 'sample rate'],
  },
  {
    id: 'linux-install',
    order: 20,
    title: 'Installing on Linux',
    section: 'Getting started',
    media: 'installing-on-linux.png',
    summary: 'Getting the Linux download running on Ubuntu, Zorin OS and friends, and getting a pen or Huion tablet to work.',
    keywords: ['linux', 'ubuntu', 'zorin', 'appimage', 'fuse', 'libfuse2', 'sandbox', 'apparmor', 'wayland', 'x11', 'xwayland', 'huion', 'tablet', 'wacom', 'install', 'safety layer', 'gnome'],
    body: `The Linux download is one file ending in **.AppImage**. There is nothing to install: you make it runnable and open it.

## Get it going

1. Save the file somewhere you will remember, like a folder called *Applications* in your home folder.
2. Make it runnable. Right-click the file, choose **Properties**, then **Permissions**, and turn on **Allow executing file as program**. (Or in a terminal: *chmod +x Frameling-*.AppImage*.)
3. Double-click it.

## "AppImages require FUSE to run"

If double-clicking shows a message about **FUSE**, your computer is missing a small helper that AppImage files use. Ubuntu 24.04 and the systems built on it (Zorin OS 18 included) don't come with it. Paste this into a terminal once, then try again:

*sudo apt install libfuse2t64*

(On older systems, like Ubuntu 22.04, the name is *libfuse2*.) Still stuck? *./Frameling-*.AppImage --appimage-extract-and-run* starts it without FUSE at all.

## "Frameling can't use its safety layer"

Frameling's engine fences its pages in a safety layer. Plain Ubuntu 24.04 and newer block that layer for apps that haven't been allowed. When that happens Frameling stops and asks you, and it never switches the layer off by itself. You can:

- **Start this time.** Frameling only opens its own pages and your own files, so the risk is small.
- **Show me the fix.** Two short commands you paste into a terminal, once. After that Frameling starts with the layer on and doesn't ask again. You can print them any time with *./Frameling-*.AppImage --show-linux-fix*.
- **Start, and don't ask again.** Remembered in *~/.config/Frameling/no-sandbox-ok*. Delete that file to be asked again.

If your system doesn't block it, you won't see this question at all.

## Pens and tablets (Huion, Wacom and the rest)

Plug the tablet in, open Frameling and draw. Most tablets need nothing else, because the Linux kernel already knows them. A few things worth knowing:

- **Use the kernel's driver first.** Huion tablets work with the driver that comes with Linux (*hid-uclogic*). Huion also offers its own Linux driver. Try without it: running both can make the pen stop working. If the pen moves the pointer but there is no pressure, that is when to try Huion's driver (and take it out again if it makes things worse).
- **Wayland or X11.** Zorin OS and Ubuntu start you on Wayland or X11 depending on how you log in (the choice is on the login screen, under the gear). Frameling follows your session. If the pen is missing pressure or leaning on one of them, log in with the other, or start Frameling as *FRAMELING_OZONE=x11 ./Frameling-*.AppImage* (X11 on a Wayland desktop is called XWayland).
- **Express keys** act like keyboard keys, so they work as shortcuts in Frameling. Set what they press with Huion's driver or the desktop's tablet settings.
- **Check it with Quill.** [Quill can check your pen](help:pen-check) and save a report. The report says which of Wayland or X11 your pen came through, which is what whoever is helping needs to know.`,
  },
]);
