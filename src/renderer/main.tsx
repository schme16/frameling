// First, so the bridge (desktop or browser) is in place before anything uses it.
import '../platform/install';
import { createRoot } from 'react-dom/client';
import './theme.css';
import './styles.css';
import './features';
import './debug';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
