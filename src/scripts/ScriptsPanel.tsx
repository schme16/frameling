// The Scripts panel: write JavaScript, press Run, see what happened. Errors land here with their line. A saved script is
// also a command, so the same panel is where it gets a key.
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { allCommands, getCommand } from '../core/registry';
import { store } from '../core/store';
import { notify } from '../io/notify';
import { download, pickUpload } from '../platform';
import { Section } from '../ui/panelFields';
import { usePrefs } from '../ui/prefs';
import { comboFromEvent, comboLabel, comboToString, conflictsFor, effectiveKeys, resetBindings, setBindings, shortcutLabel } from '../ui/keys';
import { commandIdOf, countsAsPasted, scriptAsPlugin, scriptAsPluginZip, type Script, type ScriptHome } from './model';
import { allowDrawingScripts, lastRun, newScript, openScript, runScript, setPanelOpener, stopRunning } from './control';
import { running } from './runner';
import { deleteScript, moveScript, openId, scripts, updateScript, findScript } from './state';
import { EXAMPLES, BLANK } from './examples';
import { dock } from '../ui/dock';
import { scriptsPlace } from './place';
import { toggleScriptsWindow } from './placeRun';
import { API, CANNOT, commandMatches, listCommands } from './reference';

/** The line numbers beside the box, one per line, scrolling with it. */
function Gutter({ lines, errorLine, scrollTop }: { lines: number; errorLine?: number; scrollTop: number }) {
  const nums = useMemo(() => Array.from({ length: lines }, (_, i) => i + 1), [lines]);
  return (
    <div className="scr-gutter" aria-hidden="true">
      <div style={{ transform: `translateY(${-scrollTop}px)` }}>
        {nums.map((n) => (
          <div key={n} className={n === errorLine ? 'is-error' : undefined}>
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyRow({ script }: { script: Script }) {
  const id = commandIdOf(script.id);
  const [listening, setListening] = useState(false);
  // Read again whenever the keymap changes, so the button shows the key as soon as it is set.
  usePrefs((p) => p.keymap);
  const cmd = getCommand(id);
  const keys = cmd ? effectiveKeys(cmd) : [];
  useEffect(() => {
    if (!listening) return;
    const on = (e: globalThis.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setListening(false);
      const combo = comboFromEvent(e);
      // Only the modifier so far: keep listening.
      if (!combo) return;
      const text = comboToString(combo);
      if (!cmd) return setListening(false);
      const clash = conflictsFor(text, id, allCommands());
      if (clash.length) notify(`${comboLabel(text)} already belongs to "${clash[0].label}". Pick another.`, 'warn');
      else setBindings(cmd, [text]);
      setListening(false);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [listening, cmd, id]);
  return (
    <div className="scr-row">
      <span className="scr-label">Key</span>
      <button type="button" className="ui-btn" data-testid="scripts.setKey" onClick={() => setListening(true)} aria-pressed={listening}>
        {listening ? 'Press the keys you want...' : keys.length ? shortcutLabel(cmd!) : 'Set a key'}
      </button>
      {keys.length > 0 && !listening && (
        <button type="button" className="ui-btn" onClick={() => cmd && (resetBindings(id), setBindings(cmd, []))}>
          Clear
        </button>
      )}
    </div>
  );
}

function Reference({ onInsert }: { onInsert: (text: string) => void }) {
  const [text, setText] = useState('');
  const [all, setAll] = useState<ReturnType<typeof listCommands>>([]);
  useEffect(() => setAll(listCommands()), []);
  const shown = commandMatches(all, text);
  return (
    <>
      <p className="scr-hint">Everything a script has is on the <code>frameling</code> object. Click a line to put it in your script.</p>
      <ul className="scr-api">
        {API.map((l) => (
          <li key={l.code}>
            <button type="button" className="scr-api-code" onClick={() => onInsert(l.code)}>
              {l.code}
            </button>
            <span>{l.says}</span>
          </li>
        ))}
      </ul>
      <label className="scr-field">
        <span>Find a command to press</span>
        <input type="search" value={text} placeholder="flip, duplicate, layer..." onChange={(e) => setText(e.target.value)} data-testid="scripts.findCommand" />
      </label>
      <ul className="scr-cmds" data-testid="scripts.commands">
        {shown.map((c) => (
          <li key={c.id}>
            <button type="button" className={`scr-cmd${c.enabled ? '' : ' is-off'}`} onClick={() => onInsert(`await frameling.app.run('${c.id}'); // ${c.label}`)} title={c.description}>
              <span>{c.label}</span>
              <code>{c.id}</code>
            </button>
          </li>
        ))}
        {!shown.length && <li className="scr-hint">Nothing matches.</li>}
      </ul>
      <p className="scr-hint">{all.length} commands can be pressed. Greyed ones need something first (a picked shape, say).</p>
      <details className="scr-cannot">
        <summary>What a script can't do</summary>
        <ul>
          {CANNOT.map((c) => (
            <li key={c.what}>
              <strong>{c.what}.</strong> {c.why}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function Output() {
  const run = lastRun.use((r) => r);
  const on = running.use((r) => r);
  if (!run) return <p className="scr-hint">Press <strong>Run</strong> and what happens shows up here.</p>;
  const o = run.outcome;
  return (
    <div className="scr-out" data-testid="scripts.output" aria-live="polite">
      {!o && <p className="scr-status">Running "{run.name}"...</p>}
      {o?.ok && (
        <p className="scr-status is-ok" data-testid="scripts.ok">
          Done in {o.ms < 1000 ? `${o.ms} ms` : `${(o.ms / 1000).toFixed(1)} s`}.{' '}
          {o.changes ? 'It is one step in Undo.' : 'It did not change the drawing.'}
        </p>
      )}
      {o && !o.ok && (
        <p className={`scr-status ${o.ended ? 'is-warn' : 'is-bad'}`} data-testid="scripts.error">
          {o.line ? <strong>Line {o.line}: </strong> : null}
          {o.message}
        </p>
      )}
      {run.printed.length > 0 && (
        <pre className="scr-printed" data-testid="scripts.printed">
          {run.printed.map((l, i) => (
            <span key={i} className={`is-${l.level}`}>
              {l.text}
              {'\n'}
            </span>
          ))}
        </pre>
      )}
      {on && <span className="scr-hint">Stop ends it and puts your drawing back.</span>}
    </div>
  );
}

function Editor({ script }: { script: Script }) {
  const [code, setCode] = useState(script.code);
  const [name, setName] = useState(script.name);
  const [scroll, setScroll] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ code: script.code, name: script.name, id: script.id });
  const run = lastRun.use((r) => r);
  const busy = running.use((r) => r);
  const docOn = scripts.use((s) => s.docOn);

  // A different script was picked (or this one changed elsewhere): show it.
  useEffect(() => {
    setCode(script.code);
    setName(script.name);
    latest.current = { code: script.code, name: script.name, id: script.id };
  }, [script.id, script.code, script.name]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const l = latest.current;
    const now = findScript(l.id);
    if (!now) return;
    if (now.code !== l.code) updateScript(l.id, { code: l.code });
  }, []);
  useEffect(() => flush, [flush]);

  const change = (next: string) => {
    setCode(next);
    latest.current.code = next;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 350);
  };

  // Something from outside came in: from now on this script is someone else's until it has been read and trusted.
  const outside = (text: string) => {
    if (countsAsPasted(text) && script.reviewed) updateScript(script.id, { reviewed: false });
  };

  const insert = (text: string) => {
    const el = area.current;
    if (!el) return change(`${code}\n${text}`);
    const a = el.selectionStart;
    const b = el.selectionEnd;
    const next = `${code.slice(0, a)}${text}${code.slice(b)}`;
    change(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = a + text.length;
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void go();
    } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      insert('  ');
    } else if (e.key === 'Escape') {
      area.current?.blur();
    }
  };

  const go = async () => {
    flush();
    const s = findScript(script.id);
    if (s) await runScript(s);
  };

  const errLine = run && run.id === script.id && run.outcome && !run.outcome.ok ? run.outcome.line : undefined;
  useEffect(() => {
    // Take the person to the line that went wrong.
    if (!errLine || !area.current) return;
    const el = area.current;
    const lines = el.value.split('\n');
    let at = 0;
    for (let i = 0; i < Math.min(errLine - 1, lines.length); i++) at += lines[i].length + 1;
    el.focus();
    el.setSelectionRange(at, at + (lines[errLine - 1]?.length ?? 0));
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
    el.scrollTop = Math.max(0, (errLine - 3) * lh);
  }, [errLine, run?.outcome]);

  const lineCount = code.split('\n').length;
  const cmd = getCommand(commandIdOf(script.id));
  const off = script.home === 'doc' && !docOn;

  return (
    <div className="scr-editor" data-testid="scripts.editor">
      {off && (
        <div className="scr-banner is-warn" data-testid="scripts.docOff">
          <p>
            <strong>This drawing's scripts are off.</strong> They came inside the file, so read them first. A script can change your drawing and press commands; it has no internet and can't reach your files.
          </p>
          <button type="button" className="ui-btn ui-btn-primary" onClick={allowDrawingScripts} data-testid="scripts.docOn">
            I have read them, turn them on
          </button>
        </div>
      )}
      {!off && !script.reviewed && (
        <div className="scr-banner" data-testid="scripts.unreviewed">
          <p>
            <strong>This came from somewhere else.</strong> Read it before you run it. The first run stops and asks, and you can trust it from there.
          </p>
        </div>
      )}
      <div className="scr-cols">
        <div className="scr-code-col">
          <div className="scr-box">
            <Gutter lines={lineCount} errorLine={errLine} scrollTop={scroll} />
            <textarea
              ref={area}
              className="scr-code"
              value={code}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              aria-label="Script"
              data-testid="scripts.code"
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => change(e.target.value)}
              onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
              onKeyDown={onKey}
              onBlur={flush}
              onPaste={(e) => outside(e.clipboardData.getData('text/plain'))}
              onDrop={(e) => outside(e.dataTransfer.getData('text/plain') || ' '.repeat(30))}
            />
          </div>
          <p className="scr-hint">Ctrl+Enter runs it. Tab indents; press Esc, then Tab, to leave the box.</p>
        </div>
        <div className="scr-side-col">
          <div className="scr-head">
            <label className="scr-field scr-name">
              <span>Name</span>
              <input
                type="text"
                value={name}
                maxLength={60}
                data-testid="scripts.name"
                onChange={(e) => {
                  setName(e.target.value);
                  latest.current.name = e.target.value;
                }}
                onBlur={() => name.trim() && name.trim() !== script.name && updateScript(script.id, { name })}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </label>
            <div className="scr-row">
              {busy ? (
                <button type="button" className="ui-btn ui-btn-danger" onClick={() => stopRunning()} data-testid="scripts.stop">
                  Stop
                </button>
              ) : (
                <button type="button" className="ui-btn ui-btn-primary" onClick={() => void go()} disabled={off} data-testid="scripts.run">
                  Run
                </button>
              )}
            </div>
          </div>
          <Output />
          {cmd && !off && (
            <Section title="Use it anywhere" open>
              <p className="scr-hint">
                "{script.name}" is a command now: find it in the command palette (Ctrl+K), or in <strong>Edit &gt; Scripts</strong>. Give it a key:
              </p>
              <KeyRow script={script} />
            </Section>
          )}
          <Section title="What you can use" open={false}>
            <Reference onInsert={insert} />
          </Section>
          <Section title="More" open={false}>
            <label className="scr-field">
              <span>Kept</span>
              <select
                value={script.home}
                data-testid="scripts.home"
                onChange={(e) => {
                  const r = moveScript(script.id, e.target.value as ScriptHome);
                  if (!r.ok) notify(r.why, 'warn');
                }}
              >
                <option value="app">With Frameling (every drawing)</option>
                <option value="doc">Inside this drawing (travels with the file)</option>
              </select>
            </label>
            {script.home === 'doc' && <p className="scr-hint">Whoever opens this drawing is asked before its scripts can run.</p>}
            <div className="scr-row">
              <button
                type="button"
                className="ui-btn"
                onClick={() => {
                  flush();
                  void import('../plugins/manager').then((m) => m.installFrom(scriptAsPluginZip(findScript(script.id) ?? script)));
                }}
                data-tip={`Same code, now a plugin called "${scriptAsPlugin(script).manifest.id}". You are asked about its powers first.`}
              >
                Make it a plugin
              </button>
              <button type="button" className="ui-btn" onClick={() => download(`${scriptAsPlugin(script).manifest.id}.js`, new TextEncoder().encode(code))}>
                Save as a .js file
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-danger"
                onClick={() => {
                  resetBindings(commandIdOf(script.id));
                  deleteScript(script.id);
                }}
                data-testid="scripts.delete"
              >
                Delete
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/** Own window, or back in the drawer: a long script wants a wide window, and one press undoes it. */
function PlaceButton() {
  const place = dock.use((d) => scriptsPlace(d.layout));
  const inWindow = place === 'window';
  return (
    <button
      type="button"
      className="ui-btn scr-place"
      onClick={() => toggleScriptsWindow()}
      data-testid="scripts.window"
      data-tip={inWindow ? 'Put Scripts back in the drawer along the bottom' : 'Give Scripts a wide window of its own, for a long script'}
    >
      {inWindow ? 'Back in the drawer' : 'Own window'}
    </button>
  );
}

function Picker() {
  const s = scripts.use((x) => x);
  const picked = openId.use((x) => x);
  const list = [...s.app, ...s.doc];
  const make = async (name: string, code: string, reviewed = true) => void (await newScript(name, code, reviewed));
  return (
    <div className="scr-pick">
      <div className="scr-row">
        <select value={picked ?? ''} aria-label="Script" data-testid="scripts.pick" onChange={(e) => openId.set(e.target.value || null)}>
          <option value="">{list.length ? 'Pick a script...' : 'No scripts yet'}</option>
          {list.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.home === 'doc' ? ' (in this drawing)' : ''}
            </option>
          ))}
        </select>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => void make('My script', BLANK)} data-testid="scripts.new">
          New
        </button>
      </div>
      <div className="scr-row">
        <select
          value=""
          aria-label="Start from an example"
          data-testid="scripts.examples"
          onChange={(e) => {
            const ex = EXAMPLES.find((x) => x.id === e.target.value);
            if (ex) void make(ex.name, ex.code);
          }}
        >
          <option value="">Start from an example...</option>
          {EXAMPLES.map((x) => (
            <option key={x.id} value={x.id} title={x.about}>
              {x.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ui-btn"
          onClick={async () => {
            const f = await pickUpload('.js,.txt,text/javascript');
            if (!f) return;
            // Opened from a file: somebody else's until it has been read.
            await make(f.name.replace(/\.[^.]+$/, ''), (await f.text()).slice(0, 100_000), false);
          }}
        >
          Open a .js file
        </button>
        <PlaceButton />
      </div>
    </div>
  );
}

export function ScriptsPanel() {
  const picked = openId.use((x) => x);
  const all = scripts.use((x) => x);
  const script = [...all.app, ...all.doc].find((s) => s.id === picked);
  return (
    <div className="scr-panel" data-help="scripts">
      <Picker />
      {script ? (
        <Editor key={script.id} script={script} />
      ) : (
        <div className="scr-empty">
          <p>
            A <strong>script</strong> is a few lines of JavaScript that do something in your drawing for you: turn the picked shapes red, put a marker every 12 frames, copy a thing along a trail.
          </p>
          <p>Pick <strong>New</strong>, or start from an example, then press <strong>Run</strong>.</p>
        </div>
      )}
    </div>
  );
}

setPanelOpener(() => {
  void import('./placeRun').then((p) => p.openScriptsPanel());
});

export { openScript, store };
