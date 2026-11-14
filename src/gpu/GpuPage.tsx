// Preferences, Performance: what Frameling found out about how it draws (the card, the way it talks to it, whether that
// is good), and the settings people expect in a drawing app. The words are made in describe.ts; the numbers it shows are
// what the system reports, never a measured speed.
import { useEffect, useState } from 'react';
import { Explainer } from '../ui/explain/ExplainIcon';
import { Row, Segmented, Switch } from '../ui/PrefsModal';
import { toast } from '../ui/toast';
import { desktop } from '../io/desktop';
import { store } from '../core/store';
import { readGpu, restartNeeded } from './describe';
import { restartFrameling } from '../io/restart';
import { copyGpuReport } from './copy';
import { canReadGpu, refreshReport, reportStore } from './report';
import { CACHE_CHOICES, FPS_CAPS, capEffect, isDefaultPerf, keptBytes, perfStore, resetPerf, setPerf, type ScrubQuality } from './settings';
import './gpu.css';

export function GpuPage({ onGeneral }: { onGeneral: () => void }) {
  const report = reportStore.use((r) => r);
  const perf = perfStore.use((p) => p);
  const [busy, setBusy] = useState(false);
  const web = !canReadGpu();
  useEffect(() => void refreshReport(), []);

  const reading = report ? readGpu(report, keptBytes()) : null;
  const hardwareOn = report ? !(report.off.file || report.off.env) : true;
  const envLocked = !!report?.off.env;
  const needsRestart = report ? restartNeeded(report) : false;
  const fps = store().get().doc.fps;

  const setHardware = async (on: boolean) => {
    const api = desktop()?.gpu;
    if (!api || busy) return;
    setBusy(true);
    const r = await api.setHardware(on);
    setBusy(false);
    if ('error' in r) toast(r.error, { kind: 'error' });
    await refreshReport();
  };

  const putBack = async () => {
    resetPerf();
    if (report?.off.file) await setHardware(true);
  };

  return (
    <div className="gp-page">
      <h3>Performance</h3>
      <Explainer className="ui-pref-intro">How Frameling draws, and the settings that matter when it feels slow. The top part says what it found on this computer; the rest is yours to change.</Explainer>

      <h4>What Frameling found</h4>
      {web && <p className="gp-note">This is the web version, so your browser decides how to draw and it does not tell Frameling which card it uses. The settings below still work.</p>}
      {reading && (
        <div className={`gp-found is-${reading.mode}`} data-testid="gpu-found">
          <p className="gp-headline">{reading.headline}</p>
          {reading.advice.length > 0 && (
            <ul className="gp-advice">
              {reading.advice.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <dl className="gp-facts">
            <dt>Card in use</dt>
            <dd>{reading.card}</dd>
            <dt>Driver</dt>
            <dd>{reading.driver}</dd>
            <dt>Drawing path</dt>
            <dd>{reading.path}</dd>
            <dt>Card memory</dt>
            <dd>{reading.cardMemory}</dd>
            <dt>Memory held</dt>
            <dd>{reading.holding.replace(/^Frameling is holding /, '').replace(/\.$/, '')}</dd>
          </dl>
          <div className="gp-buttons">
            <button type="button" className="ui-btn ui-btn-small" onClick={() => void copyGpuReport()}>
              Copy for a bug report
            </button>
            <button type="button" className="ui-btn ui-btn-small" onClick={() => void refreshReport()}>
              Check again
            </button>
          </div>
        </div>
      )}

      <h4>What you can change</h4>
      {!web && (
        <>
          <Row label="Hardware drawing" hint="Lets your graphics card do the drawing (the GPU, or hardware acceleration). It is much faster on most computers. Turn it off if the picture glitches, flickers or the window will not open. Takes a restart.">
            <div className="gp-control">
              <span className="gp-restart">Needs a restart</span>
              <Switch label="Hardware drawing" on={hardwareOn} onChange={(on) => void setHardware(on)} />
            </div>
          </Row>
          {envLocked && <p className="gp-note">FRAMELING_GPU=off is set where Frameling starts, so it draws in software whatever this switch says. Remove it to use the card.</p>}
          {needsRestart && !envLocked && (
            <div className="gp-pending" role="status">
              <span>{hardwareOn ? 'Hardware drawing is on, from the next start.' : 'Software drawing, from the next start.'} Restart Frameling to use it. It asks about unsaved work first.</span>
              <button type="button" className="ui-btn ui-btn-small ui-btn-primary" onClick={() => void restartFrameling()}>
                Restart now
              </button>
            </div>
          )}
          {report && (
            <p className="gp-note">
              If Frameling ever will not open with hardware drawing on, make an empty file called <b>gpu-off</b> in <code>{report.off.path.replace(/[\\/]gpu-off$/, '')}</code>, or start it with <code>FRAMELING_GPU=off</code>. Either way it starts in software, and you can turn the card back on here.
            </p>
          )}
        </>
      )}
      <Row label="Drawings kept ready" hint="Memory for keeping each layer's picture ready, so stepping, scrubbing and playing over a drawing you have already seen does not redraw it. A bigger amount keeps more of a long or layered animation ready; it costs that much more memory, and nothing else.">
        <div className="gp-control">
          <Segmented<string> label="Drawings kept ready" value={String(perf.cacheMb)} onChange={(v) => setPerf({ cacheMb: Number(v) })} options={CACHE_CHOICES.map((c) => ({ id: String(c.mb), label: c.label }))} />
          <span className="ui-pref-value">{perf.cacheMb} MB</span>
        </div>
      </Row>
      <Row label="Scrubbing the timeline" hint="While you drag along the timeline: Full quality shows everything, onion skins included. Quick leaves the onion skins, ghosts and light table out until you let go, so there is less to draw each step.">
        <Segmented<ScrubQuality> label="Scrubbing the timeline" value={perf.scrub} onChange={(scrub) => setPerf({ scrub })} options={[{ id: 'full', label: 'Full quality' }, { id: 'quick', label: 'Quick' }]} />
      </Row>
      <Row label="Playback frame rate limit" hint="The most frames a second playback shows. On a computer that cannot keep up, a lower limit gives each frame more time to draw, so playback drops frames and stays in time instead of running slow. The animation's own frame rate is untouched.">
        <div className="gp-control">
          <Segmented<string> label="Playback frame rate limit" value={String(perf.fpsCap)} onChange={(v) => setPerf({ fpsCap: Number(v) })} options={FPS_CAPS.map((c) => ({ id: String(c), label: c ? String(c) : 'No limit' }))} />
          {perf.fpsCap > 0 && (
            <span className="ui-pref-value">
              {perf.fpsCap} here {capEffect(perf.fpsCap, fps)}
            </span>
          )}
        </div>
      </Row>
      <p className="gp-note gp-pointer">
        Undo steps live in <button type="button" className="gp-link" onClick={onGeneral}>General</button>. Each step keeps a copy of what changed, so a long history is memory too.
      </p>
      <div className="gp-reset">
        <button type="button" className="ui-btn" disabled={isDefaultPerf(perf) && hardwareOn} onClick={() => void putBack()}>
          Put these back to how they were
        </button>
        {report && <span className="gp-note">Kept drawings, scrubbing, the limit and hardware drawing.</span>}
      </div>
    </div>
  );
}
