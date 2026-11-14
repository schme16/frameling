// The entry of the picture window (popout.html). A page of its own, built apart from the app (vite.popout.config.ts), so
// opening it loads only what painting needs, none of the panels, commands or tools.
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/nunito';
import { PopoutPage } from '../popout/page';

createRoot(document.getElementById('root')!).render(<PopoutPage />);
