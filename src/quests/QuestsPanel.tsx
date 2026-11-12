import { useFeaturesVersion } from '../features/use';
import { line } from '../ui/mascot/lines';
import { Icon } from '../ui/icons';
import { QuillSays } from '../ui/mascot';
import { groupQuests } from './groups';
import { Medal } from './Medal';
import { allQuests, getQuest, isUnlocked, questProgress } from './registry';
import { engine, playQuest, resumeQuest } from './runtime';

/** The Quests panel: every quest with its badge, whether it's open yet, and where you were up to. */
export function QuestsPanel() {
  const p = questProgress.use((x) => x);
  // Lessons of a feature that is off are left out.
  useFeaturesVersion();
  const list = allQuests();
  const earned = list.filter((q) => q.badge && p.badges.includes(q.badge.id)).length;
  const total = list.filter((q) => q.badge).length;
  const allDone = list.length > 0 && list.every((q) => p.completed.includes(q.id));
  return (
    <div className="ui-panel qp" data-quest="panel">
      <div className="qp-head">
        <strong>Quests</strong>
        <span className="qp-count">
          {earned} of {total} badges
        </span>
      </div>
      {p.active || p.paused ? (
        <p className="qp-lead">Short lessons that teach by doing. Each one earns a badge.</p>
      ) : (
        <QuillSays anim={allDone ? 'cheer' : 'idle'} then={allDone ? 'idle' : undefined} size={48} className="qp-quill">
          <p className="qp-lead">{line(allDone ? 'quests.panel.allDone' : 'quests.panel.intro')}</p>
        </QuillSays>
      )}
      {groupQuests(list, p).map((g) => (
        <section key={g.id} className="qp-group" aria-labelledby={`qp-group-${g.id}`}>
          <h3 className="qp-group-head" id={`qp-group-${g.id}`}>
            <span>{g.title}</span>
            <span className="qp-group-count" aria-hidden="true">
              {g.done}/{g.quests.length}
            </span>
            <span className="ui-sr-only">
              , {g.done} of {g.quests.length} done
            </span>
          </h3>
          <ul className="qp-list">
            {g.quests.map((q) => {
              const done = p.completed.includes(q.id);
              const playing = p.active === q.id;
              const paused = p.paused?.id === q.id;
              const open = isUnlocked(q, p);
              const needs = (q.requires ?? []).filter((id) => !p.completed.includes(id)).map((id) => getQuest(id)?.title ?? id);
              const stepNo = playing ? p.step : paused ? p.paused!.step : 0;
              return (
                <li key={q.id} className={`qp-card${done ? ' is-done' : ''}${!open && !done ? ' is-locked' : ''}`}>
                  {q.badge ? <Medal badge={q.badge} earned={p.badges.includes(q.badge.id)} size={42} /> : <Icon name={q.icon} size={22} />}
                  <div className="qp-body">
                    <strong>{q.title}</strong>
                    <p>{q.summary}</p>
                    <small>
                      {playing
                        ? `Step ${stepNo + 1} of ${q.steps.length}, in progress`
                        : paused
                          ? `Put down at step ${stepNo + 1} of ${q.steps.length}`
                          : !open && !done
                            ? `Locked. Do "${needs[0]}" first.`
                            : done
                              ? `Done. Badge: ${q.badge?.name ?? 'none'}`
                              : `About ${q.minutes} minute${q.minutes === 1 ? '' : 's'}, ${q.steps.length} steps`}
                    </small>
                    <div className="qp-actions">
                      {paused && (
                        <button type="button" className="ui-btn ui-btn-small ui-btn-primary" onClick={resumeQuest}>
                          Continue
                        </button>
                      )}
                      {!playing && !paused && (
                        <button
                          type="button"
                          className={`ui-btn ui-btn-small${open && !done ? ' ui-btn-primary' : ''}`}
                          onClick={() => playQuest(q.id)}
                        >
                          {done ? 'Do it again' : open ? 'Start' : 'Try it anyway'}
                        </button>
                      )}
                      {paused && (
                        <button type="button" className="ui-btn ui-btn-small ui-btn-quiet" onClick={() => playQuest(q.id)}>
                          Start over
                        </button>
                      )}
                      {playing && (
                        <button type="button" className="ui-btn ui-btn-small" onClick={() => engine.stop()}>
                          Put it down
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {(p.completed.length > 0 || p.badges.length > 0) && (
        <button
          type="button"
          className="ui-btn ui-btn-small ui-btn-quiet qp-reset"
          onClick={() => window.confirm('Forget your badges and start the quests from the beginning?') && engine.resetAll()}
        >
          Start the quests over
        </button>
      )}
    </div>
  );
}
