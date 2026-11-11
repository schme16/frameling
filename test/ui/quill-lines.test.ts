// Quill's lines: every id the code uses is in lines.json and every line is used, placeholders match, and the
// review page's changes file merges back in through dialogue:apply.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import data from '../../src/ui/mascot/lines.json';
import { fill, line, lineIds, lineParts, lines, placeholders } from '../../src/ui/mascot/lines';
// @ts-expect-error plain JS helper
import { applyChanges, checkLines, formatLines } from '../../scripts/dialogue/lines-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LINES_FILE = path.join(root, 'src/ui/mascot/lines.json');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? sources(p) : /\.tsx?$/.test(d.name) ? [p] : [];
  });
}
const code = sources(path.join(root, 'src')).map((f) => fs.readFileSync(f, 'utf8'));

/** Ids in the first argument of every line()/lines()/lineParts() call (a plain id or a ? : between two). */
function usedIds(): Set<string> {
  const ids = new Set<string>();
  for (const src of code) {
    for (const m of src.matchAll(/\b(?:line|lines|lineParts)\(([^,)]*)/g)) {
      // Leave out the comparisons in a condition (mode === 'welcome' ? ...).
      for (const q of m[1].replace(/[!=]==\s*'[^']*'/g, '').matchAll(/'([\w.]+)'/g)) ids.add(q[1]);
    }
  }
  return ids;
}

describe("Quill's lines", () => {
  it('every id the code asks for is in lines.json', () => {
    const known = new Set(lineIds() as string[]);
    const used = usedIds();
    expect(used.size).toBeGreaterThan(30);
    expect([...used].filter((id) => !known.has(id))).toEqual([]);
  });

  it('every line in lines.json is used by the code', () => {
    const used = usedIds();
    expect(lineIds().filter((id) => !used.has(id))).toEqual([]);
  });

  it('placeholders match each entry\'s vars, and every entry says where it shows', () => {
    expect(checkLines(data)).toEqual([]);
    for (const id of lineIds()) expect(placeholders(data[id].text).sort()).toEqual([...((data[id] as { vars?: string[] }).vars ?? [])].sort());
  });

  it('no em dashes', () => {
    for (const id of lineIds()) expect(JSON.stringify(data[id].text)).not.toMatch(/—/);
  });

  it('fills placeholders, keeps unknown ones visible, and splits around them', () => {
    expect(fill('Hi {name}, {x}', { name: 'Bo' })).toBe('Hi Bo, {x}');
    expect(line('onboarding.ready', { name: 'Blob' })).toBe(lines('onboarding.ready', { name: 'Blob' })[0]);
    expect(line('onboarding.ready', { name: 'Blob' })).toContain('Blob');
    expect(lines('onboarding.hello').length).toBe(4);
    const parts = lineParts('onboarding.done.lead', { workspace: 1, name: 2 });
    expect(parts.filter((p) => typeof p === 'number')).toEqual([1, 2]);
    expect(parts.filter((p) => typeof p === 'string').join('')).not.toContain('{');
  });

  it('the file is in its tidy shape (what dialogue:apply writes)', () => {
    expect(fs.readFileSync(LINES_FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(formatLines(data));
  });
});

describe('dialogue:apply', () => {
  const base = JSON.parse(JSON.stringify(data));

  it('merges changed lines and reports them', () => {
    const r = applyChanges(base, { 'empty.help': 'Nope, nothing. Try again?', 'onboarding.name': ['A name!', 'Roll it.'], 'about.quill': base['about.quill'].text });
    expect(r.errors).toEqual([]);
    expect(r.changed.map((c: { id: string }) => c.id)).toEqual(['empty.help', 'onboarding.name']);
    expect(r.lines['empty.help'].text).toBe('Nope, nothing. Try again?');
    expect(r.lines['empty.help'].where).toBe(base['empty.help'].where);
    expect(base['empty.help'].text).not.toBe('Nope, nothing. Try again?');
  });

  it('refuses lost, extra or misspelled placeholders, unknown ids and the wrong shape', () => {
    expect(applyChanges(base, { 'onboarding.ready': 'All ready. Have fun!' }).errors[0]).toMatch(/placeholders/);
    expect(applyChanges(base, { 'onboarding.ready': '{nme} is ready.' }).errors[0]).toMatch(/placeholders/);
    expect(applyChanges(base, { 'empty.help': 'Hi {name}' }).errors[0]).toMatch(/placeholders/);
    expect(applyChanges(base, { 'no.such.line': 'x' }).errors[0]).toMatch(/no such line/);
    expect(applyChanges(base, { 'onboarding.hello': 'one line' }).errors[0]).toMatch(/list/);
    expect(applyChanges(base, { 'empty.help': '  ' }).errors[0]).toMatch(/empty/);
    expect(applyChanges(base, { 'empty.help': { text: 'Object form works too.' } }).changed.length).toBe(1);
  });

  it('the command writes the file, and writes nothing when a placeholder is broken', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quill-lines-'));
    const file = path.join(dir, 'lines.json');
    fs.writeFileSync(file, formatLines(base));
    const good = path.join(dir, 'good.json');
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(good, JSON.stringify({ 'empty.recent': 'Empty! For now.' }));
    fs.writeFileSync(bad, JSON.stringify({ 'onboarding.ready': 'Ready!' }));
    const run = (f: string, ...more: string[]) => execFileSync(process.execPath, [path.join(root, 'scripts/dialogue/apply.mjs'), f, ...more], { env: { ...process.env, DIALOGUE_LINES: file, INIT_CWD: dir }, encoding: 'utf8' });
    expect(run(good, '--check')).toMatch(/would change/);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))['empty.recent'].text).toBe(base['empty.recent'].text);
    expect(run(good)).toMatch(/Updated 1 line/);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))['empty.recent'].text).toBe('Empty! For now.');
    const before = fs.readFileSync(file, 'utf8');
    expect(() => run(bad)).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
