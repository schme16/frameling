// Registers selecting on pixel layers (the pixel Select tools, their commands and help) and the lasso. Loaded after
// the pixel area, since it takes over some of the Edit menu's commands. Each way of picking is its own tool now
// (src/select/ways.ts), so there is no icon to keep in step with a mode any more.
import './pixel-tool';
import './commands';
import './help';
