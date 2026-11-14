// "Your ways out" in the Export window: the export choices this drawing keeps under a name, one click to bring one back.
import { useState } from 'react';
import { useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { MAX_WAYS, plainSettings, sameSettings, wayNamed } from './saved';
import { removeWay, saveWay } from './savedOps';
import type { SavedExport } from '../core/format';
import type { ExportSettings } from './types';
import './savedWays.css';

export function SavedWays({ settings, onPick }: { settings: ExportSettings; onPick: (way: SavedExport) => void }) {
  const exports = useStore((s) => s.doc.exports);
  const ways = exports?.ways ?? [];
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const now = plainSettings(settings);
  const same = wayNamed(exports, name);
  const full = ways.length >= MAX_WAYS && !same;

  const keep = () => {
    if (!name.trim() || full) return;
    if (saveWay(name, settings)) {
      setNaming(false);
      setName('');
    }
  };

  return (
    <fieldset className="ex-ways" data-testid="export.ways">
      <legend>Your ways out</legend>
      {ways.length > 0 && (
        <div className="ex-seg">
          {ways.map((w) => {
            const on = sameSettings(w.settings, now);
            return (
              <span key={w.id} className={`ex-way${on ? ' ex-way-on' : ''}`}>
                <button type="button" className={on ? 'ex-on' : ''} aria-pressed={on} title="Bring these choices back" onClick={() => onPick(w)}>
                  {w.name}
                </button>
                <button type="button" className="ex-way-x" aria-label={`Forget ${w.name}`} title={`Forget ${w.name}`} onClick={() => removeWay(w.id)}>
                  <Icon name="close" size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      {naming ? (
        <div className="ex-way-name">
          <input
            type="text"
            aria-label="Name for these choices"
            placeholder="The sprite sheet, the web video..."
            maxLength={40}
            value={name}
            data-autofocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') keep();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setNaming(false);
              }
            }}
          />
          <button type="button" className="ex-link" disabled={!name.trim() || full} onClick={keep}>
            {same ? 'Update it' : 'Save'}
          </button>
          <button type="button" className="ex-link" onClick={() => setNaming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="ex-link" data-testid="export.saveWay" onClick={() => setNaming(true)}>
          Save these choices as...
        </button>
      )}
      <p className="ex-note">{full ? `A drawing keeps ${MAX_WAYS} ways. Forget one to make room.` : ways.length ? 'They stay in this drawing. Ctrl+Shift+E repeats the last one, and Export all saved ways (in the command palette) sends every one out.' : 'Keep a set of choices with this drawing, so you can send it out the same way again: a sprite sheet for the game, a GIF for the web page.'}</p>
    </fieldset>
  );
}
