import { useStreamSafe } from '../core/streamSafe';
import { Icon } from '../ui/icons';
import { setStreamSafeMode } from './commands';
import './streamsafe.css';

/** A small pill in the top bar while Stream-safe is on, so you can never not know. Pressing it turns the mode off. */
export function StreamSafeBadge() {
  const on = useStreamSafe();
  if (!on) return null;
  return (
    <button type="button" className="ss-badge" data-testid="streamSafe.badge" data-help="stream-safe" data-tip="Stream-safe is on" data-tip-desc="File paths, your name and keys show as stand-ins. Press to turn it off." onClick={() => setStreamSafeMode(false)}>
      <Icon name="eye-off" size={14} />
      Stream-safe
    </button>
  );
}
