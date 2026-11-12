// The help reader, used both in the Help panel (compact) and the big help window.
import { line } from './mascot/lines';
import { useEffect, useMemo, useRef, useState } from 'react';
import { allHelp, getHelp, helpBody } from '../core/registry';
import { Icon } from './icons';
import { QuillEmpty } from './mascot';
import { Markdown } from './help/markdown';
import { HelpMedia } from './help/media';
import { searchHelp, sections } from './help/search';
import { useHelpBodies } from './help/useBodies';
import { closeHelp, overlays, openHelp } from './overlays';
import { Modal } from './Modal';
import { hiddenHelp, setFeatureOn } from '../features/host';
import { useFeaturesVersion } from '../features/use';
import { toast } from './toast';

interface Nav {
  topic: string | null;
  anchor?: string;
}

/** Stands in for the words while their chunk loads. Blank at first, so a quick load doesn't flash. */
function Loading({ slow }: { slow: boolean }) {
  return (
    <p className="ui-help-loading" role="status" aria-live="polite" data-slow={slow || undefined}>
      {slow ? 'Loading help…' : ''}
    </p>
  );
}

export function HelpBrowser({ compact = false, initial, onExpand }: { compact?: boolean; initial?: { topic?: string; anchor?: string; query?: string }; onExpand?: (topic: string | null) => void }) {
  const [nav, setNav] = useState<Nav>({ topic: initial?.topic && getHelp(initial.topic) ? initial.topic : null, anchor: initial?.anchor });
  const [history, setHistory] = useState<Nav[]>([]);
  const [query, setQuery] = useState(initial?.query ?? '');
  const article = useRef<HTMLDivElement>(null);
  const featuresVersion = useFeaturesVersion();
  // Titles and the contents are known at once; the words (for reading and for search) arrive as a chunk of their own.
  const words = useHelpBodies();
  const topics = allHelp();
  const hits = useMemo(() => (query.trim() && words.ready ? searchHelp(query, 14) : []), [query, featuresVersion, words.ready]);
  // Topics of features that are turned off are hidden; a search that would have found one offers to turn its feature on.
  const [asked, setAsked] = useState<string | null>(null);
  const offers = useMemo(() => {
    if (!query.trim() || !words.ready) return [];
    const hidden = hiddenHelp();
    if (!hidden.length) return [];
    const found = searchHelp(query, 6, hidden.map((h) => h.topic));
    const features = new Map<string, string>();
    for (const f of found) {
      const h = hidden.find((x) => x.topic.id === f.topic.id);
      if (h) features.set(h.feature.id, h.feature.name);
    }
    return [...features].slice(0, 3).map(([id, name]) => ({ id, name }));
  }, [query, featuresVersion, words.ready]);
  const turnOn = (id: string) => {
    const r = setFeatureOn(id, true);
    if (!r.ok) toast(r.reason, { kind: 'warn' });
    setAsked(null);
  };
  const groups = useMemo(() => sections(topics), [topics.length, featuresVersion]);
  const topic = nav.topic ? getHelp(nav.topic) : undefined;

  const go = (id: string, anchor?: string) => {
    if (!getHelp(id)) {
      // A link into a feature that is turned off: say so, and offer it back.
      const h = hiddenHelp().find((x) => x.topic.id === id);
      if (h) setAsked(h.feature.id);
      return;
    }
    setAsked(null);
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
  }, [nav, words.ready]);

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
      {offers.map((o) => (
        <div key={o.id} className="ui-help-off">
          <span>{o.name} is turned off, so its help is hidden.</span>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => turnOn(o.id)}>
            Turn on {o.name}
          </button>
        </div>
      ))}
      {!words.ready && <Loading slow={words.slow} />}
      {words.ready && !hits.length && !offers.length && (
        <QuillEmpty anim={[{ anim: 'think', hold: 2400 }, { anim: 'idle' }]} className="ui-help-empty">
          {line('empty.help')}
        </QuillEmpty>
      )}
    </div>
  );

  const askedFeature = asked ? hiddenHelp().find((h) => h.feature.id === asked)?.feature : undefined;
  const banner = askedFeature ? (
    <div className="ui-help-off" role="status">
      <span>{askedFeature.name} is turned off, so that help is hidden.</span>
      <button type="button" className="ui-btn ui-btn-primary" onClick={() => turnOn(askedFeature.id)}>
        Turn on {askedFeature.name}
      </button>
    </div>
  ) : null;

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
      {words.ready ? <Markdown text={helpBody(topic)} onHelp={go} /> : <Loading slow={words.slow} />}
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
        <div className="ui-help-scroll">
          {banner}
          {query.trim() ? results : (body ?? contents)}
        </div>
      </div>
    );

  return (
    <div className="ui-help ui-help-large">
      <aside className="ui-help-side">
        {search}
        <div className="ui-help-scroll">{contents}</div>
      </aside>
      <div className="ui-help-main">
        {banner}
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
