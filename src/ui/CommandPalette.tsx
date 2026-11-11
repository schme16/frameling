import { useEffect, useMemo, useRef, useState } from 'react';
import { syncDynamicCommands, isStaleCommand } from './dynamic';
import { effectiveKeys } from './keys';
import { openHelp, overlays, closePalette } from './overlays';
import { commandEnabled, noteRecentCommand, notNowMessage, paletteItems, rankPalette, runCommand, type PaletteHit } from './palette';
import { toast } from './toast';
import { Icon } from './icons';
import { Keys } from './ShortcutChip';
import { Modal } from './Modal';
import { useStore } from '../core/store';

export function CommandPalette() {
  const open = overlays.use((o) => o.palette);
  if (!open) return null;
  return <PaletteDialog />;
}

function PaletteDialog() {
  useStore((s) => s);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const hits: PaletteHit[] = useMemo(() => {
    syncDynamicCommands();
    return rankPalette(
      query,
      paletteItems().filter((i) => !(i.kind === 'command' && isStaleCommand(i.id))),
    );
  }, [query]);

  useEffect(() => setAt(0), [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [at, hits]);

  const choose = (hit: PaletteHit | undefined) => {
    if (!hit) return;
    if (hit.item.kind === 'help') {
      openHelp(hit.item.id);
      return;
    }
    const c = hit.item.command;
    if (!commandEnabled(c)) {
      // Say why nothing happened, with a way to find out more.
      const help = c.help;
      toast(notNowMessage(c), { kind: 'info', action: help ? { label: 'Read about it', run: () => openHelp(help) } : undefined });
      return;
    }
    closePalette();
    noteRecentCommand(c.id);
    // Let the palette close and focus return before the command runs, so commands that open things keep their focus.
    window.setTimeout(() => runCommand(c), 0);
  };

  let lastCategory = '';
  return (
    <Modal title="Find a command" size="md" hideHeader className="ui-palette" onClose={closePalette} initialFocus=".ui-palette-input">
      <div className="ui-palette-search">
        <Icon name="search" size={18} />
        <input
          className="ui-palette-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="ui-palette-list"
          aria-activedescendant={hits[at] ? `ui-pal-${at}` : undefined}
          aria-label="Search commands and help"
          placeholder="What would you like to do?"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setAt((a) => Math.min(hits.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setAt((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(hits[at]);
            } else if (e.key === 'Home' && e.ctrlKey) setAt(0);
          }}
        />
        <span className="ui-palette-esc">Esc</span>
      </div>
      <div className="ui-palette-list" id="ui-palette-list" role="listbox" ref={list}>
        {hits.map((h, i) => {
          const it = h.item;
          const enabled = it.kind === 'help' || commandEnabled(it.command);
          const showHead = !query.trim() && it.category !== lastCategory;
          lastCategory = it.category;
          const key = it.kind === 'command' ? effectiveKeys(it.command)[0] : '';
          return (
            <div key={`${it.kind}:${it.id}`}>
              {showHead && <div className="ui-palette-head">{it.category}</div>}
              <div
                id={`ui-pal-${i}`}
                role="option"
                aria-selected={i === at}
                aria-disabled={!enabled || undefined}
                className={`ui-palette-row${i === at ? ' is-active' : ''}${enabled ? '' : ' is-disabled'}`}
                onMouseMove={() => at !== i && setAt(i)}
                onClick={() => choose(h)}
              >
                <span className="ui-palette-main">
                  {it.kind === 'help' && <Icon name="help" size={15} />}
                  <span className="ui-palette-label">{it.label}</span>
                  {it.description && <span className="ui-palette-desc">{it.description}</span>}
                </span>
                {query.trim() && <span className="ui-palette-cat">{it.kind === 'help' ? 'Help' : it.category}</span>}
                {key && <Keys shortcut={key} />}
              </div>
            </div>
          );
        })}
        {!hits.length && (
          <div className="ui-palette-none">
            <Icon name="search" size={22} />
            <p>Nothing called that yet. Try fewer or different words.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
