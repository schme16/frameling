# A locked layout hides its handles

Before: a locked rail and locked panels still wore their grips and edges, and said no when you used them. Now, while
locked, the things that invite a move are not on show. Unlocking brings them all back.

Every picture is an Unlocked / Locked pair, the same window, the same crop, dark and light. Compared pixel by pixel,
the only difference in each pair is the grip or a small lock (about 10 pixels square); nothing else moved.

- `rail-dark.png`, `rail-light.png`: the tool rail. The dotted grip at the top becomes a small lock in the same
  place, so the rail doesn't jump.
- `panels-dark.png`, `panels-light.png`: a floating window (grip becomes a lock, and its resize edges and the title
  bar's grab cursor are gone), and the right side's rail (a small lock above **Panels**).
- `tabbar-dark.png`, `tabbar-light.png`: a docked tab bar, with a small lock by the fold button.
- `lock-hide-dark.mp4`, `lock-hide-light.mp4`: the help clip, redone (H.264, yuv420p, 800x500). Lock the tools, the
  grip is a lock, the menu says Unlock with the rest greyed and a reason, then unlock and carry it.

## What leaves while locked

- The rail's grip (replaced by a lock), and its inner width edge and its cursor.
- A floating window's grip (replaced by a lock), its eight resize edges, and the grab cursor on its title bar.
- The side edges and group splitters between docked panels: no resize cursor, nothing to grab.
- Tooltips on tabs and group names stop saying "Drag to move it" and say "Locked in place".
- The gold marks and the + between groups only exist while Change the tools is open, which can't open while locked.

## How you can tell it is locked

A small, quiet lock sits where the grip was (rail, windows), above **Panels** on the right side, and by the fold button
on a docked tab bar. Hovering it says "Locked in place" and how to unlock. The right-click menu says Unlock, and a
command or key that would move something still says why.
