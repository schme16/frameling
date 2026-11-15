// Exports never carry the undo history. The history reaches a file only when a save asks for it, and only the
// Save and Save as commands in src/io/document.ts do. Every exporter, and every other place that writes a drawing
// out (the Interactives package, community templates, the round trip), gets a document, which never holds history.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer } from '../../src/core/doc';
import { resetStore } from '../../src/core/store';
import { loadFile, saveFile } from '../../src/io/file';

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('exports and history', () => {
  it('only Save and Save as reach for the history to write', () => {
    const allowed = new Set(['src/io/document.ts', 'src/io/file.ts', 'src/core/historyFile.ts', 'src/core/store.ts']);
    const users = sources('src')
      .filter((f) => /\b(historyForSave|encodeHistory|onHistory)\b/.test(readFileSync(f, 'utf8')))
      .filter((f) => !allowed.has(f.replace(/\\/g, '/')));
    expect(users).toEqual([]);
  });

  it('versions, which are copies of the drawing alone, do not pass it; autosave does, through autosaveBytes', () => {
    for (const f of ['src/io/versions.ts', 'src/io/recovery.ts']) expect(readFileSync(f, 'utf8')).not.toMatch(/saveFileAsync\([^)]*\bhistory\b/);
    expect(readFileSync('src/io/autosave.ts', 'utf8')).not.toMatch(/\b(historyForSave|encodeHistory)\b/);
    const doc = readFileSync('src/io/document.ts', 'utf8');
    const from = doc.indexOf('export async function autosaveBytes');
    expect(doc.slice(from, doc.indexOf('\n}\n', from))).toContain('historyForSave');
  });

  it('a drawing taken out of a store with history, as every exporter takes it, holds none', () => {
    const doc = newDoc({ width: 16, height: 16, length: 2 });
    const layer = newPixelLayer('Pixels', 1);
    const d = newPixelDrawing(16, 16);
    doc.drawings[d.id] = d;
    layer.cels.push({ id: 'c', start: 0, length: 2, drawingId: d.id });
    doc.layers.push(layer);
    const s = resetStore(doc);
    s.update('Rename', (x) => void (x.name = 'Changed'));
    expect(s.historyForSave()).not.toBeNull();
    // What an exporter is handed, and what the Interactives package embeds as its source.
    for (const handed of [s.get().doc, s.rootDoc(), loadFile(saveFile(s.get().doc)).doc]) {
      expect('history' in handed).toBe(false);
      const files = unzipSync(saveFile(handed));
      expect(Object.keys(files).filter((k) => k.startsWith('history/'))).toEqual([]);
      expect(strFromU8(files['doc.json'])).not.toContain('"history"');
    }
  });
});
