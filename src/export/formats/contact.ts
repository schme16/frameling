// A contact sheet: every frame as a small picture on one page, numbered, with the drawing's name on top.
import { drawFrame } from '../draw';
import { canvasBytes } from '../encode';
import { CONTACT_HEADER, CONTACT_MARGIN, contactLabelsOf, contactPageOf, contactProblem, contactSheetSize, contactSubtitle } from '../contact';
import { planFrames } from '../plan';
import { ExportProblem } from '../problem';
import { breathe } from '../runtime';
import type { ExporterRun } from '../registry';

const LOOKS = {
  light: { page: '#f4f4f7', edge: '#d3d3dc', text: '#3a3a46', quiet: '#7a7a88' },
  dark: { page: '#1c1c23', edge: '#3a3a47', text: '#e4e4ec', quiet: '#9494a4' },
};
const FONT = 'system-ui, "Segoe UI", Helvetica, Arial, sans-serif';

export const run: ExporterRun['run'] = async ({ doc, settings, signal }, { plan, bg, crisp, step }) => {
  const { thumb, layout } = contactSheetSize(doc, plan.count, settings);
  const problem = contactProblem(layout);
  if (problem) throw new ExportProblem(problem);
  const look = LOOKS[contactPageOf(settings)];
  const labels = contactLabelsOf(settings);
  const sheet = new OffscreenCanvas(layout.width, layout.height);
  const g = sheet.getContext('2d')!;
  g.fillStyle = look.page;
  g.fillRect(0, 0, layout.width, layout.height);
  g.textBaseline = 'alphabetic';
  g.fillStyle = look.text;
  g.font = `600 26px ${FONT}`;
  g.fillText(doc.name, CONTACT_MARGIN, CONTACT_MARGIN + 22, layout.width - CONTACT_MARGIN * 2);
  g.fillStyle = look.quiet;
  g.font = `15px ${FONT}`;
  g.fillText(contactSubtitle(plan.count, doc.fps, doc.width, doc.height), CONTACT_MARGIN, CONTACT_HEADER - 20, layout.width - CONTACT_MARGIN * 2);

  const scratch = new OffscreenCanvas(thumb.width, thumb.height);
  const numbers = planFrames(plan);
  for (let i = 0; i < plan.count; i++) {
    await breathe(signal, i);
    step(i, `Drawing frame ${i + 1} of ${plan.count}`);
    drawFrame(scratch, doc, numbers[i], { width: thumb.width, height: thumb.height, scale: thumb.width / doc.width, background: bg, crisp: crisp && thumb.width >= doc.width });
    const c = layout.cells[i];
    g.drawImage(scratch, c.x, c.y);
    g.strokeStyle = look.edge;
    g.lineWidth = 1;
    g.strokeRect(c.x - 0.5, c.y - 0.5, thumb.width + 1, thumb.height + 1);
    if (labels) {
      g.fillStyle = look.quiet;
      g.font = `13px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(String(numbers[i] + 1), c.x + thumb.width / 2, c.y + thumb.height + 17);
      g.textAlign = 'start';
    }
  }
  step(plan.count, 'Saving the picture');
  return { kind: 'file', name: `${plan.name}.png`, bytes: await canvasBytes(sheet, 'image/png') };
};
