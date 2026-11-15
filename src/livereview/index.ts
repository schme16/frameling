// Live review, the drawing window's side: a code gives up to four people a read-only view of your drawing as you draw it. They
// point and leave notes, which come back to an inbox you keep from. The link is in the main process (src/main/review*.ts), the
// reviewer's window is the picture window with a review layer (src/popout/review), and the rules that make it read-only are in
// src/review (what is sent, what is accepted).
import './choices';
import './commands';
import './help';
import { listenForLinks } from './link';

// A review link that started Frameling (or arrived while it ran) asks the person; it never joins by itself.
if (typeof window !== 'undefined') {
  if (document.readyState === 'complete') listenForLinks();
  else window.addEventListener('load', listenForLinks, { once: true });
}
