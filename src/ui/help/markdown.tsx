// A small Markdown subset for help topics: # headings, paragraphs, - and 1. lists, ``` code blocks, | tables |,
// > notes, ---, **bold**, *italic*, `code`, and [links](help:topic-id#heading) or [links](https://...).
// Parsing is separate from rendering so it can be tested without a DOM.
import { Fragment, type ReactNode } from 'react';
import { platformKeysText } from '../keys';

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'bold'; children: Inline[] }
  | { t: 'italic'; children: Inline[] }
  | { t: 'code'; text: string }
  | { t: 'link'; href: string; children: Inline[] };

export type Block =
  | { t: 'heading'; level: number; text: string; slug: string }
  | { t: 'p'; children: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'code'; text: string }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'note'; children: Inline[] }
  | { t: 'hr' };

/** A heading's anchor: "Pick a colour!" -> "pick-a-colour". */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The text with the Markdown marks removed, for searching and snippets. */
export function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, ''))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\|?[\s:|-]+\|[\s:|-]*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', text: buf });
    buf = '';
  };
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      buf += s[i + 1];
      i += 2;
    } else if (c === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push({ t: 'code', text: s.slice(i + 1, end) });
        i = end + 1;
      } else buf += s[i++];
    } else if (c === '*' && s[i + 1] === '*') {
      const end = s.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'bold', children: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
      } else buf += s[i++];
    } else if (c === '*' || c === '_') {
      const end = s.indexOf(c, i + 1);
      // `_` inside a word (snake_case) isn't emphasis.
      const wordy = c === '_' && /\w/.test(s[i - 1] ?? '');
      if (end > i + 1 && !wordy && s[i + 1] !== ' ') {
        flush();
        out.push({ t: 'italic', children: parseInline(s.slice(i + 1, end)) });
        i = end + 1;
      } else buf += s[i++];
    } else if (c === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(s.slice(i));
      if (m) {
        flush();
        out.push({ t: 'link', href: m[2], children: parseInline(m[1]) });
        i += m[0].length;
      } else buf += s[i++];
    } else buf += s[i++];
  }
  flush();
  return out;
}

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      out.push({ t: 'code', text: body.join('\n') });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      out.push({ t: 'heading', level: h[1].length, text: h[2].trim(), slug: slug(h[2]) });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (line.startsWith('|') && /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] ?? '')) {
      const head = cells(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]).map(parseInline));
      out.push({ t: 'table', head, rows });
      continue;
    }
    if (line.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push({ t: 'note', children: parseInline(body.join(' ')) });
      continue;
    }
    const ul = /^\s*[-*]\s+/;
    const ol = /^\s*\d+\.\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: Inline[][] = [];
      while (i < lines.length && re.test(lines[i])) {
        let text = lines[i++].replace(re, '');
        // A wrapped line belongs to the item above it.
        while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !ul.test(lines[i]) && !ol.test(lines[i])) text += ' ' + lines[i++].trim();
        items.push(parseInline(text));
      }
      out.push({ t: ordered ? 'ol' : 'ul', items });
      continue;
    }
    // A paragraph runs until a blank line or the start of another block.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\|)/.test(lines[i])) para.push(lines[i++].trim());
    if (!para.length) para.push(lines[i++].trim());
    out.push({ t: 'p', children: parseInline(para.join(' ')) });
  }
  return out;
}

/** `help:topic#anchor` -> where it goes. Anything else is an outside link. */
export function parseHelpLink(href: string): { topic: string; anchor?: string } | null {
  if (!href.startsWith('help:')) return null;
  const [topic, anchor] = href.slice(5).split('#');
  return { topic, anchor: anchor || undefined };
}

function renderInline(list: Inline[], onHelp: (topic: string, anchor?: string) => void): ReactNode {
  return list.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.text}</Fragment>;
      case 'bold':
        return <strong key={i}>{renderInline(n.children, onHelp)}</strong>;
      case 'italic':
        return <em key={i}>{renderInline(n.children, onHelp)}</em>;
      case 'code':
        return <code key={i}>{n.text}</code>;
      case 'link': {
        const h = parseHelpLink(n.href);
        if (h)
          return (
            <a
              key={i}
              href={`#${h.topic}`}
              className="ui-md-link"
              onClick={(e) => {
                e.preventDefault();
                onHelp(h.topic, h.anchor);
              }}
            >
              {renderInline(n.children, onHelp)}
            </a>
          );
        return (
          <a key={i} href={n.href} target="_blank" rel="noreferrer noopener" className="ui-md-link">
            {renderInline(n.children, onHelp)}
          </a>
        );
      }
    }
  });
}

export function Markdown({ text, onHelp }: { text: string; onHelp: (topic: string, anchor?: string) => void }) {
  // Shortcuts read the Mac way on a Mac. Headings stay as written, so links to them keep working.
  const blocks = parseBlocks(text.split('\n').map((l) => (l.startsWith('#') ? l : platformKeysText(l))).join('\n'));
  return (
    <div className="ui-md">
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'heading': {
            // The topic's own title is the h2 above this, so body headings start at h3 (# and ## both), with no gaps.
            const Tag = (`h${Math.min(6, Math.max(3, b.level + 1))}`) as 'h3';
            return (
              <Tag key={i} id={`md-${b.slug}`}>
                {b.text}
              </Tag>
            );
          }
          case 'p':
            return <p key={i}>{renderInline(b.children, onHelp)}</p>;
          case 'ul':
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, onHelp)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, onHelp)}</li>
                ))}
              </ol>
            );
          case 'code':
            return (
              <pre key={i}>
                <code>{b.text}</code>
              </pre>
            );
          case 'note':
            return (
              <aside key={i} className="ui-md-note">
                {renderInline(b.children, onHelp)}
              </aside>
            );
          case 'hr':
            return <hr key={i} />;
          case 'table':
            return (
              <div key={i} className="ui-md-table">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j}>{renderInline(c, onHelp)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k}>{renderInline(c, onHelp)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
