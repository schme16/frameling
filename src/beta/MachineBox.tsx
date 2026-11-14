// The details of this computer that go in a report, in plain rows: shown above the exact text so the processor and the
// graphics card are read, not buried in the middle of it. It reads the same object that is sent.
import { machineRows, type MachineFacts } from './machine';

export function MachineBox({ machine }: { machine: MachineFacts }) {
  return (
    <section className="bt-machine" aria-label="About this computer, goes in the report" data-testid="report.machine">
      <h4>About this computer (this goes too)</h4>
      <dl>
        {machineRows(machine).map(([label, value]) => (
          <div key={label} className="bt-machine-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="tb-note">The same facts are in the exact text below, with a little more about the drawing engine.</p>
    </section>
  );
}
