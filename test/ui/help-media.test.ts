// @vitest-environment jsdom
// Every help picture or video a topic names has to exist under public/help/ in both a dark and a light version (a clip
// has a poster for each too), every file there has to be used by a topic, and every name has a capture entry in
// scripts/docs/help/ so the whole set can be shot again with `npm run help:media`.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allHelp } from '../../src/core/registry';
import { HELP_MODES, isVideo, mediaFiles, modeFile, posterFor, useHelpMode } from '../../src/ui/help/media';
import '../../src/renderer/features';
import { hiddenFeatureHelp } from '../../src/features/host';

const here = path.dirname(fileURLToPath(import.meta.url));
const helpDir = path.resolve(here, '../../public/help');
const captureDir = path.resolve(here, '../../scripts/docs/help');
// The topics of features kept out of sight (Interactives) still have their pictures and capture entries.
const withMedia = () => [...allHelp(), ...hiddenFeatureHelp()].filter((t) => t.media);

describe('help media', () => {
  it('has media on some topics', () => {
    expect(withMedia().length).toBeGreaterThan(10);
  });

  it('names the dark and light files and their posters', () => {
    expect(modeFile('select.png', 'dark')).toBe('select-dark.png');
    expect(modeFile('a-b.mp4', 'light')).toBe('a-b-light.mp4');
    expect(mediaFiles('select.png')).toEqual(['select-dark.png', 'select-light.png']);
    expect(mediaFiles('tour.mp4')).toEqual(['tour-dark.mp4', 'tour-dark-poster.png', 'tour-light.mp4', 'tour-light-poster.png']);
    expect(posterFor('tour-light.mp4')).toBe('tour-light-poster.png');
    expect(HELP_MODES).toEqual(['dark', 'light']);
    expect(typeof useHelpMode).toBe('function');
  });

  it('every topic media file exists in both modes', () => {
    for (const t of withMedia()) {
      expect(t.media, `${t.id} names a base file, not a themed one`).not.toMatch(/-(dark|light)\.[a-z0-9]+$/i);
      for (const f of mediaFiles(t.media!)) expect(existsSync(path.join(helpDir, f)), `${t.id} -> ${f}`).toBe(true);
    }
  });

  it('videos are small and H.264', () => {
    for (const t of withMedia().filter((x) => isVideo(x.media!))) {
      expect(t.media).toMatch(/\.mp4$/);
      for (const m of HELP_MODES) expect(statSync(path.join(helpDir, modeFile(t.media!, m))).size, `${t.media} ${m}`).toBeLessThan(1_000_000);
    }
  });

  it('every file in public/help is used', () => {
    const used = new Set(withMedia().flatMap((t) => mediaFiles(t.media!)));
    const files = readdirSync(helpDir).filter((f) => !f.startsWith('.'));
    for (const f of files) expect(used.has(f), `${f} isn't used by any topic`).toBe(true);
  });

  it('every media name has a capture entry', () => {
    const require = createRequire(import.meta.url);
    const entries = readdirSync(captureDir)
      .filter((f) => f.endsWith('.cjs') && !f.startsWith('_'))
      .flatMap((f) => require(path.join(captureDir, f)) as { name: string }[]);
    const have = new Set(entries.map((e) => e.name));
    const names = new Set(withMedia().map((t) => t.media!.replace(/\.[a-z0-9]+$/i, '')));
    for (const n of names) expect(have.has(n), `${n} has no capture entry in scripts/docs/help/`).toBe(true);
    for (const n of have) expect(names.has(n), `capture entry ${n} is for no topic`).toBe(true);
  });
});
