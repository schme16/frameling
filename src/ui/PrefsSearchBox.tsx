// The search box at the top of Preferences and the list it fills. It feels like the command palette: type, the
// matches fall into place under their page, up and down move, Enter goes there. What matches is in prefsSearch.ts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { syncDynamicCommands } from './dynamic';
import { Icon } from './icons';
import { effectiveKeys } from './keys';
import { allCommands } from '../core/registry';
import { Keys } from './ShortcutChip';
import { openHelp } from './overlays';
import { allPrefRows } from './prefsIndex';
import { foundSaid, PAGE_NAMES, searchPrefs, type PrefHit, type PrefRow } from './prefsSearch';
import './prefsSearchBox.css';

/** The icon each page has on its tab. */
export type PageIcons = Record<string, string>;

export function PrefsSearch({ query, onQuery, onGo, pageIcons }: { query: string; onQuery: (q: string) => void; onGo: (row: PrefRow) => void; pageIcons: PageIcons }) {
  const rows = useMemo(() => {
    syncDynamicCommands();
    return allPrefRows();
  }, []);
  const hits = useMemo(() => searchPrefs(query, rows), [query, rows]);
  const [at, setAt] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const searching = query.trim().length > 0;
  useEffect(() => setAt(0), [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [at, hits]);

  const keyOf = (r: PrefRow): string => {
    if (r.kind !== 'command') return '';
    const c = allCommands().find((x) => x.id === r.commandId);
    return c ? effectiveKeys(c)[0] ?? '' : '';
  };
  const helpInstead = () => openHelp(undefined, undefined, query.trim());

  let lastPage = '';
  return (
    <>
      <div className="ui-prefs-search">
        <div className="ui-help-search">
          <Icon name="search" size={15} />
          <input
            type="text"
            role="combobox"
            aria-expanded={searching}
            aria-controls="ui-prefsearch-list"
            aria-activedescendant={searching && hits[at] ? `ui-prefsearch-${at}` : undefined}
            aria-label="Search settings"
            placeholder="Search settings: dark mode, smoothing, hotkeys..."
            value={query}
            autoComplete="off"
            spellCheck={false}
            data-autofocus
            data-testid="prefs-search"
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && searching) {
                // The first Escape clears the box; with nothing typed it closes Preferences as before.
                e.preventDefault();
                onQuery('');
              } else if (!searching) return;
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAt((a) => Math.min(hits.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAt((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (hits[at]) onGo(hits[at].row);
                else helpInstead();
              }
            }}
          />
        </div>
        <span className="ui-sr-only" role="status" aria-live="polite">
          {foundSaid(hits.length, query)}
        </span>
      </div>
      {searching && (
        <div className="ui-prefs-results" id="ui-prefsearch-list" role="listbox" aria-label="Matching settings" ref={list} data-testid="prefs-results">
          {hits.map((h: PrefHit, i) => {
            const r = h.row;
            const section = r.kind === 'command' ? 'commands' : r.page;
            const showHead = section !== lastPage;
            lastPage = section;
            const key = keyOf(r);
            return (
              <div key={r.id}>
                {showHead && (
                  <div className="ui-prefsearch-head" role="presentation">
                    <Icon name={pageIcons[r.page] ?? 'settings'} size={14} />
                    {r.kind === 'command' ? 'Shortcuts for commands' : PAGE_NAMES[r.page]}
                  </div>
                )}
                <div id={`ui-prefsearch-${i}`} role="option" aria-selected={i === at} className={`ui-prefsearch-row${i === at ? ' is-active' : ''}`} onMouseMove={() => at !== i && setAt(i)} onClick={() => onGo(r)}>
                  <span className="ui-prefsearch-main">
                    <strong>{r.label}</strong>
                    {r.group && r.kind !== 'setting' && <span className="ui-prefsearch-where">{r.group}</span>}
                    {r.hint && <span className="ui-prefsearch-hint">{r.hint}</span>}
                  </span>
                  {key && <Keys shortcut={key} />}
                </div>
              </div>
            );
          })}
          {!hits.length && (
            <div className="ui-prefsearch-none" data-testid="prefs-none">
              <Icon name="search" size={22} />
              <p>
                Nothing in Preferences is called <b>{query.trim()}</b>. It may be in the help instead.
              </p>
              <button type="button" className="ui-btn" onClick={helpInstead}>
                <Icon name="help" size={14} /> Search the help for it
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
