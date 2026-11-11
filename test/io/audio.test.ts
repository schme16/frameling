import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { AudioClip, Doc } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { audioExt } from '../../src/io/audio-file';

function clip(id: string, bytes: number[], extra: Partial<AudioClip> = {}): AudioClip {
  return { id, name: `Sound ${id}`, start: 3, data: new Uint8Array(bytes), mime: 'audio/wav', duration: 1.5, ...extra };
}

function docWithSound(): Doc {
  const doc = newDoc({ name: 'Talky', length: 12 });
  doc.audio = [clip('a1', [82, 73, 70, 70, 1, 2, 3]), clip('a/2', [9, 8, 7], { mime: 'audio/mpeg', volume: 0.4, muted: true, start: -4 })];
  return doc;
}

describe('sound in the file', () => {
  it('keeps the bytes in audio/ entries and names them in doc.json', () => {
    const zip = unzipSync(saveFile(docWithSound()));
    expect(Object.keys(zip).filter((n) => n.startsWith('audio/')).sort()).toEqual(['audio/a1.wav', 'audio/a_2.mp3']);
    expect([...zip['audio/a1.wav']]).toEqual([82, 73, 70, 70, 1, 2, 3]);
    const raw = JSON.parse(new TextDecoder().decode(zip['doc.json']));
    expect(raw.audio[0].data).toBe('audio/a1.wav');
    expect(JSON.stringify(raw)).not.toContain('"0":82');
  });

  it('round trips every field', () => {
    const { doc, warnings } = loadFile(saveFile(docWithSound()));
    expect(warnings).toEqual([]);
    expect(doc.audio).toHaveLength(2);
    expect(doc.audio![0]).toMatchObject({ id: 'a1', name: 'Sound a1', start: 3, mime: 'audio/wav', duration: 1.5 });
    expect([...doc.audio![0].data]).toEqual([82, 73, 70, 70, 1, 2, 3]);
    expect(doc.audio![1]).toMatchObject({ id: 'a/2', start: -4, mime: 'audio/mpeg', volume: 0.4, muted: true });
    expect(doc.audio![1].data).toBeInstanceOf(Uint8Array);
  });

  it('leaves audio out entirely when there is none, and old files open as before', () => {
    const doc = newDoc({ name: 'Quiet' });
    const zip = unzipSync(saveFile(doc));
    expect(Object.keys(zip).some((n) => n.startsWith('audio/'))).toBe(false);
    expect('audio' in JSON.parse(new TextDecoder().decode(zip['doc.json']))).toBe(false);
    expect(loadFile(saveFile(doc)).doc.audio).toBeUndefined();
  });

  it('warns about a missing sound instead of failing, and keeps the others', () => {
    const zip = unzipSync(saveFile(docWithSound()));
    delete zip['audio/a1.wav'];
    const { doc, warnings } = loadFile(zipSync(zip));
    expect(doc.audio?.map((c) => c.id)).toEqual(['a/2']);
    expect(warnings.join(' ')).toMatch(/Sound a1.*missing/);
  });

  it('ignores damaged entries and bad values', () => {
    const zip = unzipSync(saveFile(docWithSound()));
    const raw = JSON.parse(new TextDecoder().decode(zip['doc.json']));
    raw.audio.push(null, { id: 'bad', name: 'x', data: '../../etc/passwd' }, { id: 'a1', name: 'dupe', data: 'audio/a1.wav' });
    raw.audio[0].volume = 7;
    raw.audio[0].start = 'soon';
    zip['doc.json'] = strToU8(JSON.stringify(raw));
    const { doc, warnings } = loadFile(zipSync(zip));
    expect(doc.audio!.map((c) => c.id)).toEqual(['a1', 'a/2']);
    expect(doc.audio![0].volume).toBe(1);
    expect(doc.audio![0].start).toBe(0);
    expect(warnings.length).toBe(3);
  });

  it('picks file endings from the media type', () => {
    expect(audioExt('audio/mpeg')).toBe('mp3');
    expect(audioExt('audio/x-wav')).toBe('wav');
    expect(audioExt('audio/weird')).toBe('bin');
  });
});
