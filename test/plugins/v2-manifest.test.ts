import { describe, expect, it } from 'vitest';
import { PLUGIN_API_VERSION, packPlugin, parseManifest, PluginProblem, readPluginFiles, samePermissions } from '../../src/plugins/manifest';
import { exampleFiles } from './harness';

const base = { id: 'my-plugin', name: 'My plugin', version: '1.0.0' };

describe('manifest version 2', () => {
  it('knows version 2, and a manifest that does not say is still version 1', () => {
    expect(PLUGIN_API_VERSION).toBe(2);
    expect(parseManifest({ ...base, permissions: [] }).apiVersion).toBe(1);
    expect(parseManifest({ ...base, apiVersion: 2, permissions: [] }).apiVersion).toBe(2);
    expect(() => parseManifest({ ...base, apiVersion: 3 })).toThrow(/newer Frameling/);
  });

  it('reads the new powers, with document.write as another name for document.edit', () => {
    const m = parseManifest({ ...base, apiVersion: 2, permissions: ['tools', 'canvas', 'shapes', 'files.read', 'document.write', 'document.edit'] });
    expect(m.permissions).toEqual(['tools', 'canvas', 'shapes', 'files.read', 'document.edit']);
  });

  it('refuses version 2 things in a version 1 manifest, saying what to change', () => {
    for (const extra of [{ permissions: ['tools'] }, { permissions: ['canvas'] }, { permissions: [], events: ['frame.changed'] }, { permissions: [], exporters: { a: { options: [{ id: 'x', type: 'switch' }] } } }]) {
      expect(() => parseManifest({ ...base, ...extra, apiVersion: 1 })).toThrow(/"apiVersion": 2/);
    }
    expect(() => parseManifest({ ...base, permissions: ['document.write'] })).toThrow(/permission/);
  });

  it('keeps only events Frameling has', () => {
    expect(parseManifest({ ...base, apiVersion: 2, permissions: [], events: ['frame.changed', 'frame.changed', 'export.started'] }).events).toEqual(['frame.changed', 'export.started']);
    expect(() => parseManifest({ ...base, apiVersion: 2, permissions: [], events: ['keys.pressed'] })).toThrow(/event/);
  });

  it('reads exporter options, cleaning them', () => {
    const m = parseManifest({
      ...base,
      apiVersion: 2,
      permissions: ['export'],
      exporters: { png: { options: [{ id: 'n', type: 'number', label: 'N', min: 1, max: 5, default: 99 }, { id: 'bad', type: 'colour' }, { id: 'n', type: 'switch' }] } },
    });
    expect(m.exporterOptions.png).toEqual([{ id: 'n', type: 'number', label: 'N', min: 1, max: 5, step: 1, default: 5 }]);
  });

  it('every version 1 example still loads unchanged, and is stored the way it was written', () => {
    for (const name of ['flip-every-other-frame', 'contact-sheet']) {
      const pkg = readPluginFiles(exampleFiles(name));
      expect(pkg.manifest.apiVersion).toBe(1);
      expect(pkg.manifest.events).toEqual([]);
      const again = readPluginFiles({ 'manifest.json': new TextEncoder().encode(JSON.stringify(JSON.parse(new TextDecoder().decode(exampleFiles(name)['manifest.json'])))), 'main.js': exampleFiles(name)['main.js'] });
      expect(again.manifest).toEqual(pkg.manifest);
      expect(packPlugin(pkg).length).toBeGreaterThan(0);
    }
  });

  it('every version 2 example loads and asks for what it uses', () => {
    const asks = (name: string) => readPluginFiles(exampleFiles(name)).manifest;
    expect(asks('star-kit').permissions).toEqual(['document.read', 'tools', 'shapes', 'panels']);
    expect(asks('drawing-guides')).toMatchObject({ permissions: ['canvas', 'panels'], events: ['frame.changed'] });
    expect(asks('layer-fader').permissions).toEqual(['document.read', 'document.edit', 'tools']);
    expect(asks('export-report').exporterOptions.report.map((o) => o.type)).toEqual(['text', 'choice', 'number', 'switch']);
  });

  it('remembers what it asked about, so a refused power is not asked again but a new one is', () => {
    const m = parseManifest({ ...base, apiVersion: 2, permissions: ['tools', 'canvas'] });
    const decision = { permissions: ['tools' as const], network: [], asked: ['tools' as const, 'canvas' as const], askedNetwork: [] };
    expect(samePermissions(m, decision)).toBe(true);
    const newer = parseManifest({ ...base, version: '1.1.0', apiVersion: 2, permissions: ['tools', 'canvas', 'shapes'] });
    expect(samePermissions(newer, decision)).toBe(false);
    // What was saved before version 2 had no list of what was asked: what was allowed counts.
    expect(samePermissions(m, { permissions: ['tools'], network: [] })).toBe(false);
  });
});
