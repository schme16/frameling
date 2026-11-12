// @vitest-environment jsdom
// The shared keyboard behaviour every dialog, popup and splitter gets: focus moves in when it opens, Escape closes it
// and focus goes back to what opened it, Tab stays inside a modal dialog, and splitters resize with the arrow keys.
import { act, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPanel } from '../../src/core/registry';
import { dock, resetDock } from '../../src/ui/dock';
import { Splitter } from '../../src/ui/DockView';
import { Modal as UiModal } from '../../src/ui/Modal';
import { Modal as IoModal } from '../../src/io/mount';
import { usePopover } from '../../src/ui/popover';

vi.mock('../../src/io/io.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout, so nothing has an offsetParent; the dialogs use it to skip hidden controls.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode; } });

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let opener: HTMLButtonElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  opener.remove();
});

const key = (target: Element, k: string, init: KeyboardEventInit = {}) => act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })));

describe.each([
  ['ui Modal', (onClose: () => void) => <UiModal title="T" onClose={onClose}><button>one</button><button>two</button></UiModal>],
  ['io Modal', (onClose: () => void) => <IoModal title="T" onClose={onClose}><button>one</button><button>two</button></IoModal>],
])('%s', (_name, make) => {
  it('takes focus when it opens, and Escape asks to close', () => {
    const onClose = vi.fn();
    act(() => root.render(make(onClose)));
    const dlg = host.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dlg.contains(document.activeElement)).toBe(true);
    key(document.activeElement!, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('keeps Tab inside, wrapping at both ends', () => {
    act(() => root.render(make(() => {})));
    const dlg = host.querySelector<HTMLElement>('[role="dialog"]')!;
    const items = [...dlg.querySelectorAll<HTMLElement>('button')];
    const last = items[items.length - 1];
    last.focus();
    key(last, 'Tab');
    expect(document.activeElement).toBe(items[0]);
    key(items[0], 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

it('the ui Modal gives focus back to what opened it', () => {
  act(() => root.render(<UiModal title="T" onClose={() => {}}><button>one</button></UiModal>));
  expect(document.activeElement).not.toBe(opener);
  act(() => root.render(<div />));
  expect(document.activeElement).toBe(opener);
});

function Pop({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  usePopover(ref, onClose);
  return (
    <div ref={ref}>
      <button id="first">first</button>
      <button>second</button>
    </div>
  );
}

describe('usePopover', () => {
  it('moves focus in at once, and Escape closes it without reaching anything else', () => {
    const onClose = vi.fn();
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    act(() => root.render(<Pop onClose={onClose} />));
    expect(document.activeElement?.id).toBe('first');
    key(document.activeElement!, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outer);
  });
  it('gives focus back to what opened it when it goes', () => {
    act(() => root.render(<Pop onClose={() => {}} />));
    act(() => root.render(<div />));
    expect(document.activeElement).toBe(opener);
  });
});

describe('a splitter', () => {
  beforeAll(() => {
    registerPanel({ id: 'preview', title: 'Preview', icon: 'play', component: () => null, zone: 'right', order: 30 });
  });
  const sep = () => host.querySelector<HTMLElement>('[role="separator"]')!;
  beforeEach(() => {
    resetDock();
    act(() => root.render(<Splitter zone="right" />));
  });
  it('says what it is and where it stands', () => {
    expect(sep().tabIndex).toBe(0);
    const size = dock.get().layout.zones.right.size;
    expect(sep().getAttribute('aria-valuenow')).toBe(String(size));
    expect(Number(sep().getAttribute('aria-valuemin'))).toBeLessThan(size);
    expect(Number(sep().getAttribute('aria-valuemax'))).toBeGreaterThan(size);
  });
  it('resizes with the arrow keys, Home and End', () => {
    const size = dock.get().layout.zones.right.size;
    // The right zone grows when the splitter moves left.
    key(sep(), 'ArrowLeft');
    expect(dock.get().layout.zones.right.size).toBe(size + 16);
    key(sep(), 'ArrowRight', { shiftKey: true });
    expect(dock.get().layout.zones.right.size).toBe(size + 16 - 64);
    key(sep(), 'End');
    expect(dock.get().layout.zones.right.size).toBe(Number(sep().getAttribute('aria-valuemax')));
    key(sep(), 'Home');
    expect(dock.get().layout.zones.right.size).toBe(Number(sep().getAttribute('aria-valuemin')));
    expect(sep().getAttribute('aria-valuenow')).toBe(String(dock.get().layout.zones.right.size));
  });
});

function Menu({ onClose, menu }: { onClose: () => void; menu: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  usePopover(ref, onClose);
  const role = menu ? 'menuitem' : undefined;
  return (
    <div ref={ref} role={menu ? 'menu' : 'group'}>
      <button id="first" role={role}>first</button>
      <button id="second" role={role}>second</button>
    </div>
  );
}

describe('usePopover leaving by keyboard', () => {
  const $ = (id: string) => host.querySelector<HTMLElement>('#' + id)!;
  // Four buttons in page order: before, opener, (the popup, once open), after. Focus starts on the opener.
  const page = (open: boolean, onClose: () => void, menu = false) => (
    <div>
      <button id="before">before</button>
      <button id="opener">opener</button>
      {open ? <Menu onClose={onClose} menu={menu} /> : null}
      <button id="after">after</button>
    </div>
  );
  const openIt = (onClose: () => void, menu = false) => {
    act(() => root.render(page(false, onClose, menu)));
    $('opener').focus();
    act(() => root.render(page(true, onClose, menu)));
  };

  it('Tab from the last control closes it and goes to the control after the opener', () => {
    const onClose = vi.fn();
    openIt(onClose);
    $('second').focus();
    key($('second'), 'Tab');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe($('after'));
  });
  it('Tab between its own controls leaves it open', () => {
    const onClose = vi.fn();
    openIt(onClose);
    $('first').focus();
    key($('first'), 'Tab');
    expect(onClose).not.toHaveBeenCalled();
  });
  it('Shift+Tab from the first control goes to the control before the opener, not the opener', () => {
    const onClose = vi.fn();
    openIt(onClose);
    $('first').focus();
    key($('first'), 'Tab', { shiftKey: true });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe($('before'));
  });
  it('a menu closes on any Tab', () => {
    const onClose = vi.fn();
    openIt(onClose, true);
    $('first').focus();
    key($('first'), 'Tab');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe($('after'));
  });
  it('closes when focus moves to something else', () => {
    const onClose = vi.fn();
    openIt(onClose);
    act(() => $('before').focus());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe($('before'));
  });
  it('does not close when focus only moves inside it', () => {
    const onClose = vi.fn();
    openIt(onClose);
    act(() => $('second').focus());
    expect(onClose).not.toHaveBeenCalled();
  });
});

// A popup that opens a child popup in a portal elsewhere on the page (a menu with a colour picker, say).
function Parent({ onClose, child, onChildClose }: { onClose: () => void; child: boolean; onChildClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  usePopover(ref, onClose);
  return (
    <div ref={ref} id="parent">
      <button id="pfirst">open child</button>
      <button id="plast">last</button>
      {child ? createPortal(<Child onClose={onChildClose} />, document.body) : null}
    </div>
  );
}
function Child({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  usePopover(ref, onClose);
  return (
    <div ref={ref} id="child">
      <button id="cfirst">c1</button>
      <button id="clast">c2</button>
    </div>
  );
}

describe('usePopover with a child popup', () => {
  const $ = (id: string) => document.querySelector<HTMLElement>('#' + id)!;
  const page = (child: boolean, onClose: () => void, onChildClose: () => void) => <Parent onClose={onClose} child={child} onChildClose={onChildClose} />;
  const openBoth = (onClose: () => void, onChildClose: () => void) => {
    act(() => root.render(page(false, onClose, onChildClose)));
    act(() => $('pfirst').focus());
    act(() => root.render(page(true, onClose, onChildClose)));
  };

  it('stays open while focus is inside the child popup', () => {
    const onClose = vi.fn();
    openBoth(onClose, vi.fn());
    expect(document.activeElement?.id).toBe('cfirst');
    act(() => $('clast').focus());
    expect(onClose).not.toHaveBeenCalled();
  });
  it('still closes when focus goes somewhere else entirely', () => {
    const onClose = vi.fn();
    openBoth(onClose, vi.fn());
    act(() => $('pfirst').focus());
    expect(onClose).not.toHaveBeenCalled();
    act(() => opener.focus());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('Escape closes only the child first', () => {
    const onClose = vi.fn();
    const onChildClose = vi.fn();
    openBoth(onClose, onChildClose);
    key(document.activeElement!, 'Escape');
    expect(onChildClose).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    act(() => root.render(page(false, onClose, onChildClose)));
    key(document.activeElement!, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('focus goes back into the parent when the child closes, and the parent stays open', () => {
    const onClose = vi.fn();
    openBoth(onClose, vi.fn());
    act(() => root.render(page(false, onClose, vi.fn())));
    expect(document.activeElement?.id).toBe('pfirst');
    expect(onClose).not.toHaveBeenCalled();
  });
});
