// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'stream-safe': `**Stream-safe mode** is one switch for when you share your screen, stream or record a video. It swaps the things you wouldn't want strangers to see for friendly stand-ins, so you can draw without thinking about it.

## Turn it on

Press **Ctrl+Alt+Shift+H** (**Cmd+Alt+Shift+H** on a Mac), or choose **View > Look and sound > Stream-safe mode on or off**, or search for it in the command palette (Ctrl+K). You can also flip it in **Preferences > General**. A small **Stream-safe** pill appears at the top right, so you always know it's on. Press the pill to turn it off again.

## What it hides

- **File paths and file names.** Your drawing's name in the window's title bar, Open recent, the Welcome sheet, messages, and questions that name a file all show **My drawing**, **My picture**, **A folder** and so on instead of the real thing. Recent files are numbered (My drawing 1, My drawing 2) so you can still tell them apart.
- **Little pictures of your recent drawings.** They show a plain icon instead.
- **Your name.** The name you sign templates with shows as **Me**, and the box where you type it shows dots.
- **Keys and contact details**, such as the way to reach you in a beta report. They show as dots.

## What it never does

It only changes what's drawn on the screen. Your drawing, your saved files and your settings are never touched, and nothing is sent anywhere. Open, save and export all work as they always do. It starts off, and it remembers your choice next time.

**Good to know:**

- The drawing's own name (the one at the top, which you can rename) is yours to choose, so it stays. Name it something you're happy to show.
- Frameling can't change what other programs show. The system's own file pickers (the ones that open when you save or export) still show real folders, and desktop notifications come from your computer, so keep those off screen.
- Turning it on hides things at once, including messages already showing.

help:saving-and-opening, help:recent-drawings, help:beta-reports
`,
};
