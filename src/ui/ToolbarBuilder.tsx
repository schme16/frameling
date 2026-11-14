// "Change the tools": the panel that sits beside the tool rail while it is being changed. The rail itself does the
// moving (drag, click for a menu, names to type, folds to flip); this holds the things that belong to no one tool:
// the Put away shelf, button size, group names, rail style, and putting it all back.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getTool } from '../core/registry';
import { Icon } from './icons';
import type { DockZone } from './dockModel';
import { dock } from './dock';
import { setPrefs, usePrefs, TOOL_SIZES, type ToolSizePref } from './prefs';
import { bringToolBack, currentGroups, putToolsBack, setToolbarEditing, startToolDrag, toolbarIsChanged, toolDrag } from './toolRail';
import { visibleGroups } from './toolArrange';

const SIZE_WORDS: Record<ToolSizePref, string> = { small: 'Small', medium: 'Medium', large: 'Large' };

function Segments<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: [V, string][]; onChange: (v: V) => void }) {
  return (
    <div className="ui-tb-segs" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={`ui-tb-seg${value === v ? ' is-on' : ''}`} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function ToolbarBuilder({ anchor, place, away, visible }: { anchor: DOMRect | null; place: DockZone | 'float'; away: string[]; visible: (id: string) => boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = usePrefs((p) => p.toolSize);
  const names = usePrefs((p) => p.toolNames);
  const style = usePrefs((p) => p.toolRail);
  const offLayer = usePrefs((p) => p.toolsOffLayer);
  // Read so the button wakes up when the arrangement or the settings change.
  dock.use((d) => d.rails?.[d.workspaceId]);
  const changed = toolbarIsChanged();
  const drag = toolDrag.use((d) => d);
  const overShelf = drag?.mark?.kind === 'shelf';
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
  }, []);
  const rail = anchor ?? new DOMRect(0, 80, 94, 400);
  const side = place === 'right' || (place === 'float' && rail.left > window.innerWidth / 2) ? 'left' : place === 'top' ? 'below' : place === 'bottom' ? 'above' : 'right';
  const top = Math.max(8, rail.top);
  const style_: React.CSSProperties =
    side === 'below' ? { top: rail.bottom + 8, left: Math.max(8, rail.left) } : side === 'above' ? { bottom: window.innerHeight - rail.top + 8, left: Math.max(8, rail.left) } : side === 'left' ? { top, right: window.innerWidth - rail.left + 8 } : { top, left: rail.right + 8 };
  return createPortal(
    <div
      ref={ref}
      className="ui-tb-panel"
      role="dialog"
      aria-label="Change the tools"
      data-help="tool-builder"
      style={{ ...style_, maxHeight: side === 'above' ? undefined : `calc(100vh - ${top + 8}px)` }}
      // The panel is a portal, so what happens in it must not reach the rail's own menus and keys.
      onContextMenu={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') setToolbarEditing(false);
      }}
    >
      <h2 className="ui-tb-title">Change the tools</h2>
      <p className="ui-tb-hint">Drag a tool to move it. Click one for more. Drag one here to put it away.</p>

      <h3 className="ui-tb-head">Put away</h3>
      <div className={`ui-tb-shelf${overShelf ? ' is-drop' : ''}`} data-tool-shelf data-help="tool-builder" aria-label="Tools put away">
        {away.length ? (
          away.map((id) => {
            const t = getTool(id);
            if (!t) return null;
            return (
              <button
                key={id}
                type="button"
                className={`ui-tb-away${drag?.id === id ? ' is-lifted' : ''}`}
                aria-label={`${t.label}, put away. Press to bring it back.`}
                data-tip={t.label}
                data-tip-desc="Press to bring it back to the place it had. Or drag it onto the rail."
                onClick={() => bringToolBack(id)}
                onPointerDown={(e) => startToolDrag(e, id, () => visibleGroups(currentGroups(), visible), visible)}
              >
                <Icon name={t.icon} size={20} />
              </button>
            );
          })
        ) : (
          <span className="ui-tb-empty">Nothing put away. Drag a tool you never use here.</span>
        )}
      </div>
      {away.length > 1 && (
        <button type="button" className="ui-tb-link" onClick={() => bringToolBack()}>
          Bring them all back
        </button>
      )}

      <h3 className="ui-tb-head">New group</h3>
      <p className="ui-tb-note">Drag a tool to a gold <b>+</b> between two groups, or click a tool and choose <b>Start a new group here</b>. Give it no name and it is just a divider.</p>

      <h3 className="ui-tb-head">Button size</h3>
      <Segments label="Button size" value={size} options={TOOL_SIZES.map((s): [ToolSizePref, string] => [s, SIZE_WORDS[s]])} onChange={(toolSize) => setPrefs({ toolSize })} />

      <h3 className="ui-tb-head">Group names</h3>
      <Segments label="Group names" value={names ? 'show' : 'hide'} options={[['show', 'Show'], ['hide', 'Hide']]} onChange={(v) => setPrefs({ toolNames: v === 'show' })} />

      <h3 className="ui-tb-head">Tools that do not work on this layer</h3>
      <Segments label="Tools that do not work on this layer" value={offLayer} options={[['hide', 'Hide them'], ['grey', 'Grey them out']]} onChange={(toolsOffLayer) => setPrefs({ toolsOffLayer })} />

      <h3 className="ui-tb-head">Rail style</h3>
      <Segments label="Rail style" value={style} options={[['two', 'Every tool'], ['stacked', 'One per group']]} onChange={(toolRail) => setPrefs({ toolRail })} />
      {style === 'stacked' && <p className="ui-tb-note">Every group is one button. Choose Every tool to fold only some.</p>}

      <div className="ui-tb-foot">
        <button type="button" className="ui-tb-back" disabled={!changed} onClick={putToolsBack} data-tip="Put the tools back" data-tip-desc="Groups, names, hidden and folded tools, size and style all go back to how they come. Undo is on the message.">
          Put the tools back
        </button>
        <button type="button" className="ui-tb-done" onClick={() => setToolbarEditing(false)}>
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** The size in pixels of an icon on a button of this size. */
export const iconSizeFor = (s: ToolSizePref): number => (s === 'small' ? 16 : s === 'large' ? 25 : 20);
