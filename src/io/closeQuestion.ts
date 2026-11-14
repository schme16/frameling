// The window is closing with unsaved work: the desktop side holds the close and hands the question to the page, which
// asks with Quill's dialog (see src/main/closeQuestion.ts for the other half).
import { desktop } from './desktop';
import { askSaveInPage } from './saveAsk';

export function startCloseQuestions(): () => void {
  const off = desktop()?.app.onCloseQuestion?.((q, shown, onWithdraw) => {
    const ctl = new AbortController();
    onWithdraw(() => ctl.abort());
    return askSaveInPage(q.name, q.neverSaved, { onShown: shown, signal: ctl.signal });
  });
  return off ?? (() => {});
}
