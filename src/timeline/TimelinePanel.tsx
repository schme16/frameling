import './timeline.css';
import './timeline-detail.css';
import { Header } from './Header';
import { TimelineBody } from './Grid';
import { isAnimated } from '../core/animation';
import { useStore } from '../core/store';
import { AddAnimationCard } from '../animation/AddAnimation';

/** The timeline panel: controls along the top, layers on the left, frames across. A drawing with no animation gets the Add animation card instead. */
export function TimelinePanel() {
  const animated = useStore((s) => isAnimated(s.doc));
  if (!animated) return <AddAnimationCard />;
  return (
    <div className="tl-root">
      <Header />
      <TimelineBody />
    </div>
  );
}
