// The help icon the explainers hide behind. Pointing at it or tabbing to it shows the words in a tooltip that ends with
// a link into the help topic; pressing it (click, Enter or Space) pins the tooltip open so it can be read and the link
// pressed. It is a real button with a name and the words as its description, so a screen reader reads them on focus.
import { createContext, useContext, useEffect, useId, type ReactNode } from 'react';
import { usePrefs } from '../prefs';
import { Icon } from '../icons';
import { addWords, useWordsIn, wordsOf } from '../explainModel';

/** Which panel or section the words written below belong to, and the help topic its icon links to. */
export interface ExplainScopeValue {
  scope: string;
  help?: string;
}
const ScopeCtx = createContext<ExplainScopeValue | null>(null);

/** Wraps a panel or a section so its explainers know where to go. */
export function ExplainScope({ scope, help, children }: { scope: string; help?: string; children: ReactNode }) {
  return <ScopeCtx.Provider value={{ scope, help }}>{children}</ScopeCtx.Provider>;
}
export const useExplainScope = () => useContext(ScopeCtx);

/** True when the explanations sit on show in the panels; false when they live behind the icons. */
export const useShowExplanations = (): boolean => usePrefs((p) => p.showExplanations);

/** Registers some words with the scope around the caller, for as long as it is on the page. */
export function useExplainWords(words: string): void {
  const sc = useExplainScope();
  const token = useId();
  const scope = sc?.scope;
  useEffect(() => (scope ? addWords(scope, token, words) : undefined), [scope, token, words]);
}

interface IconProps {
  /** What the tooltip is called ("Smoothing", "Artboards"). */
  title: string;
  /** The words. */
  words: string;
  /** The help topic the tooltip's link opens. Defaults to the one the surrounding panel gave. */
  help?: string;
  size?: number;
  className?: string;
}

/** A single icon with its words. */
export function ExplainIcon({ title, words, help, size = 14, className }: IconProps) {
  const sc = useExplainScope();
  const topic = help ?? sc?.help;
  return (
    <button
      type="button"
      className={`ui-icon-btn ui-explain${className ? ' ' + className : ''}`}
      data-explain=""
      data-tip={title}
      data-tip-desc={words}
      data-help={topic}
      aria-label={`About ${title}`}
      aria-description={words}
    >
      <Icon name="help" size={size} />
    </button>
  );
}

/** The icon for a whole scope: it shows when something was written in it, and says all of it. */
export function ScopeIcon({ scope, title, blurb, help, size, className }: { scope: string; title: string; blurb?: string; help?: string; size?: number; className?: string }) {
  const words = useWordsIn(scope);
  const all = [blurb ?? '', words].filter(Boolean).join(' ');
  if (!words) return null;
  return <ExplainIcon title={title} words={all} help={help} size={size} className={className} />;
}

/** One explainer: the words on show while the explanations are on, otherwise in the nearest icon. */
export function Explainer({ children, className = 'cv-tip' }: { children: ReactNode; className?: string }) {
  const show = useShowExplanations();
  const sc = useExplainScope();
  const words = wordsOf(children);
  useExplainWords(words);
  if (show) return <p className={className}>{children}</p>;
  // With no panel or section round it to carry the words, the icon sits where the line was: the words are never lost.
  return sc ? null : <ExplainIcon title="What this is" words={words} help={undefined} />;
}

/** The help icon in a panel's title bar: its one-line blurb, plus every explainer written inside the panel. */
export function PanelHelp({ id, title, help, blurb, size = 14, className }: { id: string; title: string; help?: string; blurb?: string; size?: number; className?: string }) {
  const words = useWordsIn(id);
  return <ExplainIcon title={title} words={[blurb ?? '', words].filter(Boolean).join(' ') || `Help on ${title}.`} help={help ?? 'panels'} size={size} className={className} />;
}

/**
 * A panel's body: the explainers inside it know to go to the panel's icon. A panel with a title bar of its own passes
 * `bar` (the right side does); one without (a floating window, the bottom dock) gets the icon in its corner, and only
 * when it has words to carry.
 */
export function PanelScope({ id, title, help, bar, children }: { id: string; title: string; help?: string; bar?: boolean; children: ReactNode }) {
  return (
    <ExplainScope scope={id} help={help ?? 'panels'}>
      {!bar && <ScopeIcon scope={id} title={title} help={help ?? 'panels'} className="ui-panel-explain" />}
      {children}
    </ExplainScope>
  );
}

/** A titled section inside a panel: its explainers go to an icon on its heading, and the icon only shows once they are tucked away. */
export function SectionScope({ title, children }: { title: string; children: (icon: ReactNode) => ReactNode }) {
  const id = useId();
  const parent = useExplainScope();
  const show = useShowExplanations();
  const scope = `section:${id}`;
  return (
    <ExplainScope scope={scope} help={parent?.help}>
      {children(show ? null : <ScopeIcon scope={scope} title={title} help={parent?.help} size={13} />)}
    </ExplainScope>
  );
}
