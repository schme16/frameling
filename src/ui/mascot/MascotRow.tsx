import { Row, Segmented } from '../PrefsModal';
import { setPrefs, usePrefs } from '../prefs';
import { getMascot, hasChoice, mascots } from './mascots';

/** Who shows you round. Only appears once there is more than one to pick from: a choice of one looks like a broken setting. */
export function MascotRow() {
  const mascot = usePrefs((x) => x.mascot);
  if (!hasChoice()) return null;
  return (
    <Row label="Your guide" hint="Who shows you round and cheers you on. Switch whenever you like; nothing else changes.">
      <Segmented<string> label="Your guide" value={getMascot(mascot).id} onChange={(id) => setPrefs({ mascot: id })} options={mascots().map((m) => ({ id: m.id, label: m.name }))} />
    </Row>
  );
}
