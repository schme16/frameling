// The words of the help topic in menuEdit-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'change-the-menus': `The menus are yours to arrange. Put the things you use every day where you can reach them, take out the ones you never touch, and make a menu of your own for your favourites.

Open **Preferences > Menus**, or use **View > Change the menus...**.

## Move and take out

- Pick a menu from the list to see what is in it.
- **Drag** an entry by its handle on the left, or use the **up and down arrows**. A line shows where it will land.
- The **x** takes an entry out of that menu. It is still in the command search, and it is listed under **Taken out** with a **Put back** button.
- **Rename** changes the words on a menu or a submenu. Clearing the name gives the first one back.
- The eye on the menu bar list **hides** a whole menu. **Show it again** brings it back.

## Add

- **Add a command** searches every command by what it does. Press **Add** and it goes to the end of the menu, then drag it where you want it.
- **Add a divider** draws a line between groups.
- A **submenu** is a small menu inside a menu. Make one, or add one that comes with Frameling.
- **Make a menu of your own** puts a new name on the bar. The same command can be in as many menus as you like.

## Put it back

**Put this menu back** undoes the changes to one menu. **Put all the menus back** (or **Put the menus back** in the command search) undoes everything in the workspace you are in, and your own menus go. A message with **Undo** follows, so a slip is never final.

## Each workspace has its own menus

Change the menus in **Pixel** and **Draw** stays as it was. The top of the Menus page says which workspace you are changing.

- **Use these in every workspace** copies your menus to all the others, with an **Undo**.
- **Save workspace** and a shared workspace file both carry the menus along.
- Menus you changed before this moved to the workspace you were in. Frameling says so once.

## Good to know

- Changes are kept on this computer and go in your settings backup.
- If something a menu names has gone (a plugin you switched off, say), the menu leaves it out and it comes back if the plugin does. The editor marks it **Not here right now**.
- When a newer Frameling adds something to a menu you changed, it goes in next to the entry it follows. Prefer your menus left exactly alone? Change **New things in a menu you changed** in **Preferences > Behaviour**.
- Help names menus the way they come, so a path like **View > Panels** may not be where you put it.

See also [The menus](help:menus).`,
};
