// Every panel in one list, with a sentence on what each is for and a search. Opens one (bringing back one that was
// closed). Used by the rail's Panels button and the tab bar's Panels button.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { allPanels } from '../core/registry';
import { dock, panelTitle, placeOf, showPanel } from './dock';
import { Icon } from './icons';
import { GROUP_NAMES, infoFor, isSection, matchPanel, RAIL_GROUPS } from './panelInfo';
import { rightStyle } from './rightStyle';
import { usePopover } from './popover';

const ZONE_NAMES = { left: 'Left side', right: 'Right side', bottom: 'Bottom', top: 'Top' } as const;

export function PanelPicker({ at, side, onClose }: { at: { x: number; y: number; w: number; h: number }; side: 'left' | 'below'; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [cur, setCur] = useState(0);
  const layout = dock.use((d) => d.layout);
  const uid = useId();
  const merged = rightStyle.use((v) => v === 'inspector');
  usePopover(ref, onClose);
  // A click outside closes it (the button that opened it toggles it itself).
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest?.('[data-panels-button]')) return;
      onClose();
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [onClose]);
  const groups = useMemo(() => {
    const ps = allPanels().filter((p) => matchPanel(p, q));
    return RAIL_GROUPS.map((g) => ({ g, ps: ps.filter((p) => infoFor(p).group === g) })).filter((x) => x.ps.length);
  }, [q]);
  const flat = groups.flatMap((x) => x.ps);
  const pick = (id: string) => {
    showPanel(id);
    onClose();
  };
  const style: React.CSSProperties =
    side === 'left' ? { right: Math.max(8, window.innerWidth - at.x + 6), bottom: Math.max(8, window.innerHeight - at.y - at.h) } : { top: at.y + at.h + 4, right: Math.max(8, window.innerWidth - at.x - at.w) };

  return (
    <div className="rd-picker" role="dialog" aria-label="All panels" ref={ref} style={style}>
      <div className="rd-picker-search">
        <Icon name="search" size={14} />
        <input
          type="search"
          value={q}
          placeholder="Find a panel"
          aria-label="Find a panel"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${uid}-list`}
          aria-activedescendant={flat[cur] ? `${uid}-${flat[cur].id}` : undefined}
          onChange={(e) => {
            setQ(e.target.value);
            setCur(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const n = flat.length || 1;
              setCur((c) => (c + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
            } else if (e.key === 'Enter' && flat[cur]) {
              e.preventDefault();
              pick(flat[cur].id);
            }
          }}
        />
      </div>
      <div className="rd-picker-list" role="listbox" id={`${uid}-list`} aria-label="Panels">
        {groups.map(({ g, ps }) => (
          <div key={g} role="group" aria-label={GROUP_NAMES[g]}>
            <div className="rd-picker-group" aria-hidden="true">
              {GROUP_NAMES[g]}
            </div>
            {ps.map((p) => {
              const at = placeOf(p.id, layout);
              const z = at && 'zone' in at ? at.zone : null;
              const i = flat.indexOf(p);
              return (
                <div
                  key={p.id}
                  id={`${uid}-${p.id}`}
                  role="option"
                  aria-selected={i === cur}
                  className={`rd-picker-item${i === cur ? ' is-current' : ''}`}
                  onPointerEnter={() => setCur(i)}
                  onClick={() => pick(p.id)}
                >
                  <Icon name={p.icon} size={16} />
                  <span className="rd-picker-text">
                    <span className="rd-picker-name">
                      {panelTitle(p.id, layout)}
                      <span className={`rd-picker-where${at ? '' : ' is-closed'}`}>{!at ? 'Closed' : !z ? 'Floating' : z === 'right' && merged && isSection(p.id) ? 'In Properties' : ZONE_NAMES[z]}</span>
                    </span>
                    <span className="rd-picker-blurb">{infoFor(p).blurb}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        {!flat.length && <p className="rd-picker-none">No panel matches that. Try another word.</p>}
      </div>
    </div>
  );
}
