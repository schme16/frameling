// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCommand, getPanel } from '../../src/core/registry';
import { resetStore } from '../../src/core/store';
import { newDoc } from '../../src/core/doc';
import { installFrom, loadPlugins, plugins, removePlugin, resetPluginsForTests, setEnabled, setSandboxStarterForTests } from '../../src/plugins/manager';
import { readPluginFiles } from '../../src/plugins/manifest';
import { memoryLibrary, setLibraryForTests } from '../../src/platform/library';
import { closeAll, exampleFiles, runPlugin, settle } from './harness';

beforeEach(() => {
  localStorage.clear();
  setLibraryForTests(memoryLibrary);
  setSandboxStarterForTests(async (pkg) => runPlugin(pkg.code, { id: pkg.manifest.id }).transport);
  window.confirm = () => true;
  resetStore(newDoc());
});

afterEach(async () => {
  resetPluginsForTests();
  for (const e of await memoryLibrary.list('plugins')) await memoryLibrary.remove('plugins', e.id);
  setLibraryForTests(null);
  closeAll();
});

describe('plugin manager', () => {
  it('installs after asking, adds its command and panel, and takes them away when turned off', async () => {
    expect(await installFrom(exampleFiles('flip-every-other-frame'))).toBe(true);
    await settle();
    expect(plugins.get()[0]).toMatchObject({ enabled: true, status: 'on', granted: ['document.read', 'document.edit', 'panels'] });
    expect(getCommand('plugin.flip-every-other-frame.flip')?.category).toBe('Plugins');
    expect(getPanel('plugin.flip-every-other-frame.flip')?.title).toBe('Flip frames');
    await setEnabled('flip-every-other-frame', false);
    expect(getCommand('plugin.flip-every-other-frame.flip')).toBeUndefined();
    expect(getPanel('plugin.flip-every-other-frame.flip')).toBeUndefined();
    expect(plugins.get()[0].status).toBe('off');
  });

  it('does not install when they say no', async () => {
    window.confirm = () => false;
    expect(await installFrom(exampleFiles('contact-sheet'))).toBe(false);
    expect(plugins.get()).toEqual([]);
    expect(await memoryLibrary.list('plugins')).toEqual([]);
  });

  it('comes back on at the next start, and keeps an update that asks for more turned off', async () => {
    await installFrom(exampleFiles('contact-sheet'));
    await settle();
    resetPluginsForTests();
    await loadPlugins();
    await settle();
    expect(getCommand('plugin.contact-sheet.export.png')?.label).toBe('Export Contact sheet (PNG)...');
    // The stored copy now asks for the internet too: it waits to be allowed.
    const pkg = readPluginFiles(exampleFiles('contact-sheet'));
    const { packPlugin } = await import('../../src/plugins/manifest');
    await memoryLibrary.write('plugins', 'contact-sheet', packPlugin({ ...pkg, manifest: { ...pkg.manifest, permissions: ['export', 'network'], network: ['https://a.example.com'] } }));
    resetPluginsForTests();
    await loadPlugins();
    expect(plugins.get()[0]).toMatchObject({ enabled: false });
    expect(plugins.get()[0].problem).toMatch(/more than before/);
  });

  it('removes a plugin and what it stored', async () => {
    await installFrom(exampleFiles('contact-sheet'));
    await settle();
    await removePlugin('contact-sheet');
    expect(plugins.get()).toEqual([]);
    expect(await memoryLibrary.list('plugins')).toEqual([]);
    expect(getCommand('plugin.contact-sheet.export.png')).toBeUndefined();
  });

  it('says plainly when a file is not a plugin', async () => {
    expect(await installFrom(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});
