// Help for the pen, Edit points, and the polygon and star tools.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'tool-pen',
    order: 7,
    title: 'Pen',
    section: 'Drawing',
    media: 'tool-pen.mp4',
    summary: 'Draw exact lines and smooth curves point by point: click for corners, drag for curves (bezier paths).',
    keywords: ['pen', 'bezier', 'path', 'curve', 'vector', 'anchor', 'point', 'outline', 'inking', 'precise'],
  },
  {
    id: 'tool-points',
    order: 8,
    title: 'Edit points',
    section: 'Drawing',
    media: 'tool-points.png',
    summary: 'Reshape a shape by its points and curve handles: move points, bend curves, add or remove points (direct select).',
    keywords: ['direct select', 'direct selection', 'edit points', 'node', 'anchor', 'handle', 'bezier', 'reshape', 'corner', 'smooth', 'add point', 'delete point'],
  },
  {
    id: 'tool-polygon-star',
    order: 9,
    title: 'Polygon and star',
    section: 'Drawing',
    media: 'polygon-star.png',
    summary: 'Drag to draw a shape with straight sides (a polygon) or a star, with any number of sides or points.',
    keywords: ['polygon', 'star', 'hexagon', 'pentagon', 'triangle', 'octagon', 'shape', 'sides', 'points', 'sparkle'],
  },
]);
