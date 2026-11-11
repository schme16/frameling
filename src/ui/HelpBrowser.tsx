// The help reader, used both in the Help panel (compact) and the big help window.
import { line } from './mascot/lines';
import { useEffect, useMemo, useRef, useState } from 'react';
import { allHelp, getHelp } from '../core/registry';
import { Icon } from './icons';
import { QuillEmpty } from './mascot';
import { Markdown } from './help/markdown';
import { HelpMedia } from './help/media';
import { searchHelp, sections } from './help/search';
import { closeHelp, overlays, openHelp } from './overlays';
import { Modal } from './Modal';

interface Nav {
  topic: string | null;
  anchor?: string;
}

export function HelpBrowser({ compact = false, initial, onExpand }: { compact?: boolean; initial?: { topic?: string; anchor?: string; query?: string }; onExpand?: (topic: string | null) => void }) {
  const [nav, setNav] = useState<Nav>({ topic: initial?.topic && getHelp(initial.topic) ? initial.topic : null, anchor: initial?.anchor });
  const [history, setHistory] = useState<Nav[]>([]);
  const [query, setQuery] = useState(initial?.query ?? '');
  const article = useRef<HTMLDivElement>(null);
  const topics = allHelp();
  const hits = useMemo(() => (query.trim() ? searchHelp(query, 14) : []), [query]);
  const groups = useMemo(() => sections(topics), [topics.length]);
  const topic = nav.topic ? getHelp(nav.topic) : undefined;

  const go = (id: string, anchor?: string) => {
    if (!getHelp(id)) return;
    setHistory((h) => (nav.topic ? [...h, nav] : h).slice(-30));
    setNav({ topic: id, anchor });
    setQuery('');
  };
  const back = () => {
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setNav(prev ?? { topic: null });
  };

  useEffect(() => {
    const el = article.current;
    if (!el) return;
    if (nav.anchor) el.querySelector(`#md-${CSS.escape(nav.anchor)}`)?.scrollIntoView({ block: 'start' });
    else el.scrollTop = 0;
  }, [nav]);

  const search = (
    <div className="ui-help-search">
      <Icon name="search" size={15} />
      <input type="search" aria-label="Search help" placeholder="Search help" value={query} onChange={(e) => setQuery(e.target.value)} data-autofocus={!compact || undefined} />
    </div>
  );

  const contents = (
    <nav className="ui-help-contents" aria-label="Help contents">
      {groups.map((g) => (
        <section key={g.name}>
          <h3>{g.name}</h3>
          <ul>
            {g.topics.map((t) => (
              <li key={t.id}>
                <button type="button" className={`ui-help-link${nav.topic === t.id ? ' is-chosen' : ''}`} aria-current={nav.topic === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );

  const results = (
    <div className="ui-help-results" role="list" aria-label="Search results">
      {hits.map((h, i) => (
        <button key={`${h.topic.id}-${h.anchor ?? ''}-${i}`} type="button" role="listitem" className="ui-help-hit" onClick={() => go(h.topic.id, h.anchor)}>
          <strong>
            {h.topic.title}
            {h.heading ? ` > ${h.heading}` : ''}
          </strong>
          <span>{h.snippet}</span>
        </button>
      ))}
      {!hits.length && (
        <QuillEmpty anim={[{ anim: 'think', hold: 2400 }, { anim: 'idle' }]} className="ui-help-empty">
          {line('empty.help')}
        </QuillEmpty>
      )}
    </div>
  );

  const body = topic ? (
    <article className="ui-help-article" ref={article}>
      <div className="ui-help-crumbs">
        <button type="button" className="ui-btn ui-btn-quiet" onClick={back}>
          <Icon name="chevron-left" size={14} />
          {history.length ? 'Back' : 'Contents'}
        </button>
        <span>{topic.section}</span>
      </div>
      <h2>{topic.title}</h2>
      <p className="ui-help-summary">{topic.summary}</p>
      {topic.media && <HelpMedia key={topic.id} media={topic.media} title={topic.title} />}
      <Markdown text={topic.body} onHelp={go} />
    </article>
  ) : null;

  if (compact)
    return (
      <div className="ui-help ui-help-compact">
        <div className="ui-help-top">
          {search}
          {onExpand && (
            <button type="button" className="ui-icon-btn" aria-label="Open help in a bigger window" data-tip="Open in a bigger window" onClick={() => onExpand(nav.topic)}>
              <Icon name="workspace" size={16} />
            </button>
          )}
        </div>
        <div className="ui-help-scroll">{query.trim() ? results : (body ?? contents)}</div>
      </div>
    );

  return (
    <div className="ui-help ui-help-large">
      <aside className="ui-help-side">
        {search}
        <div className="ui-help-scroll">{contents}</div>
      </aside>
      <div className="ui-help-main">
        {query.trim() ? (
          <div className="ui-help-scroll">{results}</div>
        ) : (
          (body ?? (
            <div className="ui-help-home">
              <Icon name="book" size={28} />
              <h2>How can we help?</h2>
              <p>Pick something from the list, or search. Pressing F1 over any button comes straight here.</p>
              <div className="ui-help-quick">
                {['welcome', 'command-palette', 'keyboard-shortcuts', 'workspaces'].filter((id) => getHelp(id)).map((id) => (
                  <button key={id} type="button" className="ui-card" onClick={() => go(id)}>
                    <strong>{getHelp(id)!.title}</strong>
                    <span>{getHelp(id)!.summary}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function HelpPanel() {
  return <HelpBrowser compact onExpand={(t) => openHelp(t ?? undefined)} />;
}

export function HelpWindow() {
  const h = overlays.use((o) => o.help);
  if (!h) return null;
  return (
    <Modal title="Help" size="lg" className="ui-help-modal" onClose={closeHelp} initialFocus=".ui-help-search input">
      <HelpBrowser key={`${h.topic ?? ''}#${h.anchor ?? ''}?${h.query ?? ''}`} initial={h} />
    </Modal>
  );
}
