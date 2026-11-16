// Registers the tools area's commands, panels, tools and help topics.
import './help';
import './drawing-help';
import './wells';
import './select';
import './brush';
import './pencil';
import './eraser';
import './shapes';
import './pen';
import './points';
import './polystar';
import './gradient-tool';
import './eyedropper';
import './view-tools';
import './edit-commands';
import './merge-mode';
import './combine';
import './lineStyle';
import './offset';
import './width';
import './quickshape';
import './rememberUi';
import './mirror-help';
import './recolour-open';

// Any fill tool the fill area adds (src/tools/fill*.ts) registers itself by being loaded here.
import.meta.glob(['./fill*.ts', '!./**/*.bodies.ts'], { eager: true });

// Pixel art tools, palette and commands. Last, since it adds mirror drawing to the brush and eraser above.
import '../pixel';
// Soft paint (airbrush, soft brush, soft eraser, highlighter, smudge) on pixel layers. After the pixel tools it builds on.
import '../soft';
// Chalk and charcoal on pixel layers, drawing onto paper. After soft paint, whose edge choice it shares.
import '../dry';
// The pixel brush (dabs, spacing, tips) and the pixel side of the brush library. After soft paint and charcoal, which it shares an edge answer and a library with.
import '../dab';
import '../select';
import '../clipboard';
import '../transform';
