import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { cleanOrigin, packPlugin, parseManifest, PluginProblem, readPluginFiles, readPluginZip, samePermissions } from '../../src/plugins/manifest';
import { exampleFiles } from './harness';

const base = { id: 'my-plugin', name: 'My plugin', version: '1.2.3', permissions: [] };

describe('plugin manifests', () => {
  it('fills in defaults and keeps what it knows', () => {
    const m = parseManifest({ ...base, description: 'Hi', author: 'Me', extra: 'ignored' });
    expect(m).toMatchObject({ id: 'my-plugin', name: 'My plugin', version: '1.2.3', main: 'main.js', permissions: [], network: [], apiVersion: 1 });
  });

  it('refuses bad ids, unknown permissions, scripts outside the package and newer APIs', () => {
    expect(() => parseManifest({ ...base, id: 'My Plugin!' })).toThrow(PluginProblem);
    expect(() => parseManifest({ ...base, permissions: ['files'] })).toThrow(/permission/);
    expect(() => parseManifest({ ...base, main: '../evil.js' })).toThrow(/main/);
    expect(() => parseManifest({ ...base, main: 'main.ts' })).toThrow(/main/);
    expect(() => parseManifest({ ...base, apiVersion: 99 })).toThrow(/newer Frameling/);
  });

  it('needs https sites listed for the network, and nothing else', () => {
    expect(() => parseManifest({ ...base, permissions: ['network'] })).toThrow(/which sites/);
    expect(() => parseManifest({ ...base, permissions: ['network'], network: ['http://example.com'] })).toThrow(/https/);
    expect(() => parseManifest({ ...base, permissions: ['network'], network: ['https://*.example.com'] })).toThrow(/https/);
    const m = parseManifest({ ...base, permissions: ['network'], network: ['https://api.example.com/v1/x', 'https://api.example.com'] });
    expect(m.network).toEqual(['https://api.example.com']);
    // Sites without the permission are dropped.
    expect(parseManifest({ ...base, network: ['https://a.example.com'] }).network).toEqual([]);
    expect(cleanOrigin('https://user:pw@example.com')).toBeNull();
  });

  it('reads both example plugins', () => {
    const flip = readPluginFiles(exampleFiles('flip-every-other-frame'));
    expect(flip.manifest.permissions).toEqual(['document.read', 'document.edit', 'panels']);
    const sheet = readPluginFiles(exampleFiles('contact-sheet'));
    expect(sheet.manifest.permissions).toEqual(['export']);
    expect(sheet.code).toContain('frameling.exporters.register');
  });

  it('reads zips, including ones that wrap everything in a folder, and round-trips its own', () => {
    const files = exampleFiles('contact-sheet');
    const wrapped = zipSync({ 'contact-sheet/manifest.json': files['manifest.json'], 'contact-sheet/main.js': files['main.js'] });
    const pkg = readPluginZip(wrapped);
    expect(pkg.manifest.id).toBe('contact-sheet');
    expect(readPluginZip(packPlugin(pkg))).toEqual(pkg);
    expect(() => readPluginZip(strToU8('not a zip'))).toThrow(PluginProblem);
    expect(() => readPluginZip(zipSync({ 'main.js': strToU8('') }))).toThrow(/manifest/);
    expect(() => readPluginZip(zipSync({ 'manifest.json': strToU8(JSON.stringify(base)) }))).toThrow(/missing its script/);
  });

  it('knows when an update asks for more', () => {
    const m = parseManifest({ ...base, permissions: ['document.read', 'network'], network: ['https://a.example.com'] });
    expect(samePermissions(m, { permissions: ['document.read', 'network'], network: ['https://a.example.com'] })).toBe(true);
    expect(samePermissions(m, { permissions: ['document.read'], network: [] })).toBe(false);
    expect(samePermissions(m, { permissions: ['document.read', 'network'], network: ['https://b.example.com'] })).toBe(false);
  });
});
