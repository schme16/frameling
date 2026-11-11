// A placeholder welcome screen until the real shell (dock, canvas, timeline) lands in phase 0.
export function App() {
  const v = window.frameling?.versions;
  return (
    <main className="welcome">
      <div className="mascot" aria-hidden="true">
        <span className="page p1" />
        <span className="page p2" />
        <span className="page p3" />
      </div>
      <h1>Frameling</h1>
      <p>Draw it, then make it move.</p>
      <p className="soon">The drawing tools are on their way.</p>
      {v && <p className="version">Version {v.app || 'dev'} · Electron {v.electron}</p>}
    </main>
  );
}
