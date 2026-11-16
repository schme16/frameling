// The two windows for sharing with a code: one shows your code while you wait, the other takes somebody else's. The story
// each tells is in shareState.ts; the network is on the desktop side (src/main/share.ts), reached through the bridge.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MAX_WRONG, maskedCode, parseCode, type ShareCode } from '../share/code';
import { useStreamSafe } from '../core/streamSafe';
import { openHelp } from '../ui/overlays';
import { desktop } from './desktop';
import { loadBytes } from './document';
import { Modal, mountModal } from './mount';
import { notify } from './notify';
import { sendCopy } from './sendCopy';
import { codeHint, nextReceive, nextSend, percent, startReceiveState, startSendState, timeLeft, type ReceiveState, type SendState } from './shareState';
import './share.css';

const HELP = 'share-with-a-code';

function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notify('Copied. Paste it wherever you like.', 'info', undefined, 2500);
  } catch {
    notify('Frameling could not copy that. Select the words and copy them yourself.', 'info', undefined, 4000);
  }
}

function Bar({ done, total }: { done: number; total: number }) {
  const p = percent(done, total);
  return (
    <div className="share-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label="How much has gone">
      <span style={{ width: `${p}%` }} />
    </div>
  );
}

/** The words that must be true of every way this can end badly: say what happened, and what to do instead. */
function FallbackNote({ close, who }: { close: () => void; who: 'send' | 'receive' }) {
  return (
    <p className="io-muted share-note" data-testid="share.fallback">
      Some networks, like a lot of offices, schools and mobile connections, don't let two computers connect to each other directly, and there is no go-between to
      help. {who === 'send' ? <>If that's you, <b>Send a copy</b> works anywhere.</> : <>If that's you, ask them to use <b>File &gt; Send a copy</b> instead, and open the file they send.</>}{' '}
      <button type="button" className="share-link" onClick={() => { close(); openHelp(HELP); }}>
        How it works
      </button>
    </p>
  );
}

// ------------------------------------------------------------------------------------------------------ sending

function SendDialog({ bytes, minutes, close }: { bytes: Uint8Array; minutes: number; close: () => void }) {
  const [state, setState] = useState<SendState>(startSendState);
  const [run, setRun] = useState(0);
  const safe = useStreamSafe();
  const [shown, setShown] = useState(false);
  const live = state.kind === 'waiting';
  const now = useNow(live);

  useEffect(() => {
    const api = desktop()?.share;
    if (!api) return;
    setState(startSendState);
    const off = api.onEvent((e) => {
      if (e.side === 'send') setState((s) => nextSend(s, e));
    });
    void api.send(bytes, { minutes });
    return () => {
      off();
      void api.cancel();
    };
  }, [run, bytes, minutes]);

  const instead = () => {
    close();
    void sendCopy();
  };
  const again = () => setRun((r) => r + 1);

  let body: ReactNode;
  let foot: ReactNode = (
    <button type="button" className="io-btn io-primary" data-testid="share.close" onClick={close}>
      Close
    </button>
  );
  switch (state.kind) {
    case 'starting':
      body = <p data-testid="share.status">Getting a code ready...</p>;
      foot = (
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
      );
      break;
    case 'waiting': {
      const parsed = parseCode(state.code);
      const code = parsed.ok ? parsed.code : null;
      const hide = safe && !shown && code;
      body = (
        <>
          <p>Tell them this code. They pick <b>File &gt; Receive with a code...</b> and type it in.</p>
          <div className="share-code" data-testid="share.code" aria-live="polite">
            {hide ? maskedCode(code as ShareCode) : state.code}
          </div>
          <div className="share-row">
            <button type="button" className="io-btn" data-testid="share.copy" onClick={() => void copyText(state.code)}>
              Copy the code
            </button>
            {hide ? (
              <button type="button" className="io-btn" onClick={() => setShown(true)}>
                Show the code
              </button>
            ) : null}
          </div>
          {state.wrong > 0 ? (
            <p className="share-warn" role="status" data-testid="share.wrong">
              Somebody tried the wrong code. {MAX_WRONG - state.wrong === 1 ? 'One try' : `${MAX_WRONG - state.wrong} tries`} left before this code stops working.
            </p>
          ) : null}
          <ul className="io-muted share-facts">
            <li>
              <b>Keep this window open</b>, and both of you need Frameling open at the same time.
            </li>
            <li data-testid="share.expires">It stops working in {timeLeft(state.expiresAt, now)}, after three wrong tries, or when you close this.</li>
            <li>Nothing is stored anywhere. The drawing goes straight from your computer to theirs.</li>
          </ul>
        </>
      );
      foot = (
        <>
          <button type="button" className="io-btn" data-testid="share.instead" onClick={instead}>
            Send a copy instead
          </button>
          <button type="button" className="io-btn io-primary" onClick={close}>
            Cancel
          </button>
        </>
      );
      break;
    }
    case 'sending':
      body = (
        <>
          <p data-testid="share.status">Connected. Sending your drawing...</p>
          <Bar done={state.done} total={state.total} />
        </>
      );
      foot = (
        <button type="button" className="io-btn" onClick={close}>
          Stop
        </button>
      );
      break;
    case 'sent':
      body = (
        <p data-testid="share.status">
          <b>Sent.</b> Your drawing is on their computer, and the code has stopped working. Nothing was kept.
        </p>
      );
      break;
    case 'burned':
      body = (
        <>
          <p data-testid="share.status">
            <b>That code has stopped.</b> Somebody tried the wrong code three times, so Frameling closed it. Nothing was sent.
          </p>
          <p className="io-muted">If that was you and your friend mistyping, no harm done: make a new code.</p>
        </>
      );
      foot = (
        <>
          <button type="button" className="io-btn" onClick={close}>
            Close
          </button>
          <button type="button" className="io-btn io-primary" data-testid="share.again" onClick={again}>
            Make a new code
          </button>
        </>
      );
      break;
    case 'expired':
      body = (
        <p data-testid="share.status">
          <b>The code ran out.</b> Nobody used it in time, so nothing was sent.
        </p>
      );
      foot = (
        <>
          <button type="button" className="io-btn" onClick={close}>
            Close
          </button>
          <button type="button" className="io-btn io-primary" data-testid="share.again" onClick={again}>
            Make a new code
          </button>
        </>
      );
      break;
    case 'offline':
      body = (
        <>
          <p data-testid="share.status">
            <b>Frameling couldn't get online to share this.</b> Check your connection and try again.
          </p>
          <FallbackNote close={close} who="send" />
        </>
      );
      foot = (
        <>
          <button type="button" className="io-btn" data-testid="share.instead" onClick={instead}>
            Send a copy instead
          </button>
          <button type="button" className="io-btn io-primary" data-testid="share.again" onClick={again}>
            Try again
          </button>
        </>
      );
      break;
    case 'stopped':
      body = <p data-testid="share.status">Stopped. Nothing was sent.</p>;
      break;
  }

  return (
    <Modal title="Send with a code" onClose={close} canClose>
      <div className="io-body" data-state={state.kind}>
        {body}
      </div>
      <div className="io-foot">{foot}</div>
    </Modal>
  );
}

/** Opens the window that makes a code for this drawing. `bytes` is the copy to send (see makeCopyBytes). */
export function openSendDialog(bytes: Uint8Array, minutes: number, onGone: () => void): () => void {
  return mountModal((close) => (
    <SendDialog
      bytes={bytes}
      minutes={minutes}
      close={() => {
        close();
        onGone();
      }}
    />
  ));
}

// ---------------------------------------------------------------------------------------------------- receiving

function ReceiveDialog({ close }: { close: () => void }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<ReceiveState>(startReceiveState);
  const parsed = useMemo(() => parseCode(text), [text]);
  const busy = state.kind === 'starting' || state.kind === 'looking' || state.kind === 'checking' || state.kind === 'receiving';

  useEffect(() => {
    const api = desktop()?.share;
    if (!api) return;
    const off = api.onEvent((e) => {
      if (e.side !== 'receive') return;
      setState((s) => nextReceive(s, e));
      // A wrong code or a dropped connection ends this try: let the network go, and offer another.
      if (e.type === 'wrong' || e.type === 'dropped') void api.cancel();
    });
    return () => {
      off();
      void api.cancel();
    };
  }, []);

  const go = () => {
    if (!parsed.ok) return;
    const api = desktop()?.share;
    if (!api) return;
    setState({ kind: 'starting' });
    void api.receive(text).then((r) => {
      if (!r.ok) setState({ kind: 'typing' });
    });
  };
  const back = () => setState({ kind: 'typing' });

  const open = async (bytes: Uint8Array) => {
    if (await loadBytes(bytes, null, { dirty: true })) close();
  };
  // The drawing is here: open it straight away. If that gets declined (unsaved work in the way), the buttons stay.
  const arrived = state.kind === 'received' ? state.bytes : null;
  useEffect(() => {
    if (arrived) void open(arrived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived]);

  const saveFile = async (bytes: Uint8Array) => {
    const r = await desktop()?.files.save({ bytes, path: null, suggestedName: 'Shared drawing' });
    if (r && !('error' in r)) close();
    else if (r && 'error' in r) notify(r.error, 'error');
  };

  let body: ReactNode;
  let foot: ReactNode;
  const cancel = (
    <button type="button" className="io-btn" data-testid="share.cancel" onClick={close}>
      Cancel
    </button>
  );
  if (state.kind === 'typing') {
    const hint = parsed.ok || text.trim() === '' ? '' : codeHint(parsed.why, parsed.ok ? undefined : parsed.word);
    body = (
      <form
        id="share-receive-form"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <p>Type the code they gave you. It's four words.</p>
        <label className="share-field">
          <span>Their code</span>
          <input
            data-autofocus=""
            data-testid="share.input"
            value={text}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            maxLength={80}
            placeholder="four words, like ocean-tiger-maple-spoon"
            aria-describedby="share-hint"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p id="share-hint" className="share-hint" data-testid="share.hint" role="status">
          {hint}
        </p>
        <p className="io-muted share-note">
          You both need Frameling open at the same time, and their <b>Send with a code</b> window still showing the code. Nothing is stored anywhere.
        </p>
      </form>
    );
    foot = (
      <>
        {cancel}
        <button type="submit" form="share-receive-form" className="io-btn io-primary" data-testid="share.go" disabled={!parsed.ok}>
          Connect
        </button>
      </>
    );
  } else if (busy) {
    body =
      state.kind === 'receiving' ? (
        <>
          <p data-testid="share.status">Receiving the drawing...</p>
          <Bar done={state.done} total={state.total} />
        </>
      ) : state.kind === 'checking' ? (
        <p data-testid="share.status">Found them. Checking the code...</p>
      ) : (
        <>
          <p data-testid="share.status">Looking for them...</p>
          <p className="io-muted share-note">This can take up to half a minute. They need to still have the code showing.</p>
        </>
      );
    foot = cancel;
  } else if (state.kind === 'received') {
    body = (
      <p data-testid="share.status">
        <b>Got it.</b> Opening the drawing now.
      </p>
    );
    foot = (
      <>
        <button type="button" className="io-btn" onClick={() => void saveFile(state.bytes)}>
          Save it as a file...
        </button>
        <button type="button" className="io-btn io-primary" data-testid="share.open" onClick={() => void open(state.bytes)}>
          Open it
        </button>
      </>
    );
  } else {
    const tryAgain = (
      <button type="button" className="io-btn io-primary" data-testid="share.again" onClick={back}>
        Try again
      </button>
    );
    foot = (
      <>
        <button type="button" className="io-btn" onClick={close}>
          Close
        </button>
        {tryAgain}
      </>
    );
    if (state.kind === 'wrong' || state.kind === 'refused') {
      body = (
        <>
          <p data-testid="share.status">
            <b>That code didn't match.</b> Check the four words with them. The order matters.
          </p>
          <p className="io-muted share-note">
            A code stops working after three wrong tries, so if it still doesn't work, ask them for a new one.
          </p>
        </>
      );
    } else if (state.kind === 'dropped') {
      body = (
        <p data-testid="share.status">
          <b>The connection dropped before it finished.</b> Nothing was kept. Ask them to leave the code showing, and try again.
        </p>
      );
    } else if (state.kind === 'offline') {
      body = (
        <>
          <p data-testid="share.status">
            <b>Frameling couldn't get online to look for them.</b> Check your connection and try again.
          </p>
          <FallbackNote close={close} who="receive" />
        </>
      );
    } else {
      body = (
        <>
          <p data-testid="share.status">
            <b>Couldn't connect.</b> Nobody answered that code.
          </p>
          <ul className="io-muted share-facts">
            <li>Check the words with them.</li>
            <li>They need Frameling open, with their code still showing and not run out.</li>
          </ul>
          <FallbackNote close={close} who="receive" />
        </>
      );
    }
  }

  return (
    <Modal title="Receive with a code" onClose={close} canClose>
      <div className="io-body" data-state={state.kind}>
        {body}
      </div>
      <div className="io-foot">{foot}</div>
    </Modal>
  );
}

export function openReceiveDialog(): () => void {
  return mountModal((close) => <ReceiveDialog close={close} />);
}
