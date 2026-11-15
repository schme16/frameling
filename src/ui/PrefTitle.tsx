// The title of a Preferences page or group with its own on/off switch hard right, opposite the heading. For anything that
// is a whole feature turned on or off (Streaming, Audience features, Snapping), so every one looks and behaves the same:
// the heading and switch on one line, the explaining line under both, and a line that says plainly what the current state
// means. The page below is never greyed out in silence: the status line always says what off does.
import { useId, type ReactNode } from 'react';
import './prefTitle.css';

type Props = {
  /** A page title is an h3, a group inside a page is an h4. */
  level?: 'page' | 'group';
  title: ReactNode;
  /** The switch's own name for screen readers, such as "Streaming tools on or off". The heading is beside it, not joined to it. */
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
  /** What this is, under the heading and switch. Pass a paragraph (`<p className="ui-pref-intro">`). */
  about?: ReactNode;
  /** What on or off means right now. Always say it, so an off switch is never a silent grey page. */
  status?: ReactNode;
  testId?: string;
  switchTestId?: string;
  statusTestId?: string;
};

export function PrefTitle({ level = 'page', title, label, on, onChange, about, status, testId, switchTestId, statusTestId }: Props) {
  const statusId = useId();
  const Heading = level === 'page' ? 'h3' : 'h4';
  return (
    <div className={`ui-pref-title is-${level}`} data-testid={testId}>
      <div className="ui-pref-title-head">
        <Heading className="ui-pref-title-text">{title}</Heading>
        <div className="ui-pref-title-switch">
          <span className="ui-pref-title-state" aria-hidden="true">
            {on ? 'On' : 'Off'}
          </span>
          <button type="button" role="switch" aria-checked={on} aria-label={label} aria-describedby={status ? statusId : undefined} data-testid={switchTestId} className={`ui-switch${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
            <span className="ui-switch-knob" />
          </button>
        </div>
      </div>
      {about}
      {status && (
        <p id={statusId} className="ui-pref-title-status" data-testid={statusTestId} role="status">
          {status}
        </p>
      )}
    </div>
  );
}
