// The entry of the picture window (popout.html). A page of its own, built apart from the app (vite.popout.config.ts), so
// opening it loads only what painting needs, none of the panels, commands or tools.
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/nunito';
import { PopoutPage } from '../popout/page';

// ?review=1 is the reviewer's window (made by the desktop side for a live review): the same page with the review layer on.
const review = new URLSearchParams(window.location.search).has('review');
createRoot(document.getElementById('root')!).render(<PopoutPage review={review} />);
