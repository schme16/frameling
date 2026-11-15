// Palette commands for the chalk and charcoal tool: one for each medium and each paper, so "vine" or "rough" finds them.
import { registerCommands, type Command } from '../core/registry';
import { pickKindReason } from '../core/reasons';
import { toolEnabled } from '../ui/dynamic';
import { pickTool } from '../tools/pick';
import { MEDIA } from './maths';
import { PAPERS } from './paper';
import { getDry, setMedium, setPaper } from './settings';
import { DRY_TOOL } from './tools';

const KEYWORDS: Record<string, string[]> = {
  'vine-charcoal': ['charcoal', 'vine', 'willow', 'sketch', 'dusty'],
  'compressed-charcoal': ['charcoal', 'compressed', 'dark', 'black', 'stick'],
  chalk: ['chalk', 'blackboard', 'pavement', 'dusty'],
  'soft-pastel': ['pastel', 'soft', 'dry pastel'],
  'oil-pastel': ['pastel', 'oil', 'wax', 'waxy'],
  crayon: ['crayon', 'wax', 'kids'],
  'sketch-pencil': ['pencil', 'graphite', 'sketch', 'hb'],
  'soft-pencil': ['pencil', 'graphite', '6b', 'soft pencil'],
  'colour-pencil': ['pencil', 'colour', 'color', 'coloured pencil'],
};

const onPixel = () => toolEnabled(['pixel']);

const mediumCommands: Command[] = MEDIA.map((m) => ({
  id: `charcoal.medium.${m.id}`,
  label: `Draw with ${m.label.toLowerCase()}`,
  category: 'Pixel',
  description: m.hint,
  help: 'chalk-charcoal',
  keywords: ['medium', 'dry media', 'paper', 'grain', 'tooth', ...(KEYWORDS[m.id] ?? [])],
  layers: ['pixel'],
  enabled: onPixel,
  reason: pickKindReason(['pixel'], 'Chalk and charcoal'),
  checked: (s) => s.ui.tool === DRY_TOOL && getDry().medium === m.id,
  run: () => {
    setMedium(m.id);
    pickTool(DRY_TOOL);
  },
}));

const paperCommands: Command[] = PAPERS.map((p) => ({
  id: `charcoal.paper.${p.id}`,
  label: `Chalk and charcoal paper: ${p.label.toLowerCase()}`,
  category: 'Pixel',
  description: p.hint,
  help: 'chalk-charcoal',
  keywords: ['paper', 'grain', 'tooth', 'texture', 'charcoal', 'chalk', 'pastel', p.id],
  layers: ['pixel'],
  enabled: onPixel,
  reason: pickKindReason(['pixel'], 'Chalk and charcoal'),
  checked: () => getDry().paper === p.id,
  run: () => setPaper(p.id),
}));

registerCommands([...mediumCommands, ...paperCommands]);
