// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/core/registry';
import { jumpTo } from '../../src/ui/MenuBar';
import { listedIds, MENU_HOMES, MENUS, menuTitle, resolveMenu, SUBMENUS, type MenuDef, type SubmenuDef } from '../../src/ui/menus';
import { _forceInteractivesForTests } from '../../src/features/flags';

// These tests are about Interactives itself (and what goes with it), so they run with its switch (src/features/flags.json) on.
_forceInteractivesForTests(true);

const c = (id: string, label = id, category = 'Test'): Command => ({ id, label, category, run: () => {} });
const registry = (list: Command[]) => ({ lookup: (id: string) => list.find((x) => x.id === id), all: () => list });
const shape = (items: ReturnType<typeof resolveMenu>): unknown[] => items.map((i) => (i.kind === 'separator' ? '-' : i.kind === 'submenu' ? { [i.label]: shape(i.items) } : i.kind === 'heading' ? `# ${i.label}` : i.command.id));

describe('menu filtering', () => {
  it('gives the same menus whether the ids the menus name are worked out for each one or once for all', () => {
    const r = registry([c('file.new'), c('file.open', 'Open', 'File'), c('file.extra', 'Extra', 'File'), c('edit.undo', 'Undo', 'Edit')]);
    const menu: MenuDef = { label: 'File', categories: ['File'], items: ['file.new', '-', 'file.open'] };
    const other: MenuDef = { label: 'Edit', categories: ['Edit'], items: ['edit.undo'] };
    const named = listedIds([menu, other], SUBMENUS);
    expect(resolveMenu(menu, [menu, other], r.lookup, r.all, SUBMENUS, undefined, named)).toEqual(resolveMenu(menu, [menu, other], r.lookup, r.all));
    // The real menus too: every one of them resolves the same either way.
    for (const m of MENUS) expect(resolveMenu(m, MENUS, r.lookup, r.all, SUBMENUS, undefined, listedIds(MENUS, SUBMENUS))).toEqual(resolveMenu(m, MENUS, r.lookup, r.all));
  });

  const menu: MenuDef = { label: 'File', categories: ['File'], items: ['file.new', 'file.open', '-', 'file.save', 'file.ghost', '-', 'file.export'] };
  const other: MenuDef = { label: 'Edit', categories: ['Edit'], items: ['edit.undo'] };

  it('leaves out commands nobody registered', () => {
    const r = registry([c('file.new'), c('file.open'), c('file.export')]);
    expect(shape(resolveMenu(menu, [menu, other], r.lookup, r.all))).toEqual(['file.new', 'file.open', '-', 'file.export']);
  });
  it('never leaves a separator at the ends or two in a row', () => {
    const r = registry([c('file.open'), c('file.export')]);
    expect(shape(resolveMenu(menu, [menu, other], r.lookup, r.all))).toEqual(['file.open', '-', 'file.export']);
    const r2 = registry([c('file.save')]);
    expect(shape(resolveMenu(menu, [menu, other], r2.lookup, r2.all))).toEqual(['file.save']);
  });
  it('is empty when nothing in it exists', () => {
    const r = registry([]);
    expect(resolveMenu(menu, [menu, other], r.lookup, r.all)).toEqual([]);
  });
  it('adds unlisted commands in the menu categories at the end, once', () => {
    const r = registry([c('file.new'), c('file.recent', 'Recent', 'File'), c('edit.undo', 'Undo', 'Edit'), c('misc.thing', 'Thing', 'Other')]);
    expect(shape(resolveMenu(menu, [menu, other], r.lookup, r.all))).toEqual(['file.new', '-', 'file.recent']);
  });
  it('does not repeat a command another menu names', () => {
    const r = registry([c('file.new'), c('edit.undo', 'Undo', 'File')]);
    expect(shape(resolveMenu(menu, [menu, other], r.lookup, r.all))).toEqual(['file.new']);
  });
  it('File ends with Quit on the desktop, and drops it in a browser tab', () => {
    const file = MENUS.find((m) => m.label === 'File')!;
    expect(file.items.at(-1)).toBe('file.quit');
    // In a browser tab nobody registers it, so the entry and its separator go quietly.
    const r = registry([c('file.new', 'New', 'File')]);
    expect(shape(resolveMenu(file, MENUS, r.lookup, r.all, SUBMENUS))).toEqual(['file.new']);
  });
  it('the real menus are named File, Edit, View, Draw, Pixel, Animate, Streaming and Help (Artboards, Rig, Effects and Plugins live inside others)', () => {
    expect(MENUS.map((m) => m.label)).toEqual(['File', 'Edit', 'View', 'Draw', 'Pixel', 'Animate', 'Streaming', 'Help']);
  });
  it('a menu that moved inside another still takes what a feature adds by its old name', () => {
    expect(MENU_HOMES).toEqual({ Rig: 'sub:rig', Effects: 'sub:effects', Artboards: 'sub:artboards', Plugins: 'sub:plugins' });
    for (const home of Object.values(MENU_HOMES)) expect(SUBMENUS[home.slice(4)], home).toBeDefined();
  });
});

describe('the Help and Skeleton menus', () => {
  const help = MENUS.find((m) => m.label === 'Help')!;
  it('Help holds help only: no shortcut sets, quest controls or pen check, even if they are in the Help category', () => {
    const r = registry([
      c('help.contents', 'Help', 'Help'),
      c('keys.set.flash', 'Shortcut set: Familiar from Flash / Animate', 'Help'),
      c('quests.resume', 'Carry on with my quest', 'Help'),
      c('quests.stop', 'Put this quest down for now', 'Help'),
      c('pen.check', 'Check my pen with Quill...', 'Help'),
      c('help.sendReport', 'Tell the makers what happened...', 'Help'),
      c('help.about', 'About Frameling', 'Help'),
    ]);
    expect(shape(resolveMenu(help, MENUS, r.lookup, r.all, SUBMENUS))).toEqual(['help.contents', '-', 'help.sendReport', '-', 'help.about']);
  });
  it('the Skeleton submenu says what it is for, plain word first', () => {
    expect(SUBMENUS.rig.label).toBe('Skeleton (rig)');
    expect(menuTitle(MENUS.find((m) => m.label === 'Animate')!)).toBe('Frames and motion');
  });
});

describe('submenus', () => {
  const subs: Record<string, SubmenuDef> = { exp: { label: 'Export', items: ['file.export', '-', 'file.exportGif'], prefixes: ['file.export'] } };
  const menu: MenuDef = { label: 'File', categories: ['File'], items: ['file.new', '-', 'sub:exp', 'audio.import'] };

  it('gathers its entries, plus unnamed commands with its prefix, and nothing of it repeats at the bottom', () => {
    const r = registry([c('file.new'), c('file.export'), c('file.exportGif'), c('file.exportPdf', 'PDF', 'File'), c('audio.import'), c('file.recent', 'Recent', 'File')]);
    expect(shape(resolveMenu(menu, [menu], r.lookup, r.all, subs))).toEqual(['file.new', '-', { Export: ['file.export', '-', 'file.exportGif', 'file.exportPdf'] }, 'audio.import', '-', 'file.recent']);
  });
  it('is left out when nothing in it exists', () => {
    const r = registry([c('file.new')]);
    expect(shape(resolveMenu(menu, [menu], r.lookup, r.all, subs))).toEqual(['file.new']);
  });
  it('the File menu keeps every export in one Export submenu', () => {
    expect(MENUS[0].items).toContain('sub:export');
    expect(MENUS[0].items.filter((e) => e.startsWith('file.export'))).toEqual([]);
    expect(SUBMENUS.export.items).toContain('file.export');
  });
});

describe('headings', () => {
  const subs: Record<string, SubmenuDef> = { exp: { label: 'Export', items: ['a', 'heading:Games', 'b', 'heading:Empty', 'heading:Other', 'c'] } };
  const menu: MenuDef = { label: 'File', categories: [], items: ['sub:exp'] };
  it('keep a heading only when a command follows it', () => {
    const r = registry([c('a'), c('b'), c('c')]);
    expect(shape(resolveMenu(menu, [menu], r.lookup, r.all, subs))).toEqual([{ Export: ['a', '# Games', 'b', '# Other', 'c'] }]);
    const r2 = registry([c('a')]);
    expect(shape(resolveMenu(menu, [menu], r2.lookup, r2.all, subs))).toEqual([{ Export: ['a'] }]);
  });
});

describe('the real menus', async () => {
  await import('../../src/renderer/features');
  const { resolveMenus } = await import('../../src/ui/menus');
  type Item = ReturnType<typeof resolveMenu>[number];
  const flat = (items: Item[]): string[] => items.flatMap((i) => (i.kind === 'command' ? [i.command.id] : i.kind === 'submenu' ? flat(i.items) : []));
  const menu = (label: string) => resolveMenus().find((m) => m.menu.label === label)!.items;
  const depth = (items: Item[]): number => items.filter((i) => i.kind !== 'separator' && i.kind !== 'heading').length;

  // A menu is as tall as its rows: 30px an entry, 11px a divider, 14px of padding. The window is 900px and the menu may be
  // the window less 56px, so this is the real test of "can I see all of View", which counting entries could not be.
  const heightOf = (items: Item[]): number => depth(items) * 30 + items.filter((i) => i.kind === 'separator').length * 11 + items.filter((i) => i.kind === 'heading').length * 28 + 14;
  it('View fits a 900px window without scrolling, and nothing in it is more than a submenu deep', () => {
    expect(heightOf(menu('View'))).toBeLessThanOrEqual(900 - 56);
    const levels = (items: Item[]): number => 1 + Math.max(0, ...items.map((i) => (i.kind === 'submenu' ? levels(i.items) : 0)));
    expect(levels(menu('View'))).toBeLessThanOrEqual(2);
  });
  it('View is short enough to see, with workspaces near the top', () => {
    const items = menu('View');
    expect(depth(items)).toBeLessThan(41);
    const ids = items.flatMap((i) => (i.kind === 'command' ? [i.command.id] : []));
    for (const id of ['view.workspace.draw', 'view.workspace.animate', 'view.workspace.pixel']) expect(ids).toContain(id);
    expect(ids.indexOf('view.workspace.draw')).toBeLessThan(10);
    // Saving, managing, sharing and resetting sit one step in, under the three workspaces.
    const mine = items.find((i) => i.kind === 'submenu' && i.label === 'Your workspaces');
    expect(flat(mine && mine.kind === 'submenu' ? mine.items : [])).toEqual(expect.arrayContaining(['view.saveWorkspace', 'view.manageWorkspaces', 'view.resetLayout', 'view.exportWorkspace', 'view.workspaceSwitcher.tabs']));
  });
  // A submenu is a menu too, and the cap above only ever counted TOP-LEVEL entries: a submenu counted as one line
  // however much was inside it. So the whole of the audience work could land in View and the check stayed green while
  // the thing it exists for (a list you can see without scrolling) quietly stopped being true. This counts every list.
  it('no submenu grows into a list you cannot see at once', () => {
    // Lists built from the person's own things rather than from the design. A brush list is as long as your brushes,
    // and capping it would mean hiding brushes you made. Nothing else belongs here: a long list of COMMANDS is a
    // design problem and splitting it is the fix.
    const madeOfYourThings = ['Saved brushes'];
    const tooLong: string[] = [];
    const walk = (items: Item[], path: string): void => {
      for (const i of items) {
        if (i.kind !== 'submenu') continue;
        const n = depth(i.items);
        if (n >= 41 && !madeOfYourThings.includes(i.label)) tooLong.push(`${path} > ${i.label} has ${n} entries`);
        walk(i.items, `${path} > ${i.label}`);
      }
    };
    for (const m of resolveMenus()) walk(m.items, m.menu.label);
    expect(tooLong).toEqual([]);
  });

  it('there are eight menus, and the long ones sort their entries into submenus rather than one long list', () => {
    expect(resolveMenus().map((m) => menuTitle(m.menu))).toEqual(['File', 'Edit', 'View', 'Tools and layers', 'Pixel tools', 'Frames and motion', 'Streaming', 'Help']);
    for (const m of resolveMenus()) expect(depth(m.items), m.menu.label).toBeLessThan(41);
    // Nothing lands in a tail at the bottom of a menu: every command is named where it belongs, so a menu comes out the
    // same with its categories taken away.
    const bare = (label: string) => flat(resolveMenu({ ...MENUS.find((x) => x.label === label)!, categories: [] }));
    for (const label of ['File', 'Edit', 'View', 'Draw', 'Pixel', 'Animate']) expect(flat(menu(label)), label).toEqual(bare(label));
  });
  it('Streaming is a menu of its own: stream-safe, OBS, the capture view and the audience tools, each part a group, every entry three clicks from the bar', () => {
    const inside = menu('Streaming');
    const own = flat(inside);
    for (const id of ['features.streamingOff', 'features.streamingOn', 'view.streamSafe', 'stream.obsLink', 'stream.obsLook', 'stream.obsSettings', 'capture.toggle', 'capture.size.1920x1080', 'audience.toggle', 'audience.drawing', 'audience.kill', 'streamdoor.settings', 'streamoverlay.settings', 'twitch.connect', 'promptjar.pull', 'votes.start', 'guess.start', 'quillreacts.cheer', 'dares.list', 'penmods.list']) expect(own, id).toContain(id);
    const groups = inside.filter((i) => i.kind === 'submenu').map((i) => (i.kind === 'submenu' ? i.label : ''));
    expect(groups).toEqual(expect.arrayContaining(['Capture view', 'Actions door', 'Stream overlay', 'Twitch', 'Prompt jar', 'Votes', 'Guess the drawing']));
    // Streaming is not also spread over View: Look and sound is about looks and sounds.
    const rest = flat(menu('View'));
    expect(rest.filter((id) => /^(audience|streamdoor|streamoverlay|twitch|promptjar|votes|guess|quillreacts|dares|penmods|capture|stream)\./.test(id) || id === 'view.streamSafe')).toEqual([]);
    // No submenu inside a submenu: a command is the bar, a submenu, then itself.
    for (const g of inside) if (g.kind === 'submenu') expect(g.items.filter((i) => i.kind === 'submenu'), g.label).toEqual([]);
    expect(depth(inside)).toBeLessThan(26);
  });
  it('the second window sits with the panel windows, not with streaming', () => {
    const windows = menu('View').find((i) => i.kind === 'submenu' && i.label === 'Panel windows and tools');
    expect(flat(windows && windows.kind === 'submenu' ? windows.items : [])).toEqual(expect.arrayContaining(['popout.toggle', 'popout.front']));
  });
  it('Quill is one entry in View, a submenu with his house inside, and every one of his commands is still in it', () => {
    const quill = menu('View').filter((i) => i.kind === 'submenu' && i.label === "Quill's house");
    expect(quill).toHaveLength(1);
    expect(flat(quill[0].kind === 'submenu' ? quill[0].items : [])).toEqual(['quillPet.open', 'quillPet.things', 'quillPet.presents', 'quillPet.lately', 'quillPet.give', 'quillPet.pat', 'quillPet.yours']);
    expect(flat(menu('View').filter((i) => i.kind === 'command'))).not.toContain('quillPet.open');
  });
  it('Snapping, panels and windows are their own submenus', () => {
    const subs = menu('View').filter((i) => i.kind === 'submenu').map((i) => (i.kind === 'submenu' ? i.label : ''));
    expect(subs).toEqual(expect.arrayContaining(['Snapping', 'Panels', 'Panel windows and tools']));
    const snap = menu('View').find((i) => i.kind === 'submenu' && i.label === 'Snapping');
    expect(flat(snap && snap.kind === 'submenu' ? snap.items : [])).toEqual(expect.arrayContaining(['view.snap', 'view.snapOptions', 'view.snap.guides', 'view.snap.artboards']));
    expect(flat(menu('View').filter((i) => i.kind === 'command'))).not.toContain('view.snap.guides');
  });
  it('Artboards is a submenu of Frames and motion, and View carries no artboard commands', () => {
    const sub = menu('Animate').find((i) => i.kind === 'submenu' && i.label === 'Artboards');
    const own = flat(sub && sub.kind === 'submenu' ? sub.items : []);
    for (const id of ['artboards.new', 'artboards.delete', 'artboards.makeVariation', 'artboards.fitFill', 'artboards.pictureFirst', 'artboards.zoomTo']) expect(own).toContain(id);
    expect(flat(menu('View')).filter((id) => id.startsWith('artboards.') && id !== 'view.panel.artboards')).toEqual([]);
  });
  it('every View and Artboards command is still in some menu (and in the palette)', () => {
    const everything = new Set(resolveMenus().flatMap((m) => flat(m.items)));
    return import('../../src/core/registry').then(({ allCommands }) => {
      const missing = allCommands()
        .filter((cmd) => (cmd.category === 'View' || cmd.category === 'Artboards') && !cmd.id.startsWith('view.workspace.'))
        .filter((cmd) => !everything.has(cmd.id))
        .map((cmd) => cmd.id);
      expect(missing).toEqual([]);
    });
  });
  it('no menu lists a command twice', () => {
    for (const m of resolveMenus()) {
      const ids = flat(m.items);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i), m.menu.label).toEqual([]);
    }
  });
  it('File lists the two open-a-picture commands once, in Import, not at the bottom', () => {
    const file = menu('File');
    expect(flat(file.filter((i) => i.kind === 'command'))).not.toContain('file.openPicture');
    expect(flat(file).filter((id) => id === 'file.openPicture' || id === 'file.openAseprite')).toHaveLength(2);
  });
  it('Export is grouped: popular first, then game engines (Godot add-on there), then other', () => {
    const exp = menu('File').find((i) => i.kind === 'submenu' && i.label === 'Export');
    const rows = exp && exp.kind === 'submenu' ? exp.items.map((i) => (i.kind === 'heading' ? `# ${i.label}` : i.kind === 'command' ? i.command.id : '-')) : [];
    const at = (x: string) => rows.indexOf(x);
    expect(at('# Popular')).toBeLessThan(at('# Game engines'));
    expect(at('# Game engines')).toBeLessThan(at('file.exportGodotAddon'));
    expect(at('file.exportGodotAddon')).toBeLessThan(at('# Other'));
    expect(at('file.exportLottie')).toBeLessThan(at('# Game engines'));
    expect(at('file.exportPsd')).toBeGreaterThan(at('# Other'));
    expect(rows[0]).toBe('file.export');
  });
});

describe('menu keys', () => {
  it('Home, End and the Page keys land inside the list', () => {
    expect(jumpTo('Home', 5, 20)).toBe(0);
    expect(jumpTo('End', 5, 20)).toBe(19);
    expect(jumpTo('PageDown', 5, 20)).toBe(13);
    expect(jumpTo('PageDown', 15, 20)).toBe(19);
    expect(jumpTo('PageUp', 3, 20)).toBe(0);
  });
});
