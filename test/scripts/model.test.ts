import { describe, expect, it } from 'vitest';
import { readPluginZip } from '../../src/plugins/manifest';
import { commandIdOf, countsAsPasted, describeScript, lookAt, packScripts, pluginSlug, sanitizeScripts, scriptAsPlugin, scriptAsPluginZip, scriptIdOf, uniqueName, wrapScript } from '../../src/scripts/model';

describe('script model', () => {
  it('wraps a script so its line numbers are its own', () => {
    const wrapped = wrapScript('Make red', 'const a = 1;\nthrow new Error("x");');
    const lines = wrapped.split('\n');
    // The opening shares the first line with the first line of the code; the second line of code is the second line of the file.
    expect(lines[0]).toContain('const a = 1;');
    expect(lines[1]).toBe('throw new Error("x");');
  });

  it('names its command script.<id> and finds the id again', () => {
    expect(commandIdOf('sabc12')).toBe('script.sabc12');
    expect(scriptIdOf('script.sabc12')).toBe('sabc12');
    expect(scriptIdOf('scripts.open')).toBeNull();
    expect(scriptIdOf('plugin.x.y')).toBeNull();
  });

  it('keeps names unique', () => {
    expect(uniqueName('Make red', [])).toBe('Make red');
    expect(uniqueName('Make red', ['make red'])).toBe('Make red 2');
    expect(uniqueName('  ', [])).toBe('My script');
  });

  it('never takes a script out of a drawing as reviewed, whatever the file says', () => {
    const raw = [{ id: 'sabc12', name: 'A', code: 'x', reviewed: true, updated: 1 }];
    expect(sanitizeScripts(raw, 'doc')[0].reviewed).toBe(false);
    expect(sanitizeScripts(raw, 'app')[0].reviewed).toBe(true);
    expect(sanitizeScripts([{ id: 'sabc12', name: 'A', code: 'x', reviewed: false }], 'app')[0].reviewed).toBe(false);
  });

  it('drops what is not a script and caps what is too big', () => {
    const list = sanitizeScripts([null, 5, { id: 'BAD ID', code: 'x' }, { id: 'sabc12', code: 3 }, { id: 'sok123', code: 'y'.repeat(200_000) }, { id: 'sok123', code: 'dup' }], 'app');
    expect(list).toHaveLength(1);
    expect(list[0].code.length).toBe(100_000);
    expect(sanitizeScripts('nope', 'app')).toEqual([]);
  });

  it('packs a script without a review mark inside a drawing', () => {
    const s = sanitizeScripts([{ id: 'sabc12', name: 'A', code: 'x' }], 'app');
    expect(packScripts(s, 'doc')[0]).not.toHaveProperty('reviewed');
    expect(packScripts(s, 'app')[0]).toHaveProperty('reviewed', true);
  });

  it('counts a paste of a line or more as coming from outside, and a word or two as typing', () => {
    expect(countsAsPasted('x')).toBe(false);
    expect(countsAsPasted('frameling.app')).toBe(false);
    expect(countsAsPasted('await frameling.document.get()')).toBe(true);
    expect(countsAsPasted('a;\nb;')).toBe(true);
  });

  it('reads what a script says for the look-first sheet', () => {
    const known = (id: string) => ['edit.duplicate', 'file.save'].includes(id);
    const look = lookAt(`await frameling.app.run('edit.duplicate');\nawait frameling.app.run("file.save");\nwhile (true) {}\nfetch('https://x.example')`, known);
    expect(look.commandIds).toEqual(['edit.duplicate', 'file.save']);
    expect(look.blocked).toEqual(['file.save']);
    expect(look.runsCommands).toBe(true);
    expect(look.endlessLoop).toBe(true);
    expect(look.mentionsInternet).toBe(true);
    const quiet = lookAt('console.log(1)', known);
    expect(quiet).toMatchObject({ commandIds: [], runsCommands: false, endlessLoop: false, mentionsInternet: false });
  });

  it('describes a script by its first comment', () => {
    expect(describeScript('// Turn it red\nconst a = 1')).toBe('Turn it red');
    expect(describeScript('/* Spread them out */\nx')).toBe('Spread them out');
    expect(describeScript('const a = 1')).toBe('');
  });
});

describe('a script becomes a plugin by moving, not by being rewritten', () => {
  it('makes a plugin id from a name', () => {
    expect(pluginSlug('Turn the picked shapes red!')).toBe('turn-the-picked-shapes-red');
    expect(pluginSlug('Ab')).toMatch(/^[a-z0-9-]{3,60}$/);
    expect(pluginSlug('日本語')).toMatch(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/);
  });

  it('is a valid plugin package that holds the same code in a command of its own', () => {
    const s = { name: 'Make red', code: "const p = await frameling.document.selected();\nawait frameling.ui.notify('x');\n" };
    const pkg = readPluginZip(scriptAsPluginZip(s));
    expect(pkg.manifest.id).toBe('make-red');
    expect(pkg.manifest.apiVersion).toBe(2);
    expect(pkg.manifest.permissions.sort()).toEqual(['app', 'document.edit', 'document.read']);
    expect(pkg.code).toBe(wrapScript('Make red', s.code));
    expect(scriptAsPlugin(s).main).toBe(pkg.code);
  });
});
