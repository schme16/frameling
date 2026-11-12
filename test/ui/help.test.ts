// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HelpTopic } from '../../src/core/registry';
import { Markdown, parseBlocks, parseHelpLink, parseInline, plain, slug } from '../../src/ui/help/markdown';
import { searchHelp, sections } from '../../src/ui/help/search';
import { allHelp, helpBody, loadHelpBodies } from '../../src/core/registry';
// The shell's topics link out to every area (the overview does), so load them all.
import '../../src/renderer/features';

const topic = (id: string, title: string, body: string, extra: Partial<HelpTopic> = {}): HelpTopic => ({ id, title, summary: `About ${title}`, body, section: 'Basics', ...extra });

describe('markdown parsing', () => {
  it('reads inline marks', () => {
    expect(parseInline('a **bold** and *soft* and `code`')).toEqual([
      { t: 'text', text: 'a ' },
      { t: 'bold', children: [{ t: 'text', text: 'bold' }] },
      { t: 'text', text: ' and ' },
      { t: 'italic', children: [{ t: 'text', text: 'soft' }] },
      { t: 'text', text: ' and ' },
      { t: 'code', text: 'code' },
    ]);
  });
  it('reads help and outside links', () => {
    const [l] = parseInline('[Undo](help:undo#redo)');
    expect(l).toMatchObject({ t: 'link', href: 'help:undo#redo' });
    expect(parseHelpLink('help:undo#redo')).toEqual({ topic: 'undo', anchor: 'redo' });
    expect(parseHelpLink('help:undo')).toEqual({ topic: 'undo', anchor: undefined });
    expect(parseHelpLink('https://example.com')).toBeNull();
  });
  it('leaves snake_case and lone stars alone', () => {
    expect(parseInline('a snake_case_name and 2 * 3')).toEqual([{ t: 'text', text: 'a snake_case_name and 2 * 3' }]);
  });
  it('reads blocks', () => {
    const b = parseBlocks('# Title\n\nSome text\nover two lines.\n\n- one\n- two\n\n1. first\n2. second\n\n```\ncode\n```\n\n> a note\n\n---');
    expect(b.map((x) => x.t)).toEqual(['heading', 'p', 'ul', 'ol', 'code', 'note', 'hr']);
    expect(b[1]).toMatchObject({ t: 'p' });
    expect((b[2] as { items: unknown[] }).items).toHaveLength(2);
    expect(b[4]).toEqual({ t: 'code', text: 'code' });
  });
  it('reads tables', () => {
    const [t] = parseBlocks('| Key | Does |\n| --- | --- |\n| B | Brush |\n| E | Eraser |');
    expect(t.t).toBe('table');
    expect((t as { rows: unknown[] }).rows).toHaveLength(2);
  });
  it('makes slugs and plain text', () => {
    expect(slug('Pick a colour!')).toBe('pick-a-colour');
    expect(plain('## Hi\n\nSee [this](help:x) **now**.\n\n- a\n- b')).toBe('Hi See this now. a b');
  });
});

describe('markdown rendering', () => {
  it('renders the pieces as html', () => {
    const html = renderToStaticMarkup(Markdown({ text: '# Big\n\nHello **you** [more](help:x)\n\n- a\n\n| A | B |\n| - | - |\n| 1 | 2 |', onHelp: () => {} }));
    expect(html).toContain('<h3 id="md-big">Big</h3>');
    expect(html).toContain('<strong>you</strong>');
    expect(html).toContain('<ul><li>a</li></ul>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('class="ui-md-link"');
  });
  it('never turns text into html', () => {
    const html = renderToStaticMarkup(Markdown({ text: '<script>alert(1)</script>', onHelp: () => {} }));
    expect(html).not.toContain('<script>');
  });
});

describe('help search', () => {
  const topics = [
    topic('onion', 'Onion skin', 'See faint copies of nearby frames.\n\n## Colours\n\nBefore frames are rose, after frames are mint.', { keywords: ['ghost'] }),
    topic('export', 'Exporting', 'Share your animation as a GIF or a video.'),
    topic('layers', 'Layers', 'Layers stack like sheets of paper. Onion skin shows on each.'),
  ];
  it('finds by title, keyword and body', () => {
    expect(searchHelp('onion', 10, topics)[0].topic.id).toBe('onion');
    expect(searchHelp('ghost', 10, topics)[0].topic.id).toBe('onion');
    expect(searchHelp('gif', 10, topics)[0].topic.id).toBe('export');
  });
  it('finds a heading inside a topic and points at it', () => {
    const hit = searchHelp('mint', 10, topics)[0];
    expect(hit.topic.id).toBe('onion');
    expect(hit.anchor).toBe('colours');
  });
  it('ranks a title above a passing mention', () => {
    const ids = searchHelp('onion', 10, topics).map((h) => h.topic.id);
    expect(ids.indexOf('onion')).toBeLessThan(ids.indexOf('layers'));
  });
  it('needs all words, and forgives typos', () => {
    expect(searchHelp('onion banana', 10, topics)).toEqual([]);
    expect(searchHelp('exportng', 10, topics)[0].topic.id).toBe('export');
    expect(searchHelp('', 10, topics)).toEqual([]);
  });
  it('groups the contents by section in a sensible order', () => {
    const s = sections([topic('a', 'A', '', { section: 'Zebra' }), topic('b', 'B', '', { section: 'Getting started' }), topic('c', 'C', '', { section: 'Basics' })]);
    expect(s.map((x) => x.name)).toEqual(['Getting started', 'Basics', 'Zebra']);
  });
});

describe('the shell own help', () => {
  it('writes a topic for each feature, and every link inside points somewhere', async () => {
    await loadHelpBodies();
    const ids = new Set(allHelp().map((x) => x.id));
    for (const id of ['welcome', 'new-document', 'using-help', 'command-palette', 'keyboard-shortcuts', 'preferences', 'look-and-feel', 'workspaces', 'panels', 'tool-strip', 'menus', 'status-bar', 'document-name', 'messages', 'quests']) expect(ids.has(id), id).toBe(true);
    for (const t of allHelp()) for (const m of helpBody(t).matchAll(/\]\(help:([\w-]+)/g)) expect(ids.has(m[1]), `${t.id} links to ${m[1]}`).toBe(true);
  });
});
