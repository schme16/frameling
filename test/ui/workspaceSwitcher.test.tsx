// @vitest-environment jsdom
// The workspace switcher: which workspaces get tabs, the keys for the three built in, menus that don't read as
// workspaces, the preference, and the real component switching workspace.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { allCommands, getCommand, registerPanel } from '../../src/core/registry';
import { resetStore } from '../../src/core/store';
import '../../src/renderer/features';
import { applyWorkspace, builtinWorkspaces, dock, resetDock, saveWorkspace } from '../../src/ui/dock';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { effectiveKeys, matchEvent } from '../../src/ui/keys';
import { MENUS, menuTitle } from '../../src/ui/menus';
import { DEFAULT_PREFS, migratePrefs, setPrefs } from '../../src/ui/prefs';
import { WorkspaceSwitcher } from '../../src/ui/WorkspaceSwitcher';
import { chipName, MAX_TABS, switcherSlots, WORKSPACE_KEYS } from '../../src/ui/switcherModel';
import { getHelp } from '../../src/core/registry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `w${i}` }));

describe('switcherSlots', () => {
  it('gives every workspace a tab while they fit', () => {
    expect(switcherSlots(ids(3), 'w0')).toEqual({ tabs: ids(3), more: [] });
    expect(switcherSlots(ids(MAX_TABS), 'w4').more).toEqual([]);
  });
  it('puts the overflow behind More, in order', () => {
    const r = switcherSlots(ids(8), 'w1');
    expect(r.tabs.map((w) => w.id)).toEqual(['w0', 'w1', 'w2', 'w3', 'w4']);
    expect(r.more.map((w) => w.id)).toEqual(['w5', 'w6', 'w7']);
  });
  it('keeps the one in use on a tab, even from the far end of the list', () => {
    const r = switcherSlots(ids(8), 'w7');
    expect(r.tabs.map((w) => w.id)).toEqual(['w0', 'w1', 'w2', 'w3', 'w7']);
    expect(r.more.map((w) => w.id)).toEqual(['w4', 'w5', 'w6']);
    // Nothing lost or doubled.
    expect([...r.tabs, ...r.more].map((w) => w.id).sort()).toEqual(ids(8).map((w) => w.id).sort());
  });
  it('copes with an unknown current id and with a tiny limit', () => {
    expect(switcherSlots(ids(7), 'gone').tabs).toHaveLength(MAX_TABS);
    expect(switcherSlots(ids(4), 'w3', 1).tabs.map((w) => w.id)).toEqual(['w3']);
  });
});

describe('chipName', () => {
  it('is the name of the workspace in use, with a plain fallback', () => {
    const all = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
    expect(chipName(all, 'b')).toBe('Beta');
    expect(chipName(all, 'zzz')).toBe('Workspace');
  });
});

describe('keys for the built-in workspaces', () => {
  it('Draw, Animate and Pixel each have a key, and nothing else shares it', () => {
    syncDynamicCommands();
    for (const [id, key] of Object.entries(WORKSPACE_KEYS)) {
      const c = getCommand(`view.workspace.${id}`)!;
      expect(effectiveKeys(c, {})).toEqual([key]);
      const sharing = allCommands().filter((x) => effectiveKeys(x, {}).includes(key));
      expect(sharing.map((x) => x.id)).toEqual([c.id]);
    }
  });
  it('are real key presses (Ctrl+Alt+1 on a PC)', () => {
    const press = { key: '1', code: 'Digit1', ctrlKey: true, altKey: true, shiftKey: false, metaKey: false };
    expect(matchEvent(press, 'Mod+Alt+1', false)).toBe(true);
  });
  it('a workspace of your own starts with no key', () => {
    resetDock();
    const w = saveWorkspace('Mine')!;
    syncDynamicCommands();
    expect(effectiveKeys(getCommand(`view.workspace.${w.id}`)!, {})).toEqual([]);
  });
});

describe('menus are not workspaces', () => {
  const names = builtinWorkspaces().map((w) => w.name);
  it('Draw, Pixel and Animate keep their ids but say what is in them', () => {
    for (const label of ['Draw', 'Pixel', 'Animate']) {
      const m = MENUS.find((x) => x.label === label)!;
      expect(m, label).toBeTruthy();
      expect(menuTitle(m)).not.toBe(label);
    }
    expect(MENUS.map(menuTitle)).toEqual(['File', 'Edit', 'View', 'Tools and layers', 'Pixel tools', 'Frames and motion', 'Help']);
  });
  it('no menu on the bar is called the same as a workspace', () => {
    for (const m of MENUS) expect(names).not.toContain(menuTitle(m));
  });
});

describe('the preference', () => {
  it('starts on tabs, and an unknown value falls back', () => {
    expect(DEFAULT_PREFS.workspaceSwitcher).toBe('tabs');
    expect(migratePrefs({}).workspaceSwitcher).toBe('tabs');
    expect(migratePrefs({ workspaceSwitcher: 'banner' }).workspaceSwitcher).toBe('tabs');
    for (const v of ['tabs', 'chip', 'off']) expect(migratePrefs({ workspaceSwitcher: v }).workspaceSwitcher).toBe(v);
  });
  it('has a command for each look, with a tick on the one in use', () => {
    syncDynamicCommands();
    for (const look of ['tabs', 'chip', 'off'] as const) {
      const c = getCommand(`view.workspaceSwitcher.${look}`)!;
      expect(c.help).toBe('workspace-switcher');
      act(() => c.run());
      expect(c.checked?.({} as never)).toBe(true);
    }
    setPrefs({ workspaceSwitcher: 'tabs' });
  });
  it('has a help topic', () => {
    expect(getHelp('workspace-switcher')?.media).toBe('workspace-switcher.mp4');
  });
});

describe('the component', () => {
  let root: Root;
  let host: HTMLElement;
  beforeAll(() => {
    for (const [id, order] of [['timeline', 10], ['layers', 20]] as const) registerPanel({ id, title: id, icon: 'layers', component: () => null, zone: id === 'timeline' ? 'bottom' : 'right', order });
  });
  beforeEach(() => {
    resetStore(newDoc({ width: 8, height: 8 }));
    resetDock();
    setPrefs({ workspaceSwitcher: 'tabs' });
    syncDynamicCommands();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<WorkspaceSwitcher />));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
  });
  const tab = (id: string) => host.querySelector<HTMLElement>(`.ws-tab[data-workspace="${id}"]`)!;
  const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

  it('shows a tab for each workspace and marks the one in use', () => {
    expect([...host.querySelectorAll('.ws-tab[data-workspace]')].map((e) => e.textContent)).toEqual(['Draw', 'Animate', 'Pixel']);
    expect(tab(dock.get().workspaceId).getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelectorAll('[aria-pressed=true]')).toHaveLength(1);
  });
  it('a press changes workspace and moves the mark', () => {
    click(tab('animate'));
    expect(dock.get().workspaceId).toBe('animate');
    expect(tab('animate').getAttribute('aria-pressed')).toBe('true');
    expect(tab('draw').getAttribute('aria-pressed')).toBe('false');
  });
  it('follows a switch made some other way (a key, the View menu, a quest)', () => {
    act(() => void applyWorkspace('pixel'));
    expect(tab('pixel').getAttribute('aria-pressed')).toBe('true');
  });
  it('your own workspaces get a tab as soon as you save one', () => {
    act(() => void saveWorkspace('Mine'));
    expect([...host.querySelectorAll('.ws-tab[data-workspace]')].map((e) => e.textContent)).toEqual(['Draw', 'Animate', 'Pixel', 'Mine']);
  });
  it('the arrow opens the whole list with the one in use ticked, and a choice switches', () => {
    act(() => void saveWorkspace('Mine'));
    click(host.querySelector('.ws-more')!);
    const rows = [...document.querySelectorAll<HTMLElement>('.ws-list [role=menuitemradio]')];
    expect(rows.map((r) => r.querySelector('.ui-menu-label')!.textContent)).toEqual(['Draw', 'Animate', 'Pixel', 'Mine']);
    expect(rows.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    click(rows[1]);
    expect(dock.get().workspaceId).toBe('animate');
    expect(document.querySelector('.ws-list')).toBeNull();
  });
  it('the chip look shows the name and opens the list', () => {
    act(() => setPrefs({ workspaceSwitcher: 'chip' }));
    expect(host.querySelector('.ws-tabs')).toBeNull();
    expect(host.querySelector('.ws-chip-name')!.textContent).toBe('Draw');
    click(host.querySelector('.ws-chip')!);
    expect(document.querySelector('.ws-list')).not.toBeNull();
  });
  it('hidden draws nothing', () => {
    act(() => setPrefs({ workspaceSwitcher: 'off' }));
    expect(host.innerHTML).toBe('');
  });
});
