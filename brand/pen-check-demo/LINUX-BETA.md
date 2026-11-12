# Frameling on Linux: beta tester checklist

For: Zorin OS 18.1 (Ubuntu 24.04 based, GNOME, Wayland or X11) with a Huion tablet. About ten minutes.
The same words are in Frameling under Help, "Installing on Linux".

## Before you start

- [ ] Make the AppImage runnable (right-click, Properties, Permissions, Allow executing file as program) and double-click it.
- [ ] Nothing else needs installing. (If it says "AppImages require FUSE", this build is older than it should be: `sudo apt install libfuse2t64`.)
- [ ] Write down which session you are in: run `echo $XDG_SESSION_TYPE` in a terminal. It says `x11` or `wayland`.
- [ ] Zorin OS should not ask about a "safety layer". If Frameling asks, pick **Show me the fix**, run the two commands, and tell us it asked.

## The tablet

- [ ] Plug the Huion in **without** installing Huion's own Linux driver first. Run `libinput list-devices | grep -i -A6 huion`: the tablet should be listed with `Capabilities: tablet`. Tell us if it is not.
- [ ] Open Frameling, pick the Brush (B), and draw a few lines. Does the line get thicker when you press harder?
- [ ] **Preferences, Diagnostics, Check my pen with Quill.** Do all nine steps. Skip the ones the pen cannot do.
- [ ] Save the report. Attach the `.json` file to your reply. (It holds no drawings and nothing about you.)
- [ ] Say which steps did not tick, and anything that felt off: a late first dot, jumpy pressure, the cursor not following the pen, the pen working on one screen only.
- [ ] Log out, log in again with the **other** session (X11 instead of Wayland, or the other way: the gear on the login screen), and run the check again. Send that report too.
- [ ] Still no pressure? Start it from a terminal as `FRAMELING_OZONE=x11 ./Frameling-*.AppImage` (the AppImage's name will differ) and run the check once more.
- [ ] Only if the pen moves the pointer but sends no pressure at all: try Huion's own Linux driver, run the check again, and say so. Take it out again if the pen gets worse.

## What to expect

- The eraser end may not tick off on X11: the system hands it to Frameling as a normal pen. Skip it and tell us.
- The two barrel buttons may come in swapped on X11 (the button nearest the tip arriving as "the other button"). That is
  what Frameling's Pen and tablet page is for: you can set what each button does.
- Express keys come in as keyboard keys. If the key step does not tick, press any key on the keyboard to confirm the step itself works.

---

# For whoever is helping: what was checked, and what was not

Checked in a stock Ubuntu 24.04.5 virtual machine (kernel 6.8, `kernel.apparmor_restrict_unprivileged_userns = 1`, no
libfuse2), with the AppImage built by `npm run dist:linux`.

| Question | Result |
|---|---|
| Does the old AppImage need libfuse2? | Yes. The old runtime stops with "dlopen(): error loading libfuse.so.2" on Ubuntu 24.04. |
| Does the new one? | No. `toolsets.appimage: "1.0.3"` in package.json builds the static runtime. It started with no libfuse2, and also with fuse3 removed. `--appimage-extract-and-run` works too. |
| Ubuntu 24.04 and the sandbox | electron-builder's own `AppRun` tests `unshare -Ur true` and, when it fails, silently adds `--no-sandbox`. That is how the old AppImage "started reliably" on Ubuntu 24.04: with the browser sandbox off and nothing said. Run directly it dies with "The SUID sandbox helper binary was found, but is not configured correctly". |
| What changed | `build/linux/launcher.sh` now sits in front of the program (`build/after-pack.cjs` puts it there; the program is `frameling.bin`). It takes the silent `--no-sandbox` off and starts with the sandbox on. If that works, nothing else happens. If it cannot, Frameling asks (zenity, kdialog, or the terminal; with nobody to ask it starts and says so loudly), offers **Show me the fix**, and remembers "don't ask again" in `~/.config/Frameling/no-sandbox-ok`. `FRAMELING_NO_SANDBOX=1` does the same from the environment. |
| The fix | An AppArmor profile for `/tmp/{.mount_*,appimage_extracted_*}/frameling.bin` with `userns,`, or the sysctl set to 0. **Both were tested**: with the profile loaded the sandbox is on and nothing is asked; with the sysctl at 0 the same. |
| Zorin OS | This computer is Zorin OS 18.1: the package `zorin-os-default-settings` ships `/etc/sysctl.d/20-apparmor-zorin.conf` setting the restriction to 0. A Zorin 18 beta tester should never see the question. |
| Wayland or X11 | Electron 45 (Chromium 156) picks Wayland by itself on a Wayland session (checked under weston: no switch needed, and `--ozone-platform-hint=auto` changes nothing). So no switch was added. `FRAMELING_OZONE=x11\|wayland\|auto` is in the launcher for forcing it, and verified: on a Wayland session it gives `x11`. |
| The report | Now says which session it came from (`system.session`: `type`, `desktop`, `wayland`, `x11`, and `ozone`, the window system Chromium really used). |
| Pen through X11 | Tested with a pretend Huion tablet (uinput, Xorg with libinput, Frameling's own pointer events): `pointerType: "pen"`, pressure from 0 to 0.88, tilt X from -49 to 64 and tilt Y, contact and barrel bits all arrived. **Not through**: the eraser end (it arrived as a normal pen touch, no eraser bit), and the first barrel button arrived as `buttons` bit 4 (middle) rather than bit 2. |
| Pen through native Wayland | **Not tested.** The Chromium binary contains the Wayland tablet code (`wayland_tablet_manager.cc`, `zwp_tablet_v2`), but sway in the VM never mapped the window, so no tablet event was sent. This is the main thing the beta tester's two reports will answer. |
| hid-uclogic vs Huion's driver | Not testable without the tablet. The kernel driver (`hid-uclogic`) is present on the Zorin 18.1 kernel here. Advice to try the kernel driver first and Huion's own driver second is from general knowledge, not tested. |

Not done: a real Huion tablet, a real GNOME Wayland session, Zorin's own kernel and Mutter, and an AppArmor profile
for a differently named AppImage file (the mount folder name starts with the AppImage's name; the profile uses `.mount_*`, which should match).
