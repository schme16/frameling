import { createRoot } from 'react-dom/client';
import { Celebration } from './Celebration';
import { QuestBar } from './QuestBar';
import { Spotlight } from './Spotlight';
import './quests.css';

function QuestLayer() {
  return (
    <div className="qr">
      <Spotlight />
      <QuestBar />
      <Celebration />
    </div>
  );
}

let mounted = false;

/** Puts the guide bar, the ring and the cheers on the page, outside the app's own tree (same way the dialogs do it). */
export function mountQuestLayer(): void {
  if (mounted || typeof document === 'undefined') return;
  const go = () => {
    if (mounted) return;
    mounted = true;
    const host = document.createElement('div');
    host.id = 'quests-root';
    document.body.appendChild(host);
    createRoot(host).render(<QuestLayer />);
  };
  if (document.body) go();
  else document.addEventListener('DOMContentLoaded', go, { once: true });
}
