// What came in and what didn't. A short toast after an import, and a plain list behind its button: nothing the file
// asked for is dropped without being named.
import { Modal, mountModal } from '../io/mount';
import { notify } from '../io/notify';
import './import.css';

export interface ImportReport {
  /** What was brought in: "Brought in "logo.svg": 14 shapes on 2 layers." */
  headline: string;
  /** What could not come across, in sentences. */
  left: string[];
  /** Good to know, not a loss. */
  info: string[];
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

function ReportDialog({ report, close }: { report: ImportReport; close: () => void }) {
  return (
    <Modal title="What came in" onClose={close} wide>
      <div className="io-body" data-testid="import.report">
        <p>{report.headline}</p>
        {report.left.length > 0 && (
          <>
            <p className="io-muted">
              <b>Not brought in:</b>
            </p>
            <ul className="imp-list" data-testid="import.report.left">
              {report.left.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </>
        )}
        {report.info.length > 0 && (
          <>
            <p className="io-muted">
              <b>Good to know:</b>
            </p>
            <ul className="imp-list" data-testid="import.report.info">
              {report.info.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </>
        )}
        <p className="io-muted">Everything else came across as it was. Undo takes it all back in one step.</p>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn io-primary" data-autofocus="" onClick={close}>
          Got it
        </button>
      </div>
    </Modal>
  );
}

export const showImportReport = (report: ImportReport): void => void mountModal((close) => <ReportDialog report={report} close={close} />);

/** The toast after an import: plain when everything came in, a warning with a button when something didn't. */
export function reportImport(report: ImportReport): void {
  const { headline, left, info } = report;
  if (left.length) {
    notify(`${headline} ${plural(left.length, 'thing')} couldn't be brought in.`, 'warn', { label: 'See what was left out', run: () => showImportReport(report) }, 14000);
  } else if (info.length) {
    notify(headline, 'success', { label: 'Good to know', run: () => showImportReport(report) }, 9000);
  } else notify(headline, 'success', undefined, 6000);
}
