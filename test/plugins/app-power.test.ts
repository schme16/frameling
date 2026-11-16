// The `app` power: pressing Frameling's own commands and choosing what they act on. A plugin must ask for it, and may
// never press what reaches outside the drawing.
import { afterEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { parseManifest, type Permission } from '../../src/plugins/manifest';
import { ELEVATED, RISKS, elevatedIn } from '../../src/plugins/powers';
import { PluginRuntime, type HostHooks } from '../../src/plugins/runtime';
import { closeAll, runPlugin, settle } from './harness';

afterEach(closeAll);

const manifest = (permissions: Permission[]) => ({ id: 't', name: 'T', version: '1', description: '', author: '', main: 'main.js', permissions, network: [], apiVersion: 2, events: [], exporterOptions: {} });

function start(code: string, permissions: Permission[]) {
  const log: string[] = [];
  const hooks: HostHooks = {
    getDoc: () => newDoc({ name: 'Doc' }),
    getState: () => ({ frame: 2, activeLayerId: 'L', selection: ['s1'], drawingId: null }),
    edit: () => undefined,
    notify: (m) => void log.push(`notify:${m}`),
    addCommand: () => undefined,
    addExporter: () => undefined,
    addPanel: () => undefined,
    updatePanel: () => undefined,
    problem: (m) => void log.push(`problem:${m}`),
    appCommands: () => [{ id: 'edit.duplicate', label: 'Duplicate', category: 'Edit', description: '', keys: [], enabled: true }],
    appRun: async (id) => void log.push(`ran:${id}`),
    appSet: (w) => void log.push(`set:${JSON.stringify(w)}`),
  };
  const w = runPlugin(code);
  const rt = new PluginRuntime(manifest(permissions), permissions, w.transport, hooks);
  return { rt, log };
}

const COMMAND = (body: string) => `frameling.commands.register({ id: 'x', label: 'X' }, async () => { ${body} });`;

describe('the app power', () => {
  it('is its own permission, one a version 2 plugin must be allowed one by one', () => {
    expect(parseManifest({ id: 'abc', name: 'A', apiVersion: 2, permissions: ['app'] }).permissions).toEqual(['app']);
    expect(ELEVATED).toContain('app');
    expect(RISKS.app).toMatch(/undo/i);
    expect(elevatedIn({ permissions: ['app', 'document.read'], apiVersion: 2 })).toEqual(['app']);
  });

  it('lets a plugin that has it list, press and choose', async () => {
    const { rt, log } = start(COMMAND(`const c = await frameling.app.commands(); await frameling.ui.notify('n=' + c.length); await frameling.app.run('edit.duplicate'); await frameling.app.set({ frame: 4, selection: ['a'] });`), ['app']);
    await settle();
    await rt.runCommand('x');
    await settle();
    expect(log).toContain('notify:n=1');
    expect(log).toContain('ran:edit.duplicate');
    expect(log).toContain('set:{"frame":4,"selection":["a"]}');
  });

  it('refuses a plugin that did not ask for it, whatever it sends', async () => {
    const { rt, log } = start(COMMAND(`for (const f of [() => frameling.app.run('edit.duplicate'), () => frameling.app.commands(), () => frameling.app.set({ frame: 1 })]) { try { await f(); await frameling.ui.notify('allowed'); } catch (e) { await frameling.ui.notify('refused: ' + e.message); } }`), ['document.read']);
    await settle();
    await rt.runCommand('x');
    await settle();
    expect(log.filter((l) => l.startsWith('ran:') || l.startsWith('set:'))).toEqual([]);
    expect(log.filter((l) => l.startsWith('notify:refused')).length).toBe(3);
    expect(log.some((l) => l.includes('allowed'))).toBe(false);
  });

  it('may not press what reaches outside the drawing, even with the power', async () => {
    const { rt, log } = start(COMMAND(`for (const id of ['file.save', 'app.restart', 'plugin.a.b', 'script.sabc12']) { try { await frameling.app.run(id); } catch (e) { await frameling.ui.notify(e.message); } }`), ['app']);
    await settle();
    await rt.runCommand('x');
    await settle();
    expect(log.filter((l) => l.startsWith('ran:'))).toEqual([]);
    expect(log.filter((l) => /can't press/.test(l))).toHaveLength(4);
  });

  it('turns a bad choice into a plain sentence', async () => {
    const { rt, log } = start(COMMAND(`try { await frameling.app.set({ color: 'red' }); } catch (e) { await frameling.ui.notify(e.message); }`), ['app']);
    await settle();
    await rt.runCommand('x');
    await settle();
    expect(log.some((l) => /color must be a colour like/.test(l))).toBe(true);
    expect(log.some((l) => l.startsWith('set:'))).toBe(false);
  });

  it('says what is picked, with document.read', async () => {
    const { rt, log } = start(COMMAND(`const p = await frameling.document.selected(); await frameling.ui.notify(JSON.stringify([p.frame, p.layerId, p.shapes.length]));`), ['document.read']);
    await settle();
    await rt.runCommand('x');
    await settle();
    expect(log).toContain('notify:[2,"L",0]');
  });

  it('keeps what is picked back from a plugin that may not read the drawing', async () => {
    const { rt, log } = start(COMMAND(`try { await frameling.document.selected(); } catch (e) { await frameling.ui.notify(e.message); }`), []);
    await settle();
    await rt.runCommand('x');
    await settle();
    expect(log.some((l) => /permission/.test(l))).toBe(true);
  });
});

describe('what a plugin prints and where an error was', () => {
  it('hears console.log through the host, up to a limit a second', async () => {
    const printed: string[] = [];
    const log: string[] = [];
    const hooks: HostHooks = { getDoc: () => newDoc(), getState: () => ({ frame: 0, activeLayerId: null, selection: [], drawingId: null }), edit: () => undefined, notify: () => undefined, addCommand: () => undefined, addExporter: () => undefined, addPanel: () => undefined, updatePanel: () => undefined, problem: (m) => void log.push(m), printed: (level, text) => void printed.push(`${level}:${text}`) };
    const w = runPlugin(COMMAND(`for (let i = 0; i < 500; i++) self.console.log('line', i); self.console.error('bad');`));
    const rt = new PluginRuntime(manifest([]), [], w.transport, hooks);
    await settle();
    await rt.runCommand('x');
    await settle(20);
    expect(printed[0]).toBe('log:line 0');
    // The worker sends at most a hundred a second, whatever the script does.
    expect(printed.length).toBeLessThanOrEqual(101);
  });
});
