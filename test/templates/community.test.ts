import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { saveFile, loadFile } from '../../src/io/file';
import { cleanMeta, cleanTags, guessKind, packTemplate, readTemplate, TEMPLATE_ENTRY } from '../../src/templates/community';
import { findTemplate } from '../../src/templates';
import { memoryLibrary, setLibraryForTests } from '../../src/platform/library';
import { importUserTemplate, listUserTemplates, removeUserTemplate, saveUserTemplate, templateSources, userTemplateBytes } from '../../src/templates/user';

const ball = () => findTemplate('bouncing-ball')!.make();
const hero = () => findTemplate('hero-sprites')!.make();
const meta = { name: 'Ball', blurb: 'A ball. Try it: squash it.', kind: 'vector' as const, tags: ['loop'], author: 'Me', licence: 'CC-BY-4.0' };

describe('template files', () => {
  it('are ordinary .frameling files with a template.json beside the drawing', () => {
    const bytes = packTemplate(ball(), meta);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['manifest.json', 'doc.json', TEMPLATE_ENTRY]));
    expect(JSON.parse(strFromU8(files[TEMPLATE_ENTRY]))).toEqual(meta);
    // Any Frameling opens it as a drawing.
    expect(loadFile(bytes).doc.name).toBe(ball().name);
    const t = readTemplate(bytes);
    expect(t.described).toBe(true);
    expect(t.meta).toEqual(meta);
  });

  it('keep pixel drawings exactly', () => {
    const doc = hero();
    const t = readTemplate(packTemplate(doc, { ...meta, kind: 'pixel' }));
    const id = Object.keys(doc.drawings).find((k) => doc.drawings[k].kind === 'pixel')!;
    expect((t.doc.drawings[id] as { pixels: Uint8ClampedArray }).pixels).toEqual((doc.drawings[id] as { pixels: Uint8ClampedArray }).pixels);
  });

  it('describe a plain drawing from the drawing itself', () => {
    const t = readTemplate(saveFile(hero()));
    expect(t.described).toBe(false);
    expect(t.meta).toMatchObject({ name: hero().name, kind: 'pixel', tags: [], blurb: '' });
  });

  it('tidy what people type', () => {
    expect(cleanTags(' Walk, walk ,CYCLE,,a,b,c,d,e,f,g')).toEqual(['walk', 'cycle', 'a', 'b', 'c', 'd', 'e', 'f']);
    expect(cleanMeta({ name: '', kind: 'nope', tags: 'x', author: 5 }, ball())).toMatchObject({ name: ball().name, kind: 'vector', tags: ['x'], author: '' });
    expect(guessKind(hero())).toBe('pixel');
    expect(guessKind(ball())).toBe('vector');
  });
});

describe('your templates', () => {
  beforeEach(() => setLibraryForTests(memoryLibrary));
  afterEach(async () => {
    for (const e of await memoryLibrary.list('templates')) await memoryLibrary.remove('templates', e.id);
    setLibraryForTests(null);
  });

  it('save, list, make fresh copies, and remove', async () => {
    const id = await saveUserTemplate(ball(), meta);
    expect(id).toBe('user:ball');
    expect(await saveUserTemplate(ball(), meta)).toBe('user:ball-2');
    const list = await listUserTemplates();
    expect(list.map((t) => t.name)).toEqual(['Ball', 'Ball']);
    const a = list[0].make();
    const b = list[0].make();
    expect(a.id).not.toBe(b.id);
    expect(a.layers.length).toBe(ball().layers.length);
    await removeUserTemplate('user:ball');
    expect((await listUserTemplates()).length).toBe(1);
    await expect(removeUserTemplate('bouncing-ball')).rejects.toThrow(/comes with Frameling/);
  });

  it('import shared files and plain drawings, which get a description', async () => {
    const shared = await importUserTemplate(packTemplate(ball(), meta), 'whatever.frameling');
    expect(shared.name).toBe('Ball');
    const plain = await importUserTemplate(saveFile(hero()), 'My hero.frameling');
    expect(plain.name).toBe('My hero');
    const stored = await userTemplateBytes(plain.id);
    expect(readTemplate(stored!).described).toBe(true);
    await expect(importUserTemplate(new Uint8Array([1, 2]))).rejects.toThrow(/Frameling file/);
  });

  it('is one source among others, so a gallery can join later', () => {
    expect(templateSources().map((s) => s.id)).toContain('yours');
  });
});
