// @vitest-environment jsdom
// The explanations: on show for a new person, tucked behind a help icon for someone who was here first, and never lost.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { addWords, joinWords, showExplanationsDefault, tipWords, wordsIn, wordsOf } from '../../src/ui/explainModel';
import { migratePrefs, setPrefs } from '../../src/ui/prefs';
import { PanelHelp, PanelScope, SectionScope } from '../../src/ui/explain/ExplainIcon';
import { Slider, Tip, Toggle } from '../../src/canvas/controls';
import { Row } from '../../src/ui/PrefsModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the words of a piece of JSX', () => {
  it('keeps text and numbers, drops the tags, tidies the spaces', () => {
    expect(wordsOf(<>Hold <b>Shift</b>  to{' '}keep it even. {3} sides.</>)).toBe('Hold Shift to keep it even. 3 sides.');
    expect(wordsOf(null)).toBe('');
    expect(wordsOf(['One. ', false, 'Two.'])).toBe('One. Two.');
  });
  it('joins several explainers into one tooltip', () => {
    expect(joinWords(['A.', '', ' B. '])).toBe('A. B.');
  });
});

describe('words carried to a scope', () => {
  it('adds, replaces by token, and takes out again', () => {
    const off1 = addWords('t:one', 'a', 'First.');
    addWords('t:one', 'b', 'Second.');
    expect(wordsIn('t:one')).toBe('First. Second.');
    addWords('t:one', 'a', 'First again.');
    expect(wordsIn('t:one')).toBe('Second. First again.');
    off1();
    expect(wordsIn('t:one')).toBe('Second.');
    expect(wordsIn('t:nothing')).toBe('');
    expect(wordsIn(null)).toBe('');
  });
  it('puts the blurb first in a panel icon, then what was written inside', () => {
    addWords('t:two', 'x', 'Inside.');
    expect(tipWords('Blurb.', 't:two')).toBe('Blurb. Inside.');
    expect(tipWords(undefined, 't:two')).toBe('Inside.');
  });
});

describe('who starts with the explanations on', () => {
  it('is a new person, and not someone who was already here', () => {
    expect(showExplanationsDefault({})).toBe(true);
    expect(showExplanationsDefault({ onboarded: false })).toBe(true);
    expect(showExplanationsDefault({ onboarded: true })).toBe(false);
  });
  it('keeps what was chosen, either way', () => {
    expect(showExplanationsDefault({ onboarded: true, showExplanations: true })).toBe(true);
    expect(showExplanationsDefault({ onboarded: false, showExplanations: false })).toBe(false);
  });
  it('reads into the preferences the same way', () => {
    expect(migratePrefs({}).showExplanations).toBe(true);
    expect(migratePrefs({ onboarded: true }).showExplanations).toBe(false);
    expect(migratePrefs({ onboarded: true, showExplanations: true }).showExplanations).toBe(true);
    expect(migratePrefs({ showExplanations: 'yes' }).showExplanations).toBe(true);
  });
});

describe('the explanations in a panel', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  const draw = (ui: ReactNode) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(ui));
    return host;
  };
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    setPrefs({ showExplanations: true });
  });

  const panel = (
    <PanelScope id="t:panel" title="Test panel" help="panels" bar>
      <PanelHelp id="t:panel" title="Test panel" help="panels" blurb="What it is for." />
      <Tip>Drag to move it.</Tip>
      <Tip stays>The camera layer is hidden.</Tip>
      <Slider label="Smoothing" value={20} min={0} max={100} onChange={() => {}} hint="Higher evens out a shaky hand." />
      <Toggle label="Pressure" checked={false} onChange={() => {}} hint="With a pen, pressing harder draws thicker." />
    </PanelScope>
  );

  it('keeps every line on show while the explanations are on', () => {
    setPrefs({ showExplanations: true });
    const h = draw(panel);
    expect(h.textContent).toContain('Drag to move it.');
    expect(h.textContent).toContain('Higher evens out a shaky hand.');
    expect(h.textContent).toContain('With a pen, pressing harder draws thicker.');
    // Only the panel's own icon: nothing else has an icon while the words are in front of you.
    expect(h.querySelectorAll('.ui-explain')).toHaveLength(1);
  });

  it('moves the explainers behind the icons when they are tucked away, and keeps the warning', () => {
    setPrefs({ showExplanations: false });
    const h = draw(panel);
    expect(h.textContent).not.toContain('Drag to move it.');
    expect(h.textContent).not.toContain('Higher evens out');
    expect(h.textContent).toContain('The camera layer is hidden.');
    const icons = [...h.querySelectorAll<HTMLButtonElement>('.ui-explain')];
    expect(icons).toHaveLength(3);
    const panelIcon = icons[0];
    // The panel's icon says its blurb and the line that was written inside it, and links into the help topic.
    expect(panelIcon.getAttribute('data-tip-desc')).toBe('What it is for. Drag to move it.');
    expect(panelIcon.getAttribute('data-help')).toBe('panels');
    // The control icons carry their own line and borrow the panel's topic.
    const slider = icons.find((i) => i.getAttribute('data-tip') === 'Smoothing')!;
    expect(slider.getAttribute('data-tip-desc')).toBe('Higher evens out a shaky hand.');
    expect(slider.getAttribute('data-help')).toBe('panels');
  });

  it('makes each icon a real button with a name, and the words as its description, for a screen reader', () => {
    setPrefs({ showExplanations: false });
    const h = draw(panel);
    for (const b of h.querySelectorAll<HTMLButtonElement>('.ui-explain')) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.type).toBe('button');
      expect(b.tabIndex).toBe(0);
      expect(b.getAttribute('aria-label')).toMatch(/^About /);
      expect(b.getAttribute('aria-description')).toBe(b.getAttribute('data-tip-desc'));
      expect(b.hasAttribute('data-explain')).toBe(true);
    }
  });

  it('puts a section heading icon on a section with explainers, and none on one without', () => {
    setPrefs({ showExplanations: false });
    const h = draw(
      <PanelScope id="t:p2" title="Panel" bar>
        <SectionScope title="Variations">{(icon) => <h3>Variations{icon}<Tip>A variation follows this artboard.</Tip></h3>}</SectionScope>
        <SectionScope title="Plain">{(icon) => <h3>Plain{icon}</h3>}</SectionScope>
      </PanelScope>,
    );
    const icons = h.querySelectorAll('.ui-explain');
    expect(icons).toHaveLength(1);
    expect(icons[0].getAttribute('data-tip')).toBe('Variations');
    expect(icons[0].getAttribute('data-tip-desc')).toBe('A variation follows this artboard.');
  });

  it('never loses an explainer that has no panel round it: the icon takes its place', () => {
    setPrefs({ showExplanations: false });
    const h = draw(<Tip>Loose words.</Tip>);
    const icon = h.querySelector('.ui-explain');
    expect(icon?.getAttribute('data-tip-desc')).toBe('Loose words.');
  });

  it('folds a Preferences row hint the same way', () => {
    setPrefs({ showExplanations: false });
    const h = draw(
      <Row label="Sounds" hint="Soft little sounds.">
        <span />
      </Row>,
    );
    expect(h.textContent).not.toContain('Soft little sounds.');
    expect(h.querySelector('.ui-explain')?.getAttribute('data-tip-desc')).toBe('Soft little sounds.');
    act(() => setPrefs({ showExplanations: true }));
    expect(h.textContent).toContain('Soft little sounds.');
    expect(h.querySelector('.ui-explain')).toBeNull();
  });
});
