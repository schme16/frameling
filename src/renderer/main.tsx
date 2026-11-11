// First, so the bridge (desktop or browser) is in place before anything uses it.
import '../platform/install';
import { createRoot } from 'react-dom/client';
import './theme.css';
import './styles.css';
import './features';
import { App } from './App';

const start = () => createRoot(document.getElementById('root')!).render(<App />);
// The ?debug hooks (screenshots, e2e checks) are their own download, in place before the app mounts.
if (new URLSearchParams(location.search).has('debug')) void import('./debug').then(start);
else start();
