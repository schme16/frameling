import { createRoot } from 'react-dom/client';
import './theme.css';
import './styles.css';
import './features';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
