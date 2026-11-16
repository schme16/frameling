// A line under an export option. The ones that say what a choice means fold behind the dialog's help icon when the
// explanations are tucked away; the ones that say what this export will do (a count, a warning, what is left out) stay.
import type { ReactNode } from 'react';
import { ExplainScope, Explainer, ScopeIcon, useShowExplanations } from '../ui/explain/ExplainIcon';

export function ExNote({ children, className, stays }: { children: ReactNode; className?: string; stays?: boolean }) {
  const cls = `ex-note${className ? ' ' + className : ''}`;
  return stays ? <p className={cls}>{children}</p> : <Explainer className={cls}>{children}</Explainer>;
}

export const EXPORT_SCOPE = 'dialog:export';

/** Round the export dialog's body: the notes inside know which icon carries their words. */
export function ExportExplainScope({ children }: { children: ReactNode }) {
  return (
    <ExplainScope scope={EXPORT_SCOPE} help="exporting">
      {children}
    </ExplainScope>
  );
}

/** The dialog's help icon, beside its title like every panel's, shown once the notes are tucked away and there are some. */
export function ExAbout() {
  const show = useShowExplanations();
  if (show) return null;
  return <ScopeIcon scope={EXPORT_SCOPE} title="About these options" help="exporting" />;
}
