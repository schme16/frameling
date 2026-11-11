import { comboParts } from './keys';

/** A shortcut drawn as little key caps: Ctrl, Shift, Z. */
export function Keys({ shortcut, className = '' }: { shortcut: string; className?: string }) {
  if (!shortcut) return null;
  return (
    <span className={`ui-keys ${className}`}>
      <span className="ui-sr-only">{comboParts(shortcut).join(' ')}</span>
      {comboParts(shortcut).map((p, i) => (
        <kbd key={i} aria-hidden="true">
          {p}
        </kbd>
      ))}
    </span>
  );
}
