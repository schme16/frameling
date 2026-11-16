// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'stream-safe': `**Stream-safe mode** is one switch for when you share your screen, stream or record a video. It swaps the things you wouldn't want strangers to see for friendly stand-ins, so you can draw without thinking about it.

## Turn it on

Press **Ctrl+Alt+Shift+H** (**Cmd+Alt+Shift+H** on a Mac), or choose **View > Sharing your screen > Stream-safe mode on or off**, or search for it in the command palette (Ctrl+K). You can also flip it in **Preferences > Streaming**. A small **Stream-safe** pill appears at the top right, so you always know it's on. Press the pill to turn it off again.

## What it hides

- **File paths and file names.** Your drawing's name in the window's title bar, Open recent, the Welcome sheet, messages, and questions that name a file all show **My drawing**, **My picture**, **A folder** and so on instead of the real thing. Recent files are numbered (My drawing 1, My drawing 2) so you can still tell them apart.
- **Little pictures of your recent drawings.** They show a plain icon instead. The same goes for the drawings and sprite in Quill's room, which go blank and get names like My drawing 1.
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
  'obs-golive': `**Going live with OBS** means you can forget to hide things, and it still gets done. Frameling watches OBS, and the moment you start streaming or recording it turns [Stream-safe mode](help:stream-safe) on for you. It starts off, and nothing happens until you switch it on.

## What it does

- **You start streaming or recording in OBS.** Stream-safe goes on and Frameling says so, before the first picture goes out.
- **You stop.** Frameling asks whether to turn Stream-safe off again, because you might still be sharing your screen. Tick **Remember my choice** and it won't ask again. Change it any time in **Preferences > Streaming**.
- **Stream-safe was already on?** Frameling leaves it alone. It only offers to undo what it did itself.

It works for any stream OBS sends, because it watches OBS and not the website. It never touches your drawing and never looks at your stream, chat or viewers.

## Step 1: turn on OBS's WebSocket server

This is the step people get stuck on. It is OBS's own door for other programs, built in since OBS 28.

1. In OBS, open the **Tools** menu and choose **WebSocket Server Settings**.
2. Tick **Enable WebSocket server**.
3. Leave the **Server Port** as **4455**, unless you changed it.
4. If **Enable Authentication** is ticked, press **Show Connect Info** to see the password. Then press **OK**.

## Step 2: tell Frameling

1. Choose **View > Sharing your screen > Going live with OBS on or off**, press **Ctrl+Alt+Shift+O** (**Cmd+Alt+Shift+O** on a Mac), or use the switch in **Preferences > Streaming**.
2. Leave the address as **localhost:4455**, or type the one OBS shows. OBS on another computer in your home? Type that computer's address.
3. Type the password, if there is one, and press **Use this password**.

A small pill at the top right says where things are: **OBS: connected** in green, **Live** or **Recording** in red, or a quiet **OBS: not found**. Red only means OBS really is streaming or recording. With audience features on it is the same pill as the yellow **Audience participation: on**, with OBS beside it. Press it for a card with the OBS settings and **Look for OBS now**.

## OBS isn't running? That's fine

Frameling keeps looking quietly. Start OBS whenever you like and it finds it within seconds. Closing OBS while live counts as the stream ending. Still not found? Check **Enable WebSocket server** is ticked, and that the address and password match.

## Your password

It stays on your computer, locked with its own key store, and never shows on screen. After you press **Use this password** Frameling doesn't show it again, even to you, and it never goes in your settings file. If your computer has no safe place for it (some Linux desktops with no keyring), Frameling keeps it only until you close it. **Forget password** removes it.

Frameling only talks to OBS on your own computer or network, never the internet, and reads only whether you are streaming or recording.

help:stream-safe, help:stream-capture, help:behaviour
`,
};
