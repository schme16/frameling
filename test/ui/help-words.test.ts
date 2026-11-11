// @vitest-environment jsdom
// Help search finds the plain words people type, not just the names Frameling uses. Each word should bring up the
// topic it means in the top three. Add a pair here when someone can't find something.
import { describe, expect, it } from 'vitest';
import { searchHelp } from '../../src/ui/help/search';
import '../../src/renderer/features';

const Q: [string, string][] = [
  ['rubber', 'tool-eraser'], ['erase', 'tool-eraser'], ['rub out', 'tool-eraser'], ['pan', 'canvas-navigation'], ['move the page', 'canvas-navigation'], ['zoom', 'tool-zoom'],
  ['pick colour', 'tool-eyedropper'], ['colour picker', 'tool-eyedropper'], ['mirror', 'flip'], ['bring to front', 'arrange'], ['layer order', 'arrange'], ['on top', 'arrange'],
  ['save', 'saving-and-opening'], ['crash', 'autosave'], ['lost my work', 'autosave'], ['recover', 'autosave'], ['rename', 'document-name'], ['title', 'document-name'],
  ['inches', 'units'], ['print size', 'units'], ['dark mode', 'look-and-feel'], ['night mode', 'look-and-feel'], ['video', 'export-video-gif-apng'], ['gif', 'export-video-gif-apng'],
  ['ghost', 'timeline-onion'], ['skeleton', 'rig'], ['puppet', 'rig'], ['talking', 'lip-sync'], ['mouth', 'lip-sync'], ['music', 'sound'], ['audio', 'sound'],
  ['background sketch', 'reference-layers'], ['trace', 'reference-layers'], ['blur', 'effects'], ['shadow', 'effects'], ['snow', 'particles'], ['sparkles', 'particles'],
  ['resize canvas', 'canvas-size'], ['frame rate', 'canvas-size'], ['fps', 'canvas-size'], ['grid', 'pixel-grid'], ['straight line', 'tool-line'], ['square', 'tool-rect'], ['circle', 'tool-ellipse'],
  ['words', 'text'], ['type', 'text'], ['rotate', 'selecting'], ['scale', 'selecting'], ['tween', 'tweens'], ['in between', 'tweens'], ['morph', 'shape-tweens'], ['shortcut', 'keyboard-shortcuts'],
  ['undo', 'undo'], ['go back', 'undo'], ['mistake', 'undo'], ['transparent background', 'export-video-gif-apng'], ['overview', 'whats-in-frameling'], ['features', 'whats-in-frameling'], ['what can it do', 'whats-in-frameling'],
  ['tutorial', 'quests'], ['lesson', 'quests'], ['loop', 'timeline-playing'], ['play', 'timeline-playing'], ['speed', 'timeline-playing'], ['paint bucket', 'fill'], ['fill colour', 'fill-and-stroke'],
  ['outline colour', 'fill-and-stroke'], ['sprite sheet', 'export-sprite-sheets'], ['game', 'export-sprite-sheets'], ['copy', 'copy-paste'], ['paste', 'copy-paste'], ['delete', 'duplicate-delete'],
  ['remove', 'duplicate-delete'], ['palette', 'palette'], ['8 bit', 'pixel-art'], ['retro', 'pixel-art'], ['hand tool', 'tool-hand'], ['move tool', 'tool-select'], ['select', 'tool-select'],
  ['layers', 'timeline-layers'], ['new layer', 'timeline-layers'], ['hide layer', 'timeline-layers'], ['camera', 'camera'], ['parallax', 'camera'], ['reuse', 'symbols'], ['ease', 'easing'], ['slow in slow out', 'easing'],
  ['bounce', 'easing'], ['theme', 'themes'], ['colours of the app', 'themes'], ['panel', 'panels'], ['missing panel', 'panels'], ['layout', 'workspaces'], ['help', 'using-help'], ['search', 'command-palette'],
  ['plugin', 'plugins'], ['new drawing', 'new-document'], ['template', 'templates-yours'], ['mascot', 'meet-quill'], ['frames', 'timeline-frames'], ['hold', 'timeline-frames'], ['keyframe', 'timeline-frames'],
  ['smooth line', 'tool-brush'], ['pressure', 'tool-brush'], ['pen', 'tool-brush'], ['thin line', 'tool-pencil'], ['sketch', 'tool-pencil'], ['lasso', 'lasso'], ['gap', 'fill-gaps'], ['leak', 'fill-gaps'],
];


describe('help search in plain words', () => {
  it('finds the topic people mean in the top three', () => {
    const missed = Q.filter(([q, id]) => {
      const at = searchHelp(q, 12).map((h) => h.topic.id).indexOf(id);
      return at < 0 || at > 2;
    });
    expect(missed).toEqual([]);
  });
});
