// The words of the help topics in app.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'templates-yours': `A **template** is a drawing you start new work from: a character on its layers, a walk cycle to change, a tileset with its palette. Frameling comes with some (**Built-in**), and you can keep your own (**Yours**).

## Save one

1. Open or make the drawing you want to reuse.
2. Choose **File > Save as template...**.
3. Give it a name and a line about what it is and what to try. Tags help you find it later.
4. Choose **Save template**.

It shows up under **Yours** when you choose **File > New drawing...**. Picking it gives you a fresh copy; the template itself never changes.

## Share one

Tick **Also save a copy to share** when saving, or hover a card under **Yours** and press the share button. That saves a **.frameling** file you can send to anyone. It opens as a normal drawing in any Frameling, too.

Say who made it and how others may use it with **Made by** and **Licence**. "Free with credit" (CC BY) is a friendly choice; "Just for me" means it isn't for sharing.

## Add one someone shared

Choose **File > Import template...**, or the **Import template...** card under **Yours**, and pick the file.

## Where they live

Your templates are .frameling files in a **templates** folder in Frameling's own data folder, so you can drop files in by hand.

To remove one, hover its card and press the bin. Drawings you started from it stay as they are.`,
};
