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

- **The eraser end.** On Wayland it should tick off like on any system. On X11 (and the Xwayland X11 that Frameling can run
  under) the system hands the eraser end over as a normal pen touch, with no eraser button bit. Frameling now notices that
  the flipped pen is a second device, so the step should still tick. If it does not (Quill waits a few seconds, then says so),
  press **My pen's eraser end doesn't show up here**: it goes in the report and Quill moves on. You can still make a pen
  button erase: Preferences, Pen and tablet, set a button to **Erase**.
- **The two barrel buttons.** On Linux the button nearest the tip arrives as a "middle click" (`buttons` bit 4) and the other
  as a "right click" (bit 2), the other way round to Windows. Frameling swaps them back, so "the button nearest the tip"
  means that on every system, and the pad in Pen and tablet names the raw bit as you press. The pen check ticks either bit
  for the first button, and wants the other bit for the second.
- Express keys come in as keyboard keys. If the key step does not tick, press any key on the keyboard to confirm the step itself works.
- The report (version 2) lists, for every step, which window system it came through, the raw button bits and masks, and how
  the pointer and device numbers changed. If something is off, that is what tells us what arrived.

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
| Pen through X11 | Tested with a pretend Huion tablet (uinput, Xorg with libinput, Frameling's own pointer events): `pointerType: "pen"`, pressure from 0 to 0.88, tilt X from -49 to 64 and tilt Y, contact and barrel bits all arrived. The eraser end arrives as a normal pen touch (`buttons` 1, no bit 32, no button 5, the same `pointerId`), but from a second device: `persistentDeviceId` is 2 for the tip and 3 for the eraser, and flips back and forth as the pen is flipped. The first barrel button arrives as bit 4 (middle click) and the second as bit 2 (right click). See "The pen on X11 and Wayland" below. |
| Pen through native Wayland | Tested in the same VM with weston (drm backend, a pretend Huion read by its libinput) and Electron with `--ozone-platform=wayland`. The eraser end arrives properly (`button` 5, `buttons` 32, and a new `pointerId`). The barrel buttons are the same as on X11: first is bit 4, second is bit 2. `persistentDeviceId` is 0 (not given). GNOME's own compositor (Mutter) was **not** tested: it speaks the same tablet protocol, but that is an assumption. |
| hid-uclogic vs Huion's driver | Not testable without the tablet. The kernel driver (`hid-uclogic`) is present on the Zorin 18.1 kernel here. Advice to try the kernel driver first and Huion's own driver second is from general knowledge, not tested. |

Not done: a real Huion tablet, a real GNOME Wayland session, Zorin's own kernel and Mutter, and an AppArmor profile
for a differently named AppImage file (the mount folder name starts with the AppImage's name; the profile uses `.mount_*`, which should match).

## The pen on X11 and Wayland

Measured with the pretend Huion (a uinput device with a tip, an eraser tool, `BTN_STYLUS` and `BTN_STYLUS2`) in an Ubuntu
24.04.5 VM, Chromium 156 from Electron 45. Every event was read by the page, and the whole of Quill's pen check was run in the
built app on each. `scripts/linux-pen/` has the pieces to do it again (see "A pretend tablet" in docs/testing.md).

| What | X11 (Xorg, libinput driver) | Wayland (weston, native) |
|---|---|---|
| Tip | `pointerType` pen, `buttons` 1 | same |
| Eraser end | `pointerType` pen, `buttons` 1, `button` 0. **No eraser bit.** `pointerId` the same as the tip's. `persistentDeviceId` differs (tip 2, eraser 3) | `button` 5, `buttons` 32. `pointerId` changes every time a tool comes into range |
| Button nearest the tip (`BTN_STYLUS`) | `button` 1, `buttons` 4 | same |
| Other button (`BTN_STYLUS2`) | `button` 2, `buttons` 2 | same |
| `persistentDeviceId` | a number per X device (the tip and the eraser are two devices) | 0 |
| Width and height | 1 and 1 | 1 and 1 |
| Tilt | (-1, -1) at rest for a tilt of about -0.5 degrees: rounded | same |

Why X11 looks like that: the X driver for libinput makes one X device per tool (a "Pen" and an "Eraser"), and Chromium on X11 does
not turn the eraser device into the eraser bit. The page only sees it as a different `persistentDeviceId`. The barrels are the
X convention (stylus button 1 is X button 2, a middle click, and stylus button 2 is button 3, a right click), and Chromium's
Wayland code gives the same.

What Frameling does with it (`src/tablet/buttons.ts`, `src/tablet/tool.ts`):

- On Linux the two barrel bits are swapped back, so "button nearest the tip" and "other button" mean what they say.
- On Linux, with no eraser bit ever seen, a pen touch from a different `persistentDeviceId` than the first touching device
  (the tip) is the eraser end. Not used on Wayland (no ids; the bit works) or other systems.
- The pen check ticks the eraser step by the bit or by that device change, and records which in `buttons.eraserBy`. If neither
  shows, Quill offers "My pen's eraser end doesn't show up here" and the report has `reason: "no-eraser-end"` on that step.

Still not verified: a real Huion (its eraser may or may not be a separate tool; many Huion pens have no eraser end at all),
GNOME's Mutter (Wayland) and a GNOME X11 session, and a tablet unplugged and plugged back in while Frameling is open (the tip
and eraser get new device numbers, and the first touch after that is taken as the tip, so the eraser end could be read as the tip
until Frameling is restarted).
