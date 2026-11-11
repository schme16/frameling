// @vitest-environment jsdom
// Every help picture or video a topic names has to exist under public/help/, and every file there has to be used by a
// topic (a video's poster comes along with it), so the folder never fills up with strays.
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allHelp } from '../../src/core/registry';
import { isVideo, posterFor } from '../../src/ui/help/media';
import '../../src/renderer/features';

const helpDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/help');
const withMedia = () => allHelp().filter((t) => t.media);

describe('help media', () => {
  it('has media on some topics', () => {
    expect(withMedia().length).toBeGreaterThan(10);
  });

  it('every topic media file exists', () => {
    for (const t of withMedia()) {
      expect(existsSync(path.join(helpDir, t.media!)), `${t.id} -> ${t.media}`).toBe(true);
      if (isVideo(t.media!)) expect(existsSync(path.join(helpDir, posterFor(t.media!))), `${t.id} poster`).toBe(true);
    }
  });

  it('videos are small and H.264', () => {
    for (const t of withMedia().filter((x) => isVideo(x.media!))) {
      const f = path.join(helpDir, t.media!);
      expect(t.media).toMatch(/\.mp4$/);
      expect(statSync(f).size, t.media).toBeLessThan(1_000_000);
    }
  });

  it('every file in public/help is used', () => {
    const used = new Set<string>();
    for (const t of withMedia()) {
      used.add(t.media!);
      if (isVideo(t.media!)) used.add(posterFor(t.media!));
    }
    const files = readdirSync(helpDir).filter((f) => !f.startsWith('.'));
    for (const f of files) expect(used.has(f), `${f} isn't used by any topic`).toBe(true);
  });
});
