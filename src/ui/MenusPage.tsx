// Preferences > Menus: change what is in the menus. Move an entry with the arrows or by dragging it, take it out, put
// one back, add any command to any menu, rename a menu or submenu, make menus and submenus of your own, and put it all
// back the way it came. The saved shape and the rules for laying it over the built-in menus are in menuEdits.ts.
import { useMemo, useRef, useState } from 'react';
import { allCommands, getCommand } from '../core/registry';
import { Icon } from './icons';
import { Keys } from './ShortcutChip';
import { effectiveKeys } from './keys';
import { currentShape, MENUS, menuTitle, SUBMENUS } from './menus';
import {
  addCustomMenu,
  addCustomSub,
  changedKeys,
  dropGap,
  entryKind,
  groupWords,
  insertEntry,
  isCustomId,
  landsAt,
  moveEntry,
  putBack,
  putEntryBack,
  removeCustom,
  removeEntry,
  renameKey,
  setList,
  subKey,
  takenOut,
  type MenuEdits,
} from './menuEdits';
import { getMenuEdits, setMenuEdits, useMenuEdits } from './menuState';
import { commandEnabled, paletteItems, rankPalette, runCommand } from './palette';
import { dock, listWorkspaces } from './dock';
import { toast } from './toast';
import './menusPage.css';

/** Where the page is: the bar (nothing), a menu, or a submenu inside one. */
interface Here {
  menu: string | null;
  sub: string | null;
}

const BAR = 'bar';

const keyOf = (h: Here): string => (h.sub ? subKey(h.sub) : (h.menu ?? BAR));

/** Take a change back: the toast's Undo button puts the edits as they were. */
function changed(before: MenuEdits, message: string): void {
  toast(message, {
    kind: 'success',
    action: {
      label: 'Undo',
      id: 'menus-undo',
      run: () => setMenuEdits(before),
    },
  });
}

export function MenusPage() {
  const edits = useMenuEdits((e) => e);
  const everywhere = getCommand('view.menusEverywhere');
  const canShare = dock.use((s) => (everywhere && s ? commandEnabled(everywhere) : false));
  const workspaceName = dock.use((s) => listWorkspaces().find((w) => w.id === s.workspaceId)?.name ?? 'this workspace');
  const [here, setHere] = useState<Here>({ menu: null, sub: null });
  const shape = currentShape();
  const key = keyOf(here);
  const items = shape.lists[key] ?? [];
  const builtIn = shape.defaults[key] ?? [];
  const marks = changedKeys(edits);
  const anything = marks.size > 0 || !!edits.custom;

  const labelOfMenu = (id: string): string => {
    const m = shape.menus.find((x) => x.label === id) ?? MENUS.find((x) => x.label === id);
    return m ? menuTitle(m) : (edits.custom?.[id]?.title ?? id);
  };
  const labelOfSub = (k: string): string => shape.subs[k]?.label ?? SUBMENUS[k]?.label ?? edits.custom?.[k]?.title ?? k;
  const builtInTitle = (k: string): string => {
    if (isCustomId(k.replace(/^sub:/, ''))) return '';
    if (k.startsWith('sub:')) return SUBMENUS[k.slice(4)]?.label ?? '';
    const m = MENUS.find((x) => x.label === k);
    return m ? (m.title ?? m.label) : '';
  };

  const save = (next: MenuEdits) => setMenuEdits(next);
  const saveList = (next: string[]) => save(setList(getMenuEdits(), key, next, builtIn));

  const putAllBack = () => {
    const before = getMenuEdits();
    setMenuEdits({ v: 1 });
    setHere({ menu: null, sub: null });
    changed(before, 'The menus are back the way they came.');
  };
  const putThisBack = () => {
    const before = getMenuEdits();
    save(putBack(before, key));
    changed(before, `${here.sub ? labelOfSub(here.sub) : here.menu ? labelOfMenu(here.menu) : 'The menu bar'} is back the way it came.`);
  };

  const crumbs = (
    <nav className="ui-me-crumbs" aria-label="Where you are in the menus">
      <button type="button" className="ui-btn ui-btn-quiet ui-btn-small" onClick={() => setHere({ menu: null, sub: null })} disabled={!here.menu}>
        Menu bar
      </button>
      {here.menu && (
        <>
          <Icon name="chevron-right" size={12} />
          <button type="button" className="ui-btn ui-btn-quiet ui-btn-small" onClick={() => setHere({ menu: here.menu, sub: null })} disabled={!here.sub}>
            {labelOfMenu(here.menu)}
          </button>
        </>
      )}
      {here.sub && (
        <>
          <Icon name="chevron-right" size={12} />
          <span className="ui-me-crumb-now">{labelOfSub(here.sub)}</span>
        </>
      )}
      <span className="ui-me-crumbs-end">
        <button
          type="button"
          className="ui-btn ui-btn-small"
          data-testid="menus.put-this-back"
          disabled={!marks.has(key) && !(here.menu === null && (!!edits.custom || marks.has(BAR)))}
          onClick={putThisBack}
        >
          {here.menu === null ? 'Put the bar back' : 'Put this menu back'}
        </button>
      </span>
    </nav>
  );

  return (
    <div className="ui-me" data-testid="menus.page">
      <h3>Menus</h3>
      <p className="ui-pref-intro">
        <strong data-testid="menus.workspace">These are the menus for {workspaceName}.</strong> Each workspace keeps its own. Move things about, take out what you never use, add any command, and make menus of your own. Everything is still in the command search (Ctrl+K).
      </p>
      {crumbs}
      {here.menu === null ? (
        <BarList
          items={items}
          builtIn={builtIn}
          labelOfMenu={labelOfMenu}
          builtInTitle={builtInTitle}
          marks={marks}
          onOpen={(id) => setHere({ menu: id, sub: null })}
          onList={saveList}
          customs={edits.custom ?? {}}
        />
      ) : (
        <EntryList
          listKey={key}
          items={items}
          builtIn={builtIn}
          labelOfSub={labelOfSub}
          canNest={!here.sub}
          onOpenSub={(k) => setHere({ menu: here.menu, sub: k })}
          onList={saveList}
          title={here.sub ? labelOfSub(here.sub) : labelOfMenu(here.menu)}
          builtInTitle={builtInTitle(key)}
        />
      )}
      <div className="ui-pref-foot">
        <button type="button" className="ui-btn" data-testid="menus.put-all-back" disabled={!anything} onClick={putAllBack}>
          Put all the menus back
        </button>
        <button type="button" className="ui-btn" data-testid="menus.everywhere" disabled={!canShare} onClick={() => everywhere && runCommand(everywhere)} title="Copy these menus to every other workspace">
          Use these in every workspace
        </button>
        <span>{anything ? 'Changed menus have a "Changed" tag.' : 'The menus are as they came.'}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the menu bar

function BarList({
  items,
  builtIn,
  labelOfMenu,
  builtInTitle,
  marks,
  onOpen,
  onList,
  customs,
}: {
  items: string[];
  builtIn: string[];
  labelOfMenu: (id: string) => string;
  builtInTitle: (k: string) => string;
  marks: Set<string>;
  onOpen: (id: string) => void;
  onList: (items: string[]) => void;
  customs: NonNullable<MenuEdits['custom']>;
}) {
  const [name, setName] = useState('');
  const away = takenOut(items, builtIn);
  const addMenu = () => {
    const r = addCustomMenu(getMenuEdits(), name, items, builtIn);
    setMenuEdits(r.edits);
    setName('');
    onOpen(r.id);
  };
  return (
    <>
      <p className="ui-pref-intro">These are the menus along the top, in order.</p>
      <Rows
        items={items}
        label="Menus on the bar"
        render={(id) => (
          <>
            <button type="button" className="ui-me-name" onClick={() => onOpen(id)}>
              {labelOfMenu(id)}
            </button>
            {customs[id] && <span className="ui-tag">Yours</span>}
            {marks.has(id) && !customs[id] && <span className="ui-tag ui-tag-on">Changed</span>}
          </>
        )}
        extra={(id, at) => (
          <>
            <button type="button" className="ui-btn ui-btn-small" onClick={() => onOpen(id)}>
              Open
            </button>
            {customs[id] ? (
              <button type="button" className="ui-icon-btn" aria-label={`Delete ${labelOfMenu(id)}`} data-tip="Delete this menu" onClick={() => deleteCustom(id, labelOfMenu(id))}>
                <Icon name="trash" size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="ui-icon-btn"
                aria-label={`Hide ${labelOfMenu(id)}`}
                data-tip="Hide this menu. Its commands stay in the command search."
                onClick={() => onList(removeEntry(items, at))}
              >
                <Icon name="eye-off" size={15} />
              </button>
            )}
          </>
        )}
        onMove={(from, to) => onList(moveEntry(items, from, to))}
      />
      {away.length > 0 && (
        <>
          <h4 className="ui-ws-head">Hidden</h4>
          <ul className="ui-ws-list" aria-label="Hidden menus">
            {away.map((id) => (
              <li key={id} className="ui-ws is-hidden">
                <span className="ui-ws-name">{builtInTitle(id) || id}</span>
                <div className="ui-ws-acts">
                  <button type="button" className="ui-btn ui-btn-small" data-testid={`menus.show.${id}`} onClick={() => onList(putEntryBack(items, builtIn, id))}>
                    Show it again
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <form
        className="ui-ws-save"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) addMenu();
        }}
      >
        <label className="ui-field ui-field-wide">
          <span>Make a menu of your own</span>
          <input type="text" placeholder="My favourites" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="ui-btn ui-btn-primary" disabled={!name.trim()}>
          Add the menu
        </button>
      </form>
    </>
  );
}

/** Deleting a menu or submenu you made: it asks no question, and the toast brings it back. */
function deleteCustom(id: string, name: string): void {
  const before = getMenuEdits();
  setMenuEdits(removeCustom(before, id));
  changed(before, `Deleted ${name}.`);
}

// ---------------------------------------------------------------- the entries of one menu or submenu

function EntryList({
  listKey,
  items,
  builtIn,
  labelOfSub,
  canNest,
  onOpenSub,
  onList,
  title,
  builtInTitle,
}: {
  listKey: string;
  items: string[];
  builtIn: string[];
  labelOfSub: (k: string) => string;
  canNest: boolean;
  onOpenSub: (k: string) => void;
  onList: (items: string[]) => void;
  title: string;
  builtInTitle: string;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [find, setFind] = useState('');
  const [subName, setSubName] = useState('');
  const out = takenOut(items, builtIn);
  const rename = () => {
    setMenuEdits(renameKey(getMenuEdits(), listKey, draft, builtInTitle));
    setRenaming(false);
  };
  const wordsOf = (e: string): string => {
    switch (entryKind(e)) {
      case 'divider':
        return 'Divider line';
      case 'heading':
        return e.slice(8);
      case 'group':
        return groupWords(e);
      case 'submenu':
        return labelOfSub(e.slice(4));
      default:
        return getCommand(e)?.label ?? e;
    }
  };
  const addSub = () => {
    const r = addCustomSub(getMenuEdits(), subName, listKey, items, builtIn);
    setMenuEdits(r.edits);
    setSubName('');
    onOpenSub(r.id);
  };

  return (
    <>
      <div className="ui-me-title">
        {renaming ? (
          <input
            className="ui-ws-edit"
            aria-label="Name"
            value={draft}
            autoFocus
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') rename();
              if (e.key === 'Escape') {
                e.preventDefault();
                setRenaming(false);
              }
            }}
          />
        ) : (
          <>
            <strong>{title}</strong>
            <button type="button" className="ui-btn ui-btn-small" onClick={() => (setDraft(title), setRenaming(true))}>
              Rename
            </button>
          </>
        )}
      </div>
      {items.length === 0 && <p className="ui-pref-intro">Nothing in here yet. Add a command below.</p>}
      <Rows
        items={items}
        label={`What is in ${title}`}
        render={(e) => {
          const kind = entryKind(e);
          const missing = kind === 'command' && !getCommand(e);
          const c = kind === 'command' ? getCommand(e) : undefined;
          return (
            <>
              {kind === 'submenu' ? (
                <button type="button" className="ui-me-name" onClick={() => onOpenSub(e.slice(4))} disabled={!canNest}>
                  {wordsOf(e)}
                </button>
              ) : (
                <span className={`ui-me-name ui-me-${kind}${missing ? ' is-missing' : ''}`}>{wordsOf(e)}</span>
              )}
              {kind === 'submenu' && <span className="ui-tag">Submenu</span>}
              {kind === 'group' && <span className="ui-tag">Fills itself</span>}
              {missing && (
                <span className="ui-tag" data-tip="This is not here right now, so the menu leaves it out. It comes back if it comes back.">
                  Not here right now
                </span>
              )}
              {c && effectiveKeys(c)[0] && <Keys shortcut={effectiveKeys(c)[0]} className="ui-keys-menu" />}
            </>
          );
        }}
        extra={(e, at) => (
          <>
            {entryKind(e) === 'submenu' && canNest && (
              <button type="button" className="ui-btn ui-btn-small" onClick={() => onOpenSub(e.slice(4))}>
                Open
              </button>
            )}
            {isCustomId(e.replace(/^sub:/, '')) && entryKind(e) === 'submenu' ? (
              <button type="button" className="ui-icon-btn" aria-label={`Delete ${wordsOf(e)}`} data-tip="Delete this submenu" onClick={() => deleteCustom(e.slice(4), wordsOf(e))}>
                <Icon name="trash" size={15} />
              </button>
            ) : (
              <button type="button" className="ui-icon-btn" aria-label={`Take ${wordsOf(e)} out`} data-tip="Take it out of this menu" onClick={() => onList(removeEntry(items, at))}>
                <Icon name="close" size={14} />
              </button>
            )}
          </>
        )}
        onMove={(from, to) => onList(moveEntry(items, from, to))}
      />
      <AddCommand find={find} onFind={setFind} items={items} onAdd={(id) => onList([...items, id])} />
      <div className="ui-me-add">
        <button type="button" className="ui-btn ui-btn-small" onClick={() => onList([...items, '-'])}>
          Add a divider
        </button>
        {canNest && (
          <>
            <span className="ui-me-or">or</span>
            <form
              className="ui-me-subform"
              onSubmit={(e) => {
                e.preventDefault();
                if (subName.trim()) addSub();
              }}
            >
              <input type="text" aria-label="Name for a new submenu" placeholder="A new submenu" value={subName} maxLength={40} onChange={(e) => setSubName(e.target.value)} />
              <button type="submit" className="ui-btn ui-btn-small" disabled={!subName.trim()}>
                Add the submenu
              </button>
            </form>
          </>
        )}
      </div>
      {canNest && <BuiltInSubs items={items} labelOfSub={labelOfSub} onAdd={(k) => onList([...items, subKey(k)])} />}
      {out.length > 0 && (
        <>
          <h4 className="ui-ws-head">
            Taken out <span>{out.length}</span>
          </h4>
          <ul className="ui-ws-list" aria-label="Taken out of this menu">
            {out.slice(0, 40).map((e) => (
              <li key={e} className="ui-ws is-hidden">
                <span className="ui-ws-name">{wordsOf(e)}</span>
                <div className="ui-ws-acts">
                  <button type="button" className="ui-btn ui-btn-small" onClick={() => onList(putEntryBack(items, builtIn, e))}>
                    Put back
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** The submenus that come with Frameling and are not in this menu now, to add to it. */
function BuiltInSubs({ items, labelOfSub, onAdd }: { items: string[]; labelOfSub: (k: string) => string; onAdd: (k: string) => void }) {
  const here = new Set(items);
  const rest = Object.keys(SUBMENUS).filter((k) => !here.has(subKey(k)));
  if (!rest.length) return null;
  return (
    <details className="ui-me-more">
      <summary>Add a submenu that comes with Frameling</summary>
      <ul className="ui-ws-list">
        {rest.map((k) => (
          <li key={k} className="ui-ws">
            <span className="ui-ws-name">{labelOfSub(k)}</span>
            <div className="ui-ws-acts">
              <button type="button" className="ui-btn ui-btn-small" onClick={() => onAdd(k)}>
                Add
              </button>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Search every command by its name, and add one to the end of the list. */
function AddCommand({ find, onFind, items, onAdd }: { find: string; onFind: (v: string) => void; items: string[]; onAdd: (id: string) => void }) {
  const list = useMemo(() => paletteItems(allCommands(), [], []), []);
  const hits = find.trim() ? rankPalette(find, list, [], 8).flatMap((h) => (h.item.kind === 'command' ? [h.item] : [])) : [];
  return (
    <div className="ui-me-find">
      <label className="ui-field ui-field-wide">
        <span>Add a command</span>
        <input type="search" placeholder="Type what it does, like export or mirror" value={find} onChange={(e) => onFind(e.target.value)} data-testid="menus.find" />
      </label>
      {hits.length > 0 && (
        <ul className="ui-ws-list" aria-label="Commands found">
          {hits.map((h) => (
            <li key={h.id} className="ui-ws">
              <div className="ui-ws-text">
                <span className="ui-ws-name">{h.label}</span>
                <span className="ui-ws-about">{h.description}</span>
              </div>
              <div className="ui-ws-acts">
                <button type="button" className="ui-btn ui-btn-small" onClick={() => (onAdd(h.id), onFind(''))}>
                  {items.includes(h.id) ? 'Add another' : 'Add'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {find.trim() && hits.length === 0 && <p className="ui-pref-intro">Nothing is called that. Try another word.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- rows you can move

/**
 * A list of rows you can reorder: arrows for the keyboard and a handle for the mouse or pen. Dragging works from the
 * handle with pointer events, and the row you are over shows a line where it would land.
 */
function Rows({
  items,
  label,
  render,
  extra,
  onMove,
}: {
  items: string[];
  label: string;
  render: (e: string, at: number) => React.ReactNode;
  extra: (e: string, at: number) => React.ReactNode;
  onMove: (from: number, to: number) => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<{ from: number; gap: number } | null>(null);
  const gapAt = (y: number): number => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>(':scope > li') ?? [])];
    return dropGap(
      rows.map((r) => r.getBoundingClientRect().top + r.getBoundingClientRect().height / 2),
      y,
    );
  };
  const start = (e: React.PointerEvent<HTMLElement>, from: number) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from, gap: from });
  };
  const over = (e: React.PointerEvent<HTMLElement>) => {
    if (drag) setDrag({ ...drag, gap: gapAt(e.clientY) });
  };
  const drop = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const to = landsAt(drag.from, gapAt(e.clientY));
    setDrag(null);
    if (to !== drag.from) onMove(drag.from, to);
  };
  return (
    <ul className={`ui-ws-list ui-me-list${drag ? ' is-dragging' : ''}`} aria-label={label} ref={list}>
      {items.map((e, at) => {
        const kind = entryKind(e);
        return (
          <li
            // The same entry keeps its row when it moves, so the handle you are dragging is not replaced under your hand.
            key={`${e}#${items.slice(0, at).filter((x) => x === e).length}`}
            className={`ui-ws ui-me-row ui-me-k-${kind}${drag?.from === at ? ' is-lifted' : ''}${drag && drag.gap === at && drag.gap !== drag.from && drag.gap !== drag.from + 1 ? ' is-gap-before' : ''}${drag && at === items.length - 1 && drag.gap === items.length && drag.from !== items.length - 1 ? ' is-gap-after' : ''}`}
            data-entry={e}
          >
            <span
              className="ui-me-grip"
              role="button"
              tabIndex={-1}
              aria-label="Drag to move"
              data-tip="Drag to move"
              onPointerDown={(ev) => start(ev, at)}
              onPointerMove={over}
              onPointerUp={drop}
              onPointerCancel={() => setDrag(null)}
            >
              <Icon name="grip" size={14} />
            </span>
            <div className="ui-ws-text ui-me-text">{render(e, at)}</div>
            <div className="ui-ws-acts">
              <button type="button" className="ui-icon-btn" aria-label="Move up" data-tip="Move up" disabled={at === 0} onClick={() => onMove(at, at - 1)}>
                <Icon name="chevron-up" size={14} />
              </button>
              <button type="button" className="ui-icon-btn" aria-label="Move down" data-tip="Move down" disabled={at === items.length - 1} onClick={() => onMove(at, at + 1)}>
                <Icon name="chevron-down" size={14} />
              </button>
              {extra(e, at)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
