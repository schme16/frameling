// Live review, the drawing window's side: a code gives up to four people a read-only view of your drawing as you draw it. They
// point and leave notes, which come back to an inbox you keep from. The link is in the main process (src/main/review*.ts), the
// reviewer's window is the picture window with a review layer (src/popout/review), and the rules that make it read-only are in
// src/review (what is sent, what is accepted).
import './choices';
import './commands';
import './help';
