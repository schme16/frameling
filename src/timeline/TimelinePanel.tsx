import './timeline.css';
import { Header } from './Header';
import { TimelineBody } from './Grid';

/** The timeline panel: controls along the top, layers on the left, frames across. */
export function TimelinePanel() {
  return (
    <div className="tl-root">
      <Header />
      <TimelineBody />
    </div>
  );
}
