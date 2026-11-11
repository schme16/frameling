// The "where is it going" picker for sprite sheets: game engines first, then the other homes for a sheet.
import { Icon } from '../ui/icons';
import { ENGINES, type EngineId } from './types';

// Small plain pictures, not the engines' own logos.
const ART: Record<EngineId, React.ReactNode> = {
  godot: (
    <>
      <rect x="2.5" y="7" width="19" height="11" rx="5" />
      <path d="M7 11v3M5.5 12.5h3" />
      <circle cx="15.5" cy="11.5" r="0.6" fill="currentColor" />
      <circle cx="17.5" cy="13.5" r="0.6" fill="currentColor" />
    </>
  ),
  unity: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
  phaser: <path d="M13 2L5 13h6l-1 9 8-11h-6z" />,
  pixi: (
    <>
      <path d="M12 3.5l4.2 7H7.8z" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <circle cx="17" cy="17" r="3.5" />
    </>
  ),
  css: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 8.5h18M6 6.3h.01M8.5 6.3h.01" />
    </>
  ),
  json: <path d="M8 4c-2 0-2.5 1-2.5 3v2c0 1.5-.8 2.5-2 3 1.2.5 2 1.5 2 3v2c0 2 .5 3 2.5 3M16 4c2 0 2.5 1 2.5 3v2c0 1.5.8 2.5 2 3-1.2.5-2 1.5-2 3v2c0 2-.5 3-2.5 3" />,
  none: null,
};

export function EngineIcon({ id, size = 18 }: { id: EngineId; size?: number }) {
  if (id === 'none') return <Icon name="image" size={size} />;
  return (
    <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ART[id]}
    </svg>
  );
}

export function EnginePicker({ value, onPick }: { value: EngineId; onPick: (id: EngineId) => void }) {
  const games = ENGINES.filter((e) => e.game);
  const others = ENGINES.filter((e) => !e.game);
  const item = (e: (typeof ENGINES)[number]) => (
    <button key={e.id} type="button" role="radio" aria-checked={value === e.id} className={`ex-engine${value === e.id ? ' ex-chosen' : ''}`} title={e.files} onClick={() => onPick(e.id)}>
      <EngineIcon id={e.id} size={20} />
      <span>{e.title}</span>
    </button>
  );
  return (
    <div className={"ex-engines ex-engines-a"} role="radiogroup" aria-label="Where the sprite sheet is going">
      <p className="ex-sub">For a game engine</p>
      <div className="ex-engine-row ex-engine-games" role="group" aria-label="Game engines">
        {games.map(item)}
      </div>
      <p className="ex-sub">Something else</p>
      <div className="ex-engine-row" role="group" aria-label="Something else">
        {others.map(item)}
      </div>
    </div>
  );
}
