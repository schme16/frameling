// Your templates in the app: commands, help, and the "Yours" source for the welcome sheet. (index.ts stays the plain
// list of built-in templates, which tests and tools import without the UI.)
import { registerCommands, registerHelpTopics } from '../core/registry';
import { openSheet } from '../ui/overlays';
import { importTemplate } from './actions';
import './user';

registerCommands([
  {
    id: 'file.saveAsTemplate',
    label: 'Save as template...',
    category: 'File',
    description: 'Keep this drawing as a starting point in Your templates.',
    help: 'templates-yours',
    keywords: ['template', 'starter', 'preset', 'reuse', 'share', 'community'],
    // The dialog loads on first use.
    run: () => void import('./SaveTemplateDialog').then((m) => m.openSaveTemplate()),
  },
  {
    id: 'file.importTemplate',
    label: 'Import template...',
    category: 'File',
    description: 'Add a template someone shared with you to Your templates.',
    help: 'templates-yours',
    keywords: ['template', 'starter', 'share', 'community', 'add'],
    run: async () => {
      if (await importTemplate()) openSheet('new');
    },
  },
]);

registerHelpTopics([
  {
    id: 'templates-yours',
    title: 'Your templates',
    section: 'Getting started',
    summary: 'Keep any drawing as a starting point, share it as a file, and add templates other people made.',
    keywords: ['template', 'starter', 'preset', 'share', 'community', 'import', 'licence', 'license', 'author'],
    media: 'templates-yours.png',
    body: `A **template** is a drawing you start new work from: a character on its layers, a walk cycle to change, a tileset with its palette. Frameling comes with some (**Built-in**), and you can keep your own (**Yours**).

## Save one

1. Open or make the drawing you want to reuse.
2. Choose **File > Save as template...**.
3. Give it a name and a line about what it is and what to try. Tags help you find it later.
4. Choose **Save template**.

It shows up under **Yours** when you choose **File > New**. Picking it gives you a fresh copy; the template itself never changes.

## Share one

Tick **Also save a copy to share** when saving, or hover a card under **Yours** and press the share button. That saves a **.frameling** file you can send to anyone. It opens as a normal drawing in any Frameling, too.

Say who made it and how others may use it with **Made by** and **Licence**. "Free with credit" (CC BY) is a friendly choice; "Just for me" means it isn't for sharing.

## Add one someone shared

Choose **File > Import template...**, or the **Import template...** card under **Yours**, and pick the file.

## Where they live

In the desktop app, your templates are .frameling files in a **templates** folder in Frameling's own data folder, so you can drop files in by hand. In a web browser they're kept in the browser (see [Frameling in a web browser](help:web-browser)).

To remove one, hover its card and press the bin. Drawings you started from it stay as they are.`,
  },
]);
