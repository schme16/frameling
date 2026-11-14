A restart that really restarts, recorded from the real app (real main process, real file on disk, ffmpeg on the virtual screen).

- restart-dark.mp4, restart-light.mp4: the Restart Frameling command with an unsaved change asks the same question as closing,
  Save, the window goes away, and it opens again on the same drawing, frame 6, with the window in the same place
  (the window was moved off centre first, so "same place" means something). The numbers are from the app itself:
  result.json from the run says file, frame and window position are identical before and after.
- Before: the old Restart now only closed Frameling (and an AppImage could not open itself again, because it was told
  to open its temporary mount). There is no "before" clip: it is a window that closes and stays closed.
