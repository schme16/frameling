// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'pen-check': `If your pen or tablet is not behaving, Quill can check it with you. It takes about a minute.

**When it starts.** The first time Frameling sees a pen, Quill pops up and asks if you want to check it. Say **Not now** and he asks again next time. Say **Don't ask again** and he won't. You can also start it any time from **Preferences, Diagnostics**, or press **Ctrl+K** and type *check my pen*.

## What he asks for

One thing at a time, on a grey pad. He ticks each off when he sees it, and you can **Skip this one** if your pen can't do it.

1. **Hover** the pen just above the pad.
2. **Press** from very light to very hard in one line.
3. **Lean** the pen left, then right.
4. **Twist** the pen in your fingers (few pens can).
5. **Flip** it and use the eraser end.
6. Hold the **button nearest the tip** while you draw.
7. Hold the **other button**, if there is one.
8. **Scribble fast** for a couple of seconds, so he can count how many dots a second the pen gives.
9. Press an **express key**, or spin the **touch ring**, if your tablet has them.

## The report

At the end Quill shows a Save dialog and writes a small file named like *frameling-tablet-report-2026-11-12.json*. It holds what Frameling heard from your pen (pressure, lean, twist, button numbers, how fast the dots come), the version of Frameling and of your system, and a short trace of the pen's movements. It has no drawings, no file names and nothing about you. Nothing is sent anywhere: you choose whether to share the file.

Once a report is saved, Quill won't offer the check again by himself. You can still run it from Preferences, Diagnostics.

Not working at all? See [Drawing with a pen or tablet](help:pen-tablet) for the Windows Ink setting that most often fixes it.`,
  'linux-install': `The Linux download is one file ending in **.AppImage**. There is nothing to install: you make it runnable and open it.

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
};
